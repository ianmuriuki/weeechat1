-- 1. Wee is allowed for everyone by default. The admin can switch it off for an account.
--    A request goes friend confirms, then admin approves, so no one needs to be switched on first.
-- 2. Push notifications for the rest of the approval flow: new sign up (to admins), account approved or
--    rejected, friend request received, friend request accepted. Wee request pushes already exist.
begin;

create or replace function public.wee_allowed(p_user uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.profiles p where p.id = p_user and p.status = 'approved')
    and not exists (select 1 from public.account_features f where f.user_id = p_user and f.feature = 'wee' and not f.enabled);
$$;

create or replace function public.notify_signup_pending()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_name text;
  v_admins uuid[];
begin
  if new.status is distinct from 'pending' then return new; end if;
  v_name := coalesce(nullif(btrim(new.display_name), ''), nullif(btrim(new.username), ''), 'Someone');
  select array_agg(p.id) into v_admins from public.profiles p where p.is_admin and p.status = 'approved';
  if v_admins is not null then
    perform public.weee_push_users(v_admins, 'New account', v_name || ' is waiting for your approval', jsonb_build_object('type', 'signup'));
  end if;
  return new;
exception when others then
  raise warning 'notify_signup_pending failed: %', sqlerrm;
  return new;
end;
$$;

create or replace function public.notify_account_decision()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if old.status = 'pending' and new.status = 'approved' then
    perform public.weee_push_users(array[new.id], 'Weeez', 'Your account was approved. Welcome in.', jsonb_build_object('type', 'account'));
  elsif old.status = 'pending' and new.status = 'rejected' then
    perform public.weee_push_users(array[new.id], 'Weeez', 'Your account was not approved.', jsonb_build_object('type', 'account'));
  end if;
  return new;
exception when others then
  raise warning 'notify_account_decision failed: %', sqlerrm;
  return new;
end;
$$;

create or replace function public.notify_friend_request()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_name text;
begin
  if new.status <> 'pending' then return new; end if;
  select coalesce(nullif(btrim(display_name), ''), nullif(btrim(username), ''), 'Someone') into v_name from public.profiles where id = new.requester_id;
  perform public.weee_push_users(array[new.addressee_id], coalesce(v_name, 'Someone'), 'Sent you a friend request', jsonb_build_object('type', 'friend_request'));
  return new;
exception when others then
  raise warning 'notify_friend_request failed: %', sqlerrm;
  return new;
end;
$$;

create or replace function public.notify_friend_accepted()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_name text;
begin
  if not (old.status = 'pending' and new.status = 'accepted') then return new; end if;
  select coalesce(nullif(btrim(display_name), ''), nullif(btrim(username), ''), 'Someone') into v_name from public.profiles where id = new.addressee_id;
  perform public.weee_push_users(array[new.requester_id], coalesce(v_name, 'Someone'), 'Accepted your friend request', jsonb_build_object('type', 'friend'));
  return new;
exception when others then
  raise warning 'notify_friend_accepted failed: %', sqlerrm;
  return new;
end;
$$;

revoke all on function public.notify_signup_pending() from public, anon, authenticated;
revoke all on function public.notify_account_decision() from public, anon, authenticated;
revoke all on function public.notify_friend_request() from public, anon, authenticated;
revoke all on function public.notify_friend_accepted() from public, anon, authenticated;

drop trigger if exists on_signup_pending_push on public.profiles;
create trigger on_signup_pending_push after insert on public.profiles
  for each row execute function public.notify_signup_pending();
drop trigger if exists on_account_decision_push on public.profiles;
create trigger on_account_decision_push after update of status on public.profiles
  for each row execute function public.notify_account_decision();
drop trigger if exists on_friend_request_push on public.friendships;
create trigger on_friend_request_push after insert on public.friendships
  for each row execute function public.notify_friend_request();
drop trigger if exists on_friend_accepted_push on public.friendships;
create trigger on_friend_accepted_push after update of status on public.friendships
  for each row execute function public.notify_friend_accepted();

-- Lists the other triggers on these two tables, so a duplicate push source would show up here.
do $$
declare r record;
begin
  for r in
    select event_object_table as t, trigger_name as n from information_schema.triggers
    where trigger_schema = 'public' and event_object_table in ('profiles', 'friendships')
    order by 1, 2
  loop
    raise notice 'trigger % on %', r.n, r.t;
  end loop;
end
$$;

commit;
