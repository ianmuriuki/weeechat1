-- 1. The admin can always be Wee'd, whatever the account switches say.
-- 2. my_last_messages(): the newest message of each of my conversations, so the chat list
--    no longer depends on a 200 message window (old chats were showing "No messages yet").
begin;

create or replace function public.wee_allowed(p_user uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_user and p.status = 'approved'
      and (p.is_admin or not exists (
        select 1 from public.account_features f where f.user_id = p_user and f.feature = 'wee' and not f.enabled
      ))
  );
$$;

create or replace function public.my_last_messages()
returns setof public.messages
language sql stable security invoker set search_path = ''
as $$
  select distinct on (m.conversation_id) m.*
  from public.messages m
  order by m.conversation_id, m.created_at desc, m.id desc;
$$;
revoke all on function public.my_last_messages() from public, anon;
grant execute on function public.my_last_messages() to authenticated;

commit;
