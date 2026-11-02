/* Identity: usernames, invite codes, and admin approval. Nothing works for an account until the admin approves it. */

begin;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text not null default '' check (char_length(display_name) <= 60),
  avatar_path text,
  status_text text not null default '' check (char_length(status_text) <= 140),
  last_seen_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  is_admin boolean not null default false,
  invited_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);
create index profiles_status on public.profiles (status);

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  created_by uuid references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  used_by uuid references public.profiles(id) on delete set null,
  used_at timestamptz
);
create index invites_creator on public.invites (created_by);

create function public.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false);
$$;

create function public.is_approved()
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce((select p.status = 'approved' from public.profiles p where p.id = auth.uid()), false);
$$;

/* Runs on every sign up. The very first account becomes the admin. Every other one needs a valid unused invite code and starts as pending. */
create function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_code text := upper(btrim(coalesce(new.raw_user_meta_data ->> 'invite_code', '')));
  v_username text := lower(btrim(coalesce(new.raw_user_meta_data ->> 'username', '')));
  v_name text := btrim(coalesce(new.raw_user_meta_data ->> 'display_name', ''));
  v_first boolean := not exists (select 1 from public.profiles);
  v_invite public.invites;
begin
  if v_username !~ '^[a-z0-9_]{3,20}$' then
    raise exception 'invalid username';
  end if;
  if exists (select 1 from public.profiles where username = v_username) then
    raise exception 'username taken';
  end if;
  if not v_first then
    select * into v_invite from public.invites
    where code = v_code and used_by is null and expires_at > now()
    for update;
    if v_invite.id is null then
      raise exception 'invalid invite code';
    end if;
  end if;

  insert into public.profiles (id, username, display_name, status, is_admin, invited_by, approved_at)
  values (
    new.id, v_username, left(coalesce(nullif(v_name, ''), v_username), 60),
    case when v_first then 'approved' else 'pending' end,
    v_first,
    case when v_first then null else v_invite.created_by end,
    case when v_first then now() else null end
  );

  if not v_first then
    update public.invites set used_by = new.id, used_at = now() where id = v_invite.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

/* Lets the sign up screen show a clear message before the account is created. */
create function public.check_signup(p_username text, p_code text)
returns text language plpgsql stable security definer set search_path = ''
as $$
declare
  v_username text := lower(btrim(coalesce(p_username, '')));
begin
  if v_username !~ '^[a-z0-9_]{3,20}$' then
    return 'username_invalid';
  end if;
  if exists (select 1 from public.profiles where username = v_username) then
    return 'username_taken';
  end if;
  if not exists (select 1 from public.profiles) then
    return 'ok';
  end if;
  if exists (
    select 1 from public.invites
    where code = upper(btrim(coalesce(p_code, ''))) and used_by is null and expires_at > now()
  ) then
    return 'ok';
  end if;
  return 'invalid_code';
end;
$$;

/* Each approved person can create up to 5 invite codes. The admin has no limit. */
create function public.create_invite()
returns text language plpgsql security definer set search_path = ''
as $$
declare
  v_code text;
begin
  if not public.is_approved() then
    raise exception 'not approved';
  end if;
  if not public.is_admin()
     and (select count(*) from public.invites where created_by = auth.uid()) >= 5 then
    raise exception 'invite limit reached';
  end if;
  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  insert into public.invites (code, created_by) values (v_code, auth.uid());
  return v_code;
end;
$$;

create function public.list_pending()
returns table (id uuid, username text, display_name text, email text, invited_by_username text, created_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed';
  end if;
  return query
    select p.id, p.username, p.display_name, u.email::text, ip.username, p.created_at
    from public.profiles p
    join auth.users u on u.id = p.id
    left join public.profiles ip on ip.id = p.invited_by
    where p.status = 'pending'
    order by p.created_at;
end;
$$;

create function public.set_account_status(p_user uuid, p_status text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed';
  end if;
  if p_status not in ('approved', 'rejected') then
    raise exception 'invalid status';
  end if;
  if p_user = auth.uid() then
    raise exception 'cannot change your own status';
  end if;
  update public.profiles
  set status = p_status, approved_at = case when p_status = 'approved' then now() else null end
  where id = p_user;
end;
$$;

alter table public.profiles enable row level security;
alter table public.invites enable row level security;

create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.is_admin());
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy invites_select on public.invites for select to authenticated
  using (created_by = (select auth.uid()) or public.is_admin());

revoke all on public.profiles, public.invites from anon, authenticated;
grant select on public.profiles, public.invites to authenticated;
grant update (display_name, avatar_path, status_text, last_seen_at) on public.profiles to authenticated;

revoke all on function public.is_admin() from public, anon;
revoke all on function public.is_approved() from public, anon;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.check_signup(text, text) from public;
revoke all on function public.create_invite() from public, anon;
revoke all on function public.list_pending() from public, anon;
revoke all on function public.set_account_status(uuid, text) from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_approved() to authenticated;
grant execute on function public.check_signup(text, text) to anon, authenticated;
grant execute on function public.create_invite() to authenticated;
grant execute on function public.list_pending() to authenticated;
grant execute on function public.set_account_status(uuid, text) to authenticated;

commit;
