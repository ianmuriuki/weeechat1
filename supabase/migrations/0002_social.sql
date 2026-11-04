begin;

create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint friendships_different_people check (requester_id <> addressee_id)
);

create unique index friendships_one_pair
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index friendships_requester on public.friendships (requester_id, status);
create index friendships_addressee on public.friendships (addressee_id, status);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('direct', 'group')),
  title text check (title is null or char_length(title) between 1 and 80),
  avatar_path text,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  direct_key text unique,
  constraint direct_key_kind check (
    (kind = 'direct' and direct_key is not null) or
    (kind = 'group' and direct_key is null)
  )
);

create index conversations_created on public.conversations (created_at desc);

create table public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('member', 'admin')),
  joined_at timestamptz not null default now(),
  last_read_at timestamptz,
  primary key (conversation_id, user_id)
);

create index conversation_members_user on public.conversation_members (user_id, conversation_id);

create or replace function public.is_member(p_conversation uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select public.is_approved() and exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id = p_conversation
      and cm.user_id = auth.uid()
  );
$$;

create or replace function public.is_conversation_admin(p_conversation uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select public.is_member(p_conversation) and exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id = p_conversation
      and cm.user_id = auth.uid()
      and cm.role = 'admin'
  );
$$;

create or replace function public.shares_conversation(p_user uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select public.is_approved() and exists (
    select 1
    from public.conversation_members mine
    join public.conversation_members theirs on theirs.conversation_id = mine.conversation_id
    where mine.user_id = auth.uid()
      and theirs.user_id = p_user
  );
$$;

create or replace function public.find_user(p_username text)
returns table (id uuid, username text, display_name text, avatar_path text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_approved() then
    raise exception 'not approved';
  end if;
  return query
    select p.id, p.username, p.display_name, p.avatar_path
    from public.profiles p
    where p.username = lower(btrim(p_username))
      and p.id <> auth.uid()
      and p.status = 'approved'
      and not exists (
        select 1
        from public.friendships f
        where (f.requester_id = auth.uid() and f.addressee_id = p.id)
           or (f.requester_id = p.id and f.addressee_id = auth.uid())
      );
end;
$$;

create or replace function public.send_friend_request(p_user uuid)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.is_approved() then raise exception 'not approved'; end if;
  if p_user = auth.uid() then raise exception 'cannot add yourself'; end if;
  if not exists (select 1 from public.profiles where id = p_user and status = 'approved') then
    raise exception 'account not found';
  end if;
  select f.id into v_id
  from public.friendships f
  where (f.requester_id = auth.uid() and f.addressee_id = p_user)
     or (f.requester_id = p_user and f.addressee_id = auth.uid());
  if v_id is not null then raise exception 'friend request already exists'; end if;
  insert into public.friendships (requester_id, addressee_id)
  values (auth.uid(), p_user)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.respond_friend_request(p_request uuid, p_accept boolean)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_friend public.friendships;
  v_conversation uuid;
  v_key text;
begin
  if not public.is_approved() then raise exception 'not approved'; end if;
  select * into v_friend
  from public.friendships
  where id = p_request
    and addressee_id = auth.uid()
    and status = 'pending'
  for update;
  if v_friend.id is null then raise exception 'request not found'; end if;
  if not p_accept then
    update public.friendships set status = 'declined', updated_at = now() where id = p_request;
    return null;
  end if;
  update public.friendships set status = 'accepted', updated_at = now() where id = p_request;
  v_key := least(v_friend.requester_id, v_friend.addressee_id)::text || ':' || greatest(v_friend.requester_id, v_friend.addressee_id)::text;
  select id into v_conversation from public.conversations where direct_key = v_key;
  if v_conversation is null then
    insert into public.conversations (kind, created_by, direct_key)
    values ('direct', auth.uid(), v_key)
    returning id into v_conversation;
    insert into public.conversation_members (conversation_id, user_id, role)
    values
      (v_conversation, v_friend.requester_id, 'member'),
      (v_conversation, v_friend.addressee_id, 'member');
  end if;
  return v_conversation;
end;
$$;

create or replace function public.remove_friend(p_user uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_approved() then raise exception 'not approved'; end if;
  delete from public.friendships
  where status = 'accepted'
    and ((requester_id = auth.uid() and addressee_id = p_user)
      or (requester_id = p_user and addressee_id = auth.uid()));
end;
$$;

create or replace function public.block_user(p_user uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_approved() then raise exception 'not approved'; end if;
  if p_user = auth.uid() then raise exception 'cannot block yourself'; end if;
  insert into public.friendships (requester_id, addressee_id, status)
  values (auth.uid(), p_user, 'blocked')
  on conflict (least(requester_id, addressee_id), greatest(requester_id, addressee_id))
  do update set status = 'blocked', updated_at = now();
end;
$$;

create or replace function public.create_group(p_title text, p_members uuid[])
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_conversation uuid;
  v_members uuid[];
begin
  if not public.is_approved() then raise exception 'not approved'; end if;
  if char_length(btrim(p_title)) not between 1 and 80 then raise exception 'invalid group title'; end if;
  v_members := array(select distinct unnest(coalesce(p_members, '{}'::uuid[])));
  if cardinality(v_members) < 1 then raise exception 'a group needs members'; end if;
  if cardinality(v_members) + 1 > 50 then raise exception 'group limit reached'; end if;
  if exists (
    select 1 from unnest(v_members) member_id
    where member_id = auth.uid()
      or not exists (
        select 1 from public.friendships f
        where f.status = 'accepted'
          and ((f.requester_id = auth.uid() and f.addressee_id = member_id)
            or (f.requester_id = member_id and f.addressee_id = auth.uid()))
      )
  ) then raise exception 'every member must be an accepted friend'; end if;
  insert into public.conversations (kind, title, created_by)
  values ('group', btrim(p_title), auth.uid())
  returning id into v_conversation;
  insert into public.conversation_members (conversation_id, user_id, role)
  select v_conversation, member_id, case when member_id = auth.uid() then 'admin' else 'member' end
  from unnest(array_append(v_members, auth.uid())) member_id;
  return v_conversation;
end;
$$;

create or replace function public.add_group_member(p_conversation uuid, p_user uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_conversation_admin(p_conversation) then raise exception 'not allowed'; end if;
  if not exists (select 1 from public.profiles where id = p_user and status = 'approved') then raise exception 'account not found'; end if;
  if (select count(*) from public.conversation_members where conversation_id = p_conversation) >= 50 then raise exception 'group limit reached'; end if;
  if exists (select 1 from public.conversation_members where conversation_id = p_conversation and user_id = p_user) then raise exception 'already a member'; end if;
  insert into public.conversation_members (conversation_id, user_id) values (p_conversation, p_user);
end;
$$;

create or replace function public.remove_group_member(p_conversation uuid, p_user uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_conversation_admin(p_conversation) or p_user = auth.uid() then raise exception 'not allowed'; end if;
  delete from public.conversation_members where conversation_id = p_conversation and user_id = p_user;
end;
$$;

create or replace function public.leave_group(p_conversation uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_member(p_conversation) then raise exception 'not allowed'; end if;
  delete from public.conversation_members where conversation_id = p_conversation and user_id = auth.uid();
end;
$$;

alter table public.friendships enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;

drop policy profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or public.is_admin()
    or (public.is_approved() and (public.shares_conversation(id) or exists (
      select 1 from public.friendships f
      where f.status = 'pending'
        and ((f.requester_id = auth.uid() and f.addressee_id = id)
          or (f.requester_id = id and f.addressee_id = auth.uid()))
    )))
  );

create policy friendships_select on public.friendships for select to authenticated
  using (requester_id = (select auth.uid()) or addressee_id = (select auth.uid()));
create policy friendships_insert on public.friendships for insert to authenticated
  with check (requester_id = (select auth.uid()) and public.is_approved());
create policy friendships_update on public.friendships for update to authenticated
  using (addressee_id = (select auth.uid()) or requester_id = (select auth.uid()))
  with check (addressee_id = (select auth.uid()) or requester_id = (select auth.uid()));

create policy conversations_select on public.conversations for select to authenticated
  using (public.is_member(id));
create policy members_select on public.conversation_members for select to authenticated
  using (public.is_member(conversation_id));
create policy members_update on public.conversation_members for update to authenticated
  using (public.is_conversation_admin(conversation_id))
  with check (public.is_conversation_admin(conversation_id));

revoke all on public.friendships, public.conversations, public.conversation_members from anon, authenticated;
grant select on public.friendships, public.conversations, public.conversation_members to authenticated;
grant update (status, updated_at) on public.friendships to authenticated;
grant update (last_read_at) on public.conversation_members to authenticated;

revoke all on function public.is_member(uuid) from public, anon;
revoke all on function public.is_conversation_admin(uuid) from public, anon;
revoke all on function public.shares_conversation(uuid) from public, anon;
revoke all on function public.find_user(text) from public, anon;
revoke all on function public.send_friend_request(uuid) from public, anon;
revoke all on function public.respond_friend_request(uuid, boolean) from public, anon;
revoke all on function public.remove_friend(uuid) from public, anon;
revoke all on function public.block_user(uuid) from public, anon;
revoke all on function public.create_group(text, uuid[]) from public, anon;
revoke all on function public.add_group_member(uuid, uuid) from public, anon;
revoke all on function public.remove_group_member(uuid, uuid) from public, anon;
revoke all on function public.leave_group(uuid) from public, anon;
grant execute on function public.is_member(uuid) to authenticated;
grant execute on function public.is_conversation_admin(uuid) to authenticated;
grant execute on function public.shares_conversation(uuid) to authenticated;
grant execute on function public.find_user(text) to authenticated;
grant execute on function public.send_friend_request(uuid) to authenticated;
grant execute on function public.respond_friend_request(uuid, boolean) to authenticated;
grant execute on function public.remove_friend(uuid) to authenticated;
grant execute on function public.block_user(uuid) to authenticated;
grant execute on function public.create_group(text, uuid[]) to authenticated;
grant execute on function public.add_group_member(uuid, uuid) to authenticated;
grant execute on function public.remove_group_member(uuid, uuid) to authenticated;
grant execute on function public.leave_group(uuid) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy avatars_select on storage.objects for select to authenticated
  using (
    bucket_id = 'avatars'
    and public.is_approved()
    and case
      when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then public.shares_conversation(((storage.foldername(name))[1])::uuid) or (storage.foldername(name))[1] = auth.uid()::text
      else false
    end
  );

create policy avatars_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.is_approved()
  );

create policy avatars_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text and public.is_approved())
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text and public.is_approved());

create policy avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text and public.is_approved());

alter table public.friendships replica identity full;
alter table public.conversations replica identity full;
alter table public.conversation_members replica identity full;
alter publication supabase_realtime add table public.friendships, public.conversations, public.conversation_members, public.profiles;

commit;
