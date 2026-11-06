-- Wee belongs to one direct chat, not to the account.
-- 1. A person can have Wee with several chats. Only one open link per pair of friends.
-- 2. Wee is off for everyone until the admin switches it on for that account (the admin is always on).
-- 3. Link notifications now carry the conversation, so a tap opens that chat.
begin;

alter table public.account_features drop constraint if exists account_features_feature_check;
alter table public.account_features add constraint account_features_feature_check
  check (feature in ('plans', 'workouts', 'checkin', 'habits', 'wee'));

/* Unlike the other account features, a missing row means Wee is OFF. */
create or replace function public.wee_allowed(p_user uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_user and p.status = 'approved'
      and (p.is_admin or exists (
        select 1 from public.account_features f where f.user_id = p_user and f.feature = 'wee' and f.enabled
      ))
  );
$$;

create or replace function public.my_wee_allowed()
returns boolean language sql stable security definer set search_path = ''
as $$ select public.is_approved() and public.wee_allowed(auth.uid()); $$;

/* The signed in user's open link or request for one chat. */
create or replace function public.wee_link_for(p_conversation uuid)
returns table (link_id uuid, partner_id uuid, partner_name text, partner_avatar text, conversation_id uuid, status text, requested_by uuid, active_since timestamptz)
language sql stable security definer set search_path = ''
as $$
  select l.id, p.id, p.display_name, p.avatar_path, l.conversation_id, l.status, l.requested_by, l.active_since
  from public.wee_links l
  join public.profiles p on p.id = case when l.user_a = auth.uid() then l.user_b else l.user_a end
  where public.is_approved()
    and l.conversation_id = p_conversation
    and auth.uid() in (l.user_a, l.user_b)
    and l.status in ('pending_partner', 'pending_admin', 'active')
  order by l.created_at desc
  limit 1;
$$;

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
  if not public.wee_allowed(auth.uid()) then raise exception 'Wee is not switched on for you'; end if;
  perform pg_advisory_xact_lock(hashtext('wee_links'));
  if not exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = auth.uid() and f.addressee_id = p_user) or (f.requester_id = p_user and f.addressee_id = auth.uid()))
  ) then raise exception 'you can only link with a friend'; end if;
  if not exists (select 1 from public.profiles where id = p_user and status = 'approved') then raise exception 'account not found'; end if;
  if not public.wee_allowed(p_user) then raise exception 'Wee is not switched on for that friend'; end if;
  if exists (
    select 1 from public.wee_links l
    where l.user_a = least(auth.uid(), p_user) and l.user_b = greatest(auth.uid(), p_user)
      and l.status in ('pending_partner', 'pending_admin', 'active')
  ) then raise exception 'you already have a Wee link or request with this friend'; end if;
  select c.id into v_conv from public.conversations c
  where c.direct_key = least(auth.uid(), p_user)::text || ':' || greatest(auth.uid(), p_user)::text;
  if v_conv is null then raise exception 'no direct chat found'; end if;
  insert into public.wee_links (user_a, user_b, conversation_id, requested_by, status)
  values (least(auth.uid(), p_user), greatest(auth.uid(), p_user), v_conv, auth.uid(), 'pending_partner')
  returning id into v_id;
  select coalesce(nullif(btrim(display_name), ''), 'Someone') into v_me from public.profiles where id = auth.uid();
  perform public.weee_push_users(array[p_user], v_me, 'Wants to link with you on Wee', jsonb_build_object('type', 'wee_link', 'linkId', v_id, 'conversationId', v_conv));
  return v_id;
end;
$$;

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
  if not public.wee_allowed(p_user) then raise exception 'Wee is not switched on for that friend'; end if;
  if exists (
    select 1 from public.wee_links l
    where l.user_a = least(auth.uid(), p_user) and l.user_b = greatest(auth.uid(), p_user)
      and l.status in ('pending_partner', 'pending_admin', 'active')
  ) then raise exception 'you already have a Wee link or request with this friend'; end if;
  select c.id into v_conv from public.conversations c
  where c.direct_key = least(auth.uid(), p_user)::text || ':' || greatest(auth.uid(), p_user)::text;
  if v_conv is null then raise exception 'no direct chat found'; end if;
  insert into public.wee_links (user_a, user_b, conversation_id, requested_by, status, decided_by, active_since)
  values (least(auth.uid(), p_user), greatest(auth.uid(), p_user), v_conv, auth.uid(), 'active', auth.uid(), now())
  returning id into v_id;
  perform public.weee_push_users(array[p_user], 'Wee', 'Wee is now on for you and the admin', jsonb_build_object('type', 'wee_link', 'linkId', v_id, 'conversationId', v_conv));
  return v_id;
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
    update public.wee_links set status = 'active', decided_by = auth.uid(), active_since = now() where id = p_link;
    perform public.weee_push_users(array[v_link.user_a, v_link.user_b], 'Wee', 'Your Wee link was approved', jsonb_build_object('type', 'wee_link', 'linkId', p_link, 'conversationId', v_link.conversation_id));
  else
    update public.wee_links set status = 'declined', decided_by = auth.uid() where id = p_link;
    perform public.weee_push_users(array[v_link.user_a, v_link.user_b], 'Wee', 'Your Wee link was not approved', jsonb_build_object('type', 'wee_link', 'linkId', p_link, 'conversationId', v_link.conversation_id));
  end if;
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
    perform public.weee_push_users(array[v_link.requested_by], v_me, 'Declined the Wee link', jsonb_build_object('type', 'wee_link', 'linkId', p_link, 'conversationId', v_link.conversation_id));
    return;
  end if;
  update public.wee_links set status = 'pending_admin' where id = p_link;
  select coalesce(nullif(btrim(display_name), ''), 'Someone') into v_them from public.profiles where id = v_link.requested_by;
  select array_agg(p.id) into v_admins from public.profiles p where p.is_admin and p.status = 'approved';
  if v_admins is not null then
    perform public.weee_push_users(v_admins, 'Wee request', v_them || ' and ' || v_me || ' asked for Wee', jsonb_build_object('type', 'wee_request', 'linkId', p_link, 'conversationId', v_link.conversation_id));
  end if;
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
  perform public.weee_push_users(array[v_link.user_a, v_link.user_b], 'Wee', 'Your Wee link was ended', jsonb_build_object('type', 'wee_link', 'linkId', p_link, 'conversationId', v_link.conversation_id));
end;
$$;

revoke all on function public.wee_allowed(uuid) from public, anon, authenticated;
revoke all on function public.my_wee_allowed() from public, anon;
revoke all on function public.wee_link_for(uuid) from public, anon;
grant execute on function public.my_wee_allowed() to authenticated;
grant execute on function public.wee_link_for(uuid) to authenticated;

commit;
