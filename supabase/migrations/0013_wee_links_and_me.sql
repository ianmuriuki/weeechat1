/* Me and Wee. Every account has Me, a private space. Two accounts can be linked into Wee after the admin approves.
   Ported from the old weee tables (old 0004 and 0005) and scoped to an active link. Run once, applies after 0012. */

begin;

/* ============ HELPERS ============ */

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

/* Sends one Expo push to the given users on the alerts channel. Never callable by clients. */
create or replace function public.weee_push_users(p_users uuid[], p_title text, p_body text, p_data jsonb)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_msgs jsonb;
begin
  select jsonb_agg(jsonb_build_object(
           'to', t.token,
           'title', coalesce(nullif(btrim(p_title), ''), 'Weeez'),
           'body', left(coalesce(p_body, ''), 200),
           'sound', 'default',
           'channelId', 'alerts',
           'priority', 'high',
           'data', coalesce(p_data, '{}'::jsonb)
         ))
    into v_msgs
  from public.push_tokens t
  where t.user_id = any(p_users);

  if v_msgs is not null then
    perform net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      body := v_msgs,
      headers := jsonb_build_object('Content-Type', 'application/json', 'Accept', 'application/json')
    );
  end if;
exception when others then
  raise warning 'weee_push_users failed: %', sqlerrm;
end;
$$;

/* Pushes to the other person in the active link that belongs to this conversation. */
create or replace function public.weee_push_partner(p_conversation uuid, p_actor uuid, p_body text)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_title text;
  v_users uuid[];
begin
  select coalesce(nullif(btrim(p.display_name), ''), 'New activity') into v_title
  from public.profiles p where p.id = p_actor;

  select array_agg(x.u) into v_users
  from (
    select l.user_a as u from public.wee_links l where l.conversation_id = p_conversation and l.status = 'active'
    union
    select l.user_b as u from public.wee_links l where l.conversation_id = p_conversation and l.status = 'active'
  ) x
  where x.u <> p_actor;

  if v_users is not null then
    perform public.weee_push_users(v_users, coalesce(v_title, 'New activity'), p_body, jsonb_build_object('type', 'weee', 'conversationId', p_conversation));
  end if;
exception when others then
  raise warning 'weee_push_partner failed: %', sqlerrm;
end;
$$;

/* ============ LINKS AND FEATURE SWITCHES ============ */

create table public.wee_links (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references auth.users(id) on delete cascade,
  user_b uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('pending_partner', 'pending_admin', 'active', 'declined', 'revoked')),
  decided_by uuid references auth.users(id) on delete set null,
  active_since timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wee_links_ordered check (user_a < user_b),
  constraint wee_links_requester check (requested_by in (user_a, user_b))
);
create unique index wee_links_one_open on public.wee_links (user_a, user_b)
  where status in ('pending_partner', 'pending_admin', 'active');
create index wee_links_a on public.wee_links (user_a, status);
create index wee_links_b on public.wee_links (user_b, status);
create index wee_links_conversation on public.wee_links (conversation_id);
create trigger wee_links_touch before update on public.wee_links
  for each row execute function public.touch_updated_at();

/* A missing row means the feature is on. Only the admin can write these. */
create table public.account_features (
  user_id uuid not null references auth.users(id) on delete cascade,
  feature text not null check (feature in ('plans', 'workouts', 'checkin', 'habits')),
  enabled boolean not null default true,
  primary key (user_id, feature)
);

create table public.wee_link_features (
  link_id uuid not null references public.wee_links(id) on delete cascade,
  feature text not null check (feature in ('days', 'nudges', 'question', 'week', 'plans', 'checkin', 'workouts')),
  enabled boolean not null default true,
  primary key (link_id, feature)
);

create or replace function public.account_feature_on(p_feature text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select public.is_approved() and not exists (
    select 1 from public.account_features f
    where f.user_id = auth.uid() and f.feature = p_feature and not f.enabled
  );
$$;

/* True when the signed in user is in an active link for this conversation and the feature is on for that link. */
create or replace function public.wee_on(p_conversation uuid, p_feature text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select public.is_approved() and exists (
    select 1 from public.wee_links l
    where l.conversation_id = p_conversation
      and l.status = 'active'
      and auth.uid() in (l.user_a, l.user_b)
      and not exists (
        select 1 from public.wee_link_features f
        where f.link_id = l.id and f.feature = p_feature and not f.enabled
      )
  );
$$;

/* ---- linking flow ---- */

create or replace function public.request_wee_link(p_user uuid)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_conv uuid;
  v_id uuid;
  v_me text;
begin
  if not public.is_approved() then raise exception 'not approved'; end if;
  if p_user is null or p_user = auth.uid() then raise exception 'cannot link with yourself'; end if;
  perform pg_advisory_xact_lock(hashtext('wee_links'));
  if not exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = auth.uid() and f.addressee_id = p_user) or (f.requester_id = p_user and f.addressee_id = auth.uid()))
  ) then raise exception 'you can only link with a friend'; end if;
  if not exists (select 1 from public.profiles where id = p_user and status = 'approved') then raise exception 'account not found'; end if;
  if exists (
    select 1 from public.wee_links l
    where l.status in ('pending_partner', 'pending_admin', 'active')
      and (auth.uid() in (l.user_a, l.user_b) or p_user in (l.user_a, l.user_b))
  ) then raise exception 'one of you already has a Wee link or request'; end if;
  select c.id into v_conv from public.conversations c
  where c.direct_key = least(auth.uid(), p_user)::text || ':' || greatest(auth.uid(), p_user)::text;
  if v_conv is null then raise exception 'no direct chat found'; end if;
  insert into public.wee_links (user_a, user_b, conversation_id, requested_by, status)
  values (least(auth.uid(), p_user), greatest(auth.uid(), p_user), v_conv, auth.uid(), 'pending_partner')
  returning id into v_id;
  select coalesce(nullif(btrim(display_name), ''), 'Someone') into v_me from public.profiles where id = auth.uid();
  perform public.weee_push_users(array[p_user], v_me, 'Wants to link with you on Wee', jsonb_build_object('type', 'wee_link', 'linkId', v_id));
  return v_id;
end;
$$;

create or replace function public.cancel_wee_link(p_link uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_approved() then raise exception 'not approved'; end if;
  delete from public.wee_links
  where id = p_link and requested_by = auth.uid() and status in ('pending_partner', 'pending_admin');
end;
$$;

create or replace function public.confirm_wee_link(p_link uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_link public.wee_links;
  v_me text;
  v_them text;
  v_admins uuid[];
begin
  if not public.is_approved() then raise exception 'not approved'; end if;
  perform pg_advisory_xact_lock(hashtext('wee_links'));
  select * into v_link from public.wee_links
  where id = p_link and status = 'pending_partner' and requested_by <> auth.uid() and auth.uid() in (user_a, user_b)
  for update;
  if v_link.id is null then raise exception 'request not found'; end if;
  select coalesce(nullif(btrim(display_name), ''), 'Someone') into v_me from public.profiles where id = auth.uid();
  if not p_accept then
    update public.wee_links set status = 'declined' where id = p_link;
    perform public.weee_push_users(array[v_link.requested_by], v_me, 'Declined the Wee link', jsonb_build_object('type', 'wee_link', 'linkId', p_link));
    return;
  end if;
  update public.wee_links set status = 'pending_admin' where id = p_link;
  select coalesce(nullif(btrim(display_name), ''), 'Someone') into v_them from public.profiles where id = v_link.requested_by;
  select array_agg(p.id) into v_admins from public.profiles p where p.is_admin and p.status = 'approved';
  if v_admins is not null then
    perform public.weee_push_users(v_admins, 'Wee request', v_them || ' and ' || v_me || ' asked for Wee', jsonb_build_object('type', 'wee_request', 'linkId', p_link));
  end if;
end;
$$;

create or replace function public.decide_wee_link(p_link uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_link public.wee_links;
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  perform pg_advisory_xact_lock(hashtext('wee_links'));
  select * into v_link from public.wee_links where id = p_link and status = 'pending_admin' for update;
  if v_link.id is null then raise exception 'request not found'; end if;
  if p_approve then
    if exists (
      select 1 from public.wee_links l
      where l.id <> p_link and l.status = 'active'
        and (v_link.user_a in (l.user_a, l.user_b) or v_link.user_b in (l.user_a, l.user_b))
    ) then raise exception 'one of them already has an active link'; end if;
    update public.wee_links set status = 'active', decided_by = auth.uid(), active_since = now() where id = p_link;
    perform public.weee_push_users(array[v_link.user_a, v_link.user_b], 'Wee', 'Your Wee link was approved', jsonb_build_object('type', 'wee_link', 'linkId', p_link));
  else
    update public.wee_links set status = 'declined', decided_by = auth.uid() where id = p_link;
    perform public.weee_push_users(array[v_link.user_a, v_link.user_b], 'Wee', 'Your Wee link was not approved', jsonb_build_object('type', 'wee_link', 'linkId', p_link));
  end if;
end;
$$;

/* The admin can link himself with a friend directly, with no request. */
create or replace function public.admin_create_wee_link(p_user uuid)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_conv uuid;
  v_id uuid;
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  if p_user is null or p_user = auth.uid() then raise exception 'cannot link with yourself'; end if;
  perform pg_advisory_xact_lock(hashtext('wee_links'));
  if not exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = auth.uid() and f.addressee_id = p_user) or (f.requester_id = p_user and f.addressee_id = auth.uid()))
  ) then raise exception 'you can only link with a friend'; end if;
  if exists (
    select 1 from public.wee_links l
    where l.status in ('pending_partner', 'pending_admin', 'active')
      and (auth.uid() in (l.user_a, l.user_b) or p_user in (l.user_a, l.user_b))
  ) then raise exception 'one of you already has a Wee link or request'; end if;
  select c.id into v_conv from public.conversations c
  where c.direct_key = least(auth.uid(), p_user)::text || ':' || greatest(auth.uid(), p_user)::text;
  if v_conv is null then raise exception 'no direct chat found'; end if;
  insert into public.wee_links (user_a, user_b, conversation_id, requested_by, status, decided_by, active_since)
  values (least(auth.uid(), p_user), greatest(auth.uid(), p_user), v_conv, auth.uid(), 'active', auth.uid(), now())
  returning id into v_id;
  perform public.weee_push_users(array[p_user], 'Wee', 'Wee is now on for you and the admin', jsonb_build_object('type', 'wee_link', 'linkId', v_id));
  return v_id;
end;
$$;

create or replace function public.end_wee_link(p_link uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_link public.wee_links;
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  select * into v_link from public.wee_links where id = p_link and status = 'active' for update;
  if v_link.id is null then raise exception 'link not found'; end if;
  update public.wee_links set status = 'revoked', decided_by = auth.uid() where id = p_link;
  perform public.weee_push_users(array[v_link.user_a, v_link.user_b], 'Wee', 'Your Wee link was ended', jsonb_build_object('type', 'wee_link', 'linkId', p_link));
end;
$$;

create or replace function public.set_account_feature(p_user uuid, p_feature text, p_enabled boolean)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  insert into public.account_features (user_id, feature, enabled) values (p_user, p_feature, p_enabled)
  on conflict (user_id, feature) do update set enabled = excluded.enabled;
end;
$$;

create or replace function public.set_link_feature(p_link uuid, p_feature text, p_enabled boolean)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  if not exists (select 1 from public.wee_links where id = p_link) then raise exception 'link not found'; end if;
  insert into public.wee_link_features (link_id, feature, enabled) values (p_link, p_feature, p_enabled)
  on conflict (link_id, feature) do update set enabled = excluded.enabled;
end;
$$;

/* Requests waiting for the admin, with both names. */
create or replace function public.list_wee_requests()
returns table (link_id uuid, requester_id uuid, user_a_id uuid, user_a_name text, user_b_id uuid, user_b_name text, requested_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  return query
    select l.id, l.requested_by, l.user_a, pa.display_name, l.user_b, pb.display_name, l.created_at
    from public.wee_links l
    join public.profiles pa on pa.id = l.user_a
    join public.profiles pb on pb.id = l.user_b
    where l.status = 'pending_admin'
    order by l.created_at;
end;
$$;

/* The signed in user's current link or request, with the other person's name. */
create or replace function public.my_wee_link()
returns table (link_id uuid, partner_id uuid, partner_name text, partner_avatar text, conversation_id uuid, status text, requested_by uuid, active_since timestamptz)
language sql stable security definer set search_path = ''
as $$
  select l.id, p.id, p.display_name, p.avatar_path, l.conversation_id, l.status, l.requested_by, l.active_since
  from public.wee_links l
  join public.profiles p on p.id = case when l.user_a = auth.uid() then l.user_b else l.user_a end
  where public.is_approved()
    and auth.uid() in (l.user_a, l.user_b)
    and l.status in ('pending_partner', 'pending_admin', 'active')
  order by l.created_at desc
  limit 1;
$$;

alter table public.wee_links enable row level security;
alter table public.account_features enable row level security;
alter table public.wee_link_features enable row level security;

create policy wee_links_select on public.wee_links for select to authenticated
  using (public.is_approved() and (auth.uid() in (user_a, user_b) or public.is_admin()));
create policy account_features_select on public.account_features for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());
create policy wee_link_features_select on public.wee_link_features for select to authenticated
  using (
    public.is_admin()
    or exists (select 1 from public.wee_links l where l.id = link_id and auth.uid() in (l.user_a, l.user_b))
  );

revoke all on public.wee_links, public.account_features, public.wee_link_features from anon, authenticated;
grant select on public.wee_links, public.account_features, public.wee_link_features to authenticated;

revoke all on function public.account_feature_on(text) from public, anon;
revoke all on function public.wee_on(uuid, text) from public, anon;
revoke all on function public.request_wee_link(uuid) from public, anon;
revoke all on function public.cancel_wee_link(uuid) from public, anon;
revoke all on function public.confirm_wee_link(uuid, boolean) from public, anon;
revoke all on function public.decide_wee_link(uuid, boolean) from public, anon;
revoke all on function public.admin_create_wee_link(uuid) from public, anon;
revoke all on function public.end_wee_link(uuid) from public, anon;
revoke all on function public.set_account_feature(uuid, text, boolean) from public, anon;
revoke all on function public.set_link_feature(uuid, text, boolean) from public, anon;
revoke all on function public.list_wee_requests() from public, anon;
revoke all on function public.my_wee_link() from public, anon;
revoke all on function public.weee_push_users(uuid[], text, text, jsonb) from public, anon, authenticated;
revoke all on function public.weee_push_partner(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.account_feature_on(text) to authenticated;
grant execute on function public.wee_on(uuid, text) to authenticated;
grant execute on function public.request_wee_link(uuid) to authenticated;
grant execute on function public.cancel_wee_link(uuid) to authenticated;
grant execute on function public.confirm_wee_link(uuid, boolean) to authenticated;
grant execute on function public.decide_wee_link(uuid, boolean) to authenticated;
grant execute on function public.admin_create_wee_link(uuid) to authenticated;
grant execute on function public.end_wee_link(uuid) to authenticated;
grant execute on function public.set_account_feature(uuid, text, boolean) to authenticated;
grant execute on function public.set_link_feature(uuid, text, boolean) to authenticated;
grant execute on function public.list_wee_requests() to authenticated;
grant execute on function public.my_wee_link() to authenticated;

/* ============ ME: PRIVATE TO ONE ACCOUNT ============ */

create table public.me_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  plan_time text not null check (plan_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  plan_day date not null,
  cat text not null check (cat in ('date', 'errand', 'workout', 'study', 'trip')),
  created_at timestamptz not null default now()
);
create index me_plans_user_day on public.me_plans (user_id, plan_day);

create table public.me_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  done_at timestamptz,
  created_at timestamptz not null default now()
);
create index me_tasks_user_created on public.me_tasks (user_id, created_at desc);

create table public.me_checkins (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  mood text not null check (mood in ('calm', 'happy', 'tired', 'stressed', 'loving', 'hug')),
  energy text not null default 'steady' check (energy in ('low', 'steady', 'high')),
  note text not null default '' check (char_length(note) <= 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);
create trigger me_checkins_touch before update on public.me_checkins
  for each row execute function public.touch_updated_at();

create table public.me_moves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  move_type text not null check (char_length(btrim(move_type)) between 1 and 30),
  minutes smallint not null check (minutes between 1 and 600),
  created_at timestamptz not null default now()
);
create index me_moves_user_day on public.me_moves (user_id, day);

create table public.me_habits (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  habit text not null check (char_length(habit) between 1 and 40),
  created_at timestamptz not null default now(),
  primary key (user_id, day, habit)
);

create or replace function public.save_my_checkin(p_day date, p_mood text, p_energy text, p_note text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.account_feature_on('checkin') then raise exception 'not allowed'; end if;
  insert into public.me_checkins (user_id, day, mood, energy, note)
  values (auth.uid(), p_day, p_mood, p_energy, left(coalesce(p_note, ''), 60))
  on conflict (user_id, day)
  do update set mood = excluded.mood, energy = excluded.energy, note = excluded.note;
end;
$$;
revoke all on function public.save_my_checkin(date, text, text, text) from public, anon;
grant execute on function public.save_my_checkin(date, text, text, text) to authenticated;

alter table public.me_plans enable row level security;
alter table public.me_tasks enable row level security;
alter table public.me_checkins enable row level security;
alter table public.me_moves enable row level security;
alter table public.me_habits enable row level security;

create policy me_plans_select on public.me_plans for select to authenticated
  using (user_id = (select auth.uid()) and public.account_feature_on('plans'));
create policy me_plans_insert on public.me_plans for insert to authenticated
  with check (user_id = (select auth.uid()) and public.account_feature_on('plans'));
create policy me_plans_delete on public.me_plans for delete to authenticated
  using (user_id = (select auth.uid()) and public.account_feature_on('plans'));

create policy me_tasks_select on public.me_tasks for select to authenticated
  using (user_id = (select auth.uid()) and public.account_feature_on('plans'));
create policy me_tasks_insert on public.me_tasks for insert to authenticated
  with check (user_id = (select auth.uid()) and public.account_feature_on('plans'));
create policy me_tasks_update on public.me_tasks for update to authenticated
  using (user_id = (select auth.uid()) and public.account_feature_on('plans'))
  with check (user_id = (select auth.uid()) and public.account_feature_on('plans'));
create policy me_tasks_delete on public.me_tasks for delete to authenticated
  using (user_id = (select auth.uid()) and public.account_feature_on('plans'));

create policy me_checkins_select on public.me_checkins for select to authenticated
  using (user_id = (select auth.uid()) and public.account_feature_on('checkin'));

create policy me_moves_select on public.me_moves for select to authenticated
  using (user_id = (select auth.uid()) and public.account_feature_on('workouts'));
create policy me_moves_insert on public.me_moves for insert to authenticated
  with check (user_id = (select auth.uid()) and public.account_feature_on('workouts'));

create policy me_habits_select on public.me_habits for select to authenticated
  using (user_id = (select auth.uid()) and public.account_feature_on('habits'));
create policy me_habits_insert on public.me_habits for insert to authenticated
  with check (user_id = (select auth.uid()) and public.account_feature_on('habits'));
create policy me_habits_delete on public.me_habits for delete to authenticated
  using (user_id = (select auth.uid()) and public.account_feature_on('habits'));

revoke all on public.me_plans, public.me_tasks, public.me_checkins, public.me_moves, public.me_habits from anon, authenticated;
grant select on public.me_plans, public.me_tasks, public.me_checkins, public.me_moves, public.me_habits to authenticated;
grant insert (id, user_id, title, plan_time, plan_day, cat) on public.me_plans to authenticated;
grant delete on public.me_plans to authenticated;
grant insert (id, user_id, title) on public.me_tasks to authenticated;
grant update (done_at) on public.me_tasks to authenticated;
grant delete on public.me_tasks to authenticated;
grant insert (id, user_id, day, move_type, minutes) on public.me_moves to authenticated;
grant insert (user_id, day, habit) on public.me_habits to authenticated;
grant delete on public.me_habits to authenticated;

/* ============ WEE: SHARED BY AN ACTIVE LINK ============ */

create table public.weee_plans (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  plan_time text not null check (plan_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  plan_day date not null,
  who text not null check (who in ('both', 'creator', 'partner')),
  cat text not null check (cat in ('date', 'errand', 'workout', 'study', 'trip')),
  created_at timestamptz not null default now()
);
create index weee_plans_conv_day on public.weee_plans (conversation_id, plan_day);

create table public.weee_tasks (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  assignee text not null check (assignee in ('creator', 'partner', 'both')),
  is_private boolean not null default false,
  done_by uuid references auth.users(id) on delete set null,
  done_at timestamptz,
  created_at timestamptz not null default now(),
  constraint weee_tasks_private_own check (not is_private or assignee = 'creator')
);
create index weee_tasks_conv_created on public.weee_tasks (conversation_id, created_at desc);

create table public.weee_checkins (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  mood text not null check (mood in ('calm', 'happy', 'tired', 'stressed', 'loving', 'hug')),
  energy text not null default 'steady' check (energy in ('low', 'steady', 'high')),
  note text not null default '' check (char_length(note) <= 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (conversation_id, user_id, day)
);

create table public.weee_moves (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  move_type text not null check (char_length(btrim(move_type)) between 1 and 30),
  minutes smallint not null check (minutes between 1 and 600),
  created_at timestamptz not null default now()
);
create index weee_moves_conv_day on public.weee_moves (conversation_id, day);

create table public.weee_nudges (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index weee_nudges_conv_sender on public.weee_nudges (conversation_id, sender_id, created_at desc);

create table public.weee_answers (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  question text not null check (char_length(question) <= 200),
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now(),
  primary key (conversation_id, user_id, day)
);

create table public.weee_settings (
  conversation_id uuid primary key references public.conversations(id) on delete cascade,
  together_since date,
  updated_by uuid not null references auth.users(id) on delete cascade,
  updated_at timestamptz not null default now()
);

create trigger weee_checkins_touch before update on public.weee_checkins
  for each row execute function public.touch_updated_at();
create trigger weee_settings_touch before update on public.weee_settings
  for each row execute function public.touch_updated_at();

/* True when the signed in user already answered that day. A policy cannot read its own table directly. */
create or replace function public.has_answered(p_conversation uuid, p_day date)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.weee_answers
    where conversation_id = p_conversation and day = p_day and user_id = auth.uid()
  );
$$;

create or replace function public.save_checkin(p_conversation uuid, p_day date, p_mood text, p_energy text, p_note text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.wee_on(p_conversation, 'checkin') then raise exception 'not allowed'; end if;
  insert into public.weee_checkins (conversation_id, user_id, day, mood, energy, note)
  values (p_conversation, auth.uid(), p_day, p_mood, p_energy, left(coalesce(p_note, ''), 60))
  on conflict (conversation_id, user_id, day)
  do update set mood = excluded.mood, energy = excluded.energy, note = excluded.note;
end;
$$;

create or replace function public.save_together_since(p_conversation uuid, p_date date)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.wee_on(p_conversation, 'days') then raise exception 'not allowed'; end if;
  if p_date is null or p_date > current_date + 1 then raise exception 'invalid date'; end if;
  insert into public.weee_settings (conversation_id, together_since, updated_by)
  values (p_conversation, p_date, auth.uid())
  on conflict (conversation_id)
  do update set together_since = excluded.together_since, updated_by = excluded.updated_by;
end;
$$;

revoke all on function public.has_answered(uuid, date) from public, anon;
revoke all on function public.save_checkin(uuid, date, text, text, text) from public, anon;
revoke all on function public.save_together_since(uuid, date) from public, anon;
grant execute on function public.has_answered(uuid, date) to authenticated;
grant execute on function public.save_checkin(uuid, date, text, text, text) to authenticated;
grant execute on function public.save_together_since(uuid, date) to authenticated;

alter table public.weee_plans enable row level security;
alter table public.weee_tasks enable row level security;
alter table public.weee_checkins enable row level security;
alter table public.weee_moves enable row level security;
alter table public.weee_nudges enable row level security;
alter table public.weee_answers enable row level security;
alter table public.weee_settings enable row level security;

create policy weee_plans_select on public.weee_plans for select to authenticated
  using (public.wee_on(conversation_id, 'plans'));
create policy weee_plans_insert on public.weee_plans for insert to authenticated
  with check (created_by = (select auth.uid()) and public.wee_on(conversation_id, 'plans'));
create policy weee_plans_delete on public.weee_plans for delete to authenticated
  using (public.wee_on(conversation_id, 'plans'));

/* Private tasks are visible only to the person who made them. */
create policy weee_tasks_select on public.weee_tasks for select to authenticated
  using (public.wee_on(conversation_id, 'plans') and (not is_private or created_by = (select auth.uid())));
create policy weee_tasks_insert on public.weee_tasks for insert to authenticated
  with check (created_by = (select auth.uid()) and public.wee_on(conversation_id, 'plans'));
create policy weee_tasks_update on public.weee_tasks for update to authenticated
  using (public.wee_on(conversation_id, 'plans') and (not is_private or created_by = (select auth.uid())))
  with check (public.wee_on(conversation_id, 'plans') and (done_by is null or done_by = (select auth.uid())));
create policy weee_tasks_delete on public.weee_tasks for delete to authenticated
  using (public.wee_on(conversation_id, 'plans') and (not is_private or created_by = (select auth.uid())));

create policy weee_checkins_select on public.weee_checkins for select to authenticated
  using (public.wee_on(conversation_id, 'checkin'));

create policy weee_moves_select on public.weee_moves for select to authenticated
  using (public.wee_on(conversation_id, 'workouts'));
create policy weee_moves_insert on public.weee_moves for insert to authenticated
  with check (user_id = (select auth.uid()) and public.wee_on(conversation_id, 'workouts'));

create policy weee_nudges_select on public.weee_nudges for select to authenticated
  using (public.wee_on(conversation_id, 'nudges'));
create policy weee_nudges_insert on public.weee_nudges for insert to authenticated
  with check (sender_id = (select auth.uid()) and public.wee_on(conversation_id, 'nudges'));

/* You always see your own answer. You see theirs only after you have answered the same day. */
create policy weee_answers_select on public.weee_answers for select to authenticated
  using (
    public.wee_on(conversation_id, 'question')
    and (user_id = (select auth.uid()) or public.has_answered(conversation_id, day))
  );
create policy weee_answers_insert on public.weee_answers for insert to authenticated
  with check (user_id = (select auth.uid()) and public.wee_on(conversation_id, 'question'));

create policy weee_settings_select on public.weee_settings for select to authenticated
  using (public.wee_on(conversation_id, 'days'));

revoke all on public.weee_plans, public.weee_tasks, public.weee_checkins, public.weee_moves,
  public.weee_nudges, public.weee_answers, public.weee_settings from anon, authenticated;
grant select on public.weee_plans, public.weee_tasks, public.weee_checkins, public.weee_moves,
  public.weee_nudges, public.weee_answers, public.weee_settings to authenticated;
grant insert (id, conversation_id, created_by, title, plan_time, plan_day, who, cat) on public.weee_plans to authenticated;
grant delete on public.weee_plans to authenticated;
grant insert (id, conversation_id, created_by, title, assignee, is_private) on public.weee_tasks to authenticated;
grant update (done_by, done_at) on public.weee_tasks to authenticated;
grant delete on public.weee_tasks to authenticated;
grant insert (id, conversation_id, user_id, day, move_type, minutes) on public.weee_moves to authenticated;
grant insert (id, conversation_id, sender_id) on public.weee_nudges to authenticated;
grant insert (conversation_id, user_id, day, question, body) on public.weee_answers to authenticated;

/* ============ WEE PUSH TRIGGERS ============ */

create or replace function public.notify_weee_plan()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  /* A plan marked for the creator alone stays visible but silent. */
  if new.who in ('both', 'partner') then
    perform public.weee_push_partner(
      new.conversation_id, new.created_by,
      'New plan: ' || new.title || ', ' || to_char(new.plan_day, 'FMDy FMDD FMMon')
        || ' at ' || to_char(date '2000-01-01' + new.plan_time::time, 'FMHH12:MI AM')
    );
  end if;
  return new;
exception when others then
  raise warning 'notify_weee_plan failed: %', sqlerrm;
  return new;
end;
$$;

create or replace function public.notify_weee_task()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.is_private then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.assignee = 'partner' then
      perform public.weee_push_partner(new.conversation_id, new.created_by, 'New task for you: ' || new.title);
    elsif new.assignee = 'both' then
      perform public.weee_push_partner(new.conversation_id, new.created_by, 'New task for both of you: ' || new.title);
    end if;
  elsif tg_op = 'UPDATE' then
    if old.done_at is null and new.done_at is not null and new.done_by is not null
       and not (new.assignee = 'creator' and new.done_by = new.created_by) then
      perform public.weee_push_partner(new.conversation_id, new.done_by, 'Finished a task: ' || new.title);
    end if;
  end if;
  return new;
exception when others then
  raise warning 'notify_weee_task failed: %', sqlerrm;
  return new;
end;
$$;

/* Fires on the first check in of a day only. Later changes are updates and stay silent. */
create or replace function public.notify_weee_checkin()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  perform public.weee_push_partner(
    new.conversation_id, new.user_id,
    case new.mood
      when 'calm' then 'Feeling calm today'
      when 'happy' then 'Feeling happy today'
      when 'tired' then 'Feeling tired today'
      when 'stressed' then 'Feeling stressed today'
      when 'loving' then 'Feeling loving today'
      when 'hug' then 'Needs a hug today'
      else 'Checked in today'
    end
  );
  return new;
exception when others then
  raise warning 'notify_weee_checkin failed: %', sqlerrm;
  return new;
end;
$$;

create or replace function public.notify_weee_move()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  perform public.weee_push_partner(
    new.conversation_id, new.user_id,
    'Finished a workout: ' || new.move_type || ', ' || new.minutes || ' min'
  );
  return new;
exception when others then
  raise warning 'notify_weee_move failed: %', sqlerrm;
  return new;
end;
$$;

/* One nudge per sender every 10 minutes, enforced here so it survives reopening the app. */
create or replace function public.guard_weee_nudge()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if exists (
    select 1 from public.weee_nudges n
    where n.conversation_id = new.conversation_id
      and n.sender_id = new.sender_id
      and n.created_at > now() - interval '10 minutes'
  ) then
    raise exception 'nudge cooldown';
  end if;
  return new;
end;
$$;

create or replace function public.notify_weee_nudge()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  perform public.weee_push_partner(new.conversation_id, new.sender_id, 'Thought of you');
  return new;
exception when others then
  raise warning 'notify_weee_nudge failed: %', sqlerrm;
  return new;
end;
$$;

/* The push never contains the answer text. */
create or replace function public.notify_weee_answer()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if exists (
    select 1 from public.weee_answers a
    where a.conversation_id = new.conversation_id and a.day = new.day and a.user_id <> new.user_id
  ) then
    perform public.weee_push_partner(new.conversation_id, new.user_id, 'You have both answered today''s question. Open to read.');
  else
    perform public.weee_push_partner(new.conversation_id, new.user_id, 'Answered today''s question');
  end if;
  return new;
exception when others then
  raise warning 'notify_weee_answer failed: %', sqlerrm;
  return new;
end;
$$;

create or replace function public.notify_weee_settings()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.together_since is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.together_since is not distinct from new.together_since then
    return new;
  end if;
  perform public.weee_push_partner(
    new.conversation_id, new.updated_by,
    'Set the day you became friends: ' || to_char(new.together_since, 'FMDD FMMonth YYYY')
  );
  return new;
exception when others then
  raise warning 'notify_weee_settings failed: %', sqlerrm;
  return new;
end;
$$;

revoke all on function public.notify_weee_plan() from public, anon, authenticated;
revoke all on function public.notify_weee_task() from public, anon, authenticated;
revoke all on function public.notify_weee_checkin() from public, anon, authenticated;
revoke all on function public.notify_weee_move() from public, anon, authenticated;
revoke all on function public.guard_weee_nudge() from public, anon, authenticated;
revoke all on function public.notify_weee_nudge() from public, anon, authenticated;
revoke all on function public.notify_weee_answer() from public, anon, authenticated;
revoke all on function public.notify_weee_settings() from public, anon, authenticated;

create trigger on_weee_plan_push after insert on public.weee_plans
  for each row execute function public.notify_weee_plan();
create trigger on_weee_task_insert_push after insert on public.weee_tasks
  for each row execute function public.notify_weee_task();
create trigger on_weee_task_done_push after update of done_at on public.weee_tasks
  for each row execute function public.notify_weee_task();
create trigger on_weee_checkin_push after insert on public.weee_checkins
  for each row execute function public.notify_weee_checkin();
create trigger on_weee_move_push after insert on public.weee_moves
  for each row execute function public.notify_weee_move();
create trigger guard_weee_nudge before insert on public.weee_nudges
  for each row execute function public.guard_weee_nudge();
create trigger on_weee_nudge_push after insert on public.weee_nudges
  for each row execute function public.notify_weee_nudge();
create trigger on_weee_answer_push after insert on public.weee_answers
  for each row execute function public.notify_weee_answer();
create trigger on_weee_settings_push after insert or update on public.weee_settings
  for each row execute function public.notify_weee_settings();

/* ============ REALTIME ============ */

do $$
declare
  t text;
begin
  foreach t in array array[
    'wee_links', 'account_features', 'wee_link_features',
    'me_plans', 'me_tasks', 'me_checkins', 'me_moves', 'me_habits',
    'weee_plans', 'weee_tasks', 'weee_checkins', 'weee_moves', 'weee_nudges', 'weee_answers', 'weee_settings'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$$;

commit;
