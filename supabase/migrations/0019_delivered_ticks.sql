-- WhatsApp style delivery ticks.
-- 1. A message to a direct chat is stamped delivered the moment it is stored, when the other person has
--    a phone registered for push (the push is what reaches a closed app). Their phone does not need to be open.
--    Note: this means "their phone is registered and was sent the push", not proof that the handset received it.
-- 2. mark_all_delivered(): the app calls it when it is open, so anything still waiting counts as delivered.
begin;

create or replace function public.messages_set_delivered()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.delivered_at is null
     and exists (select 1 from public.conversations c where c.id = new.conversation_id and c.kind = 'direct')
     and exists (
       select 1 from public.conversation_members cm
       join public.push_tokens t on t.user_id = cm.user_id
       where cm.conversation_id = new.conversation_id and cm.user_id <> new.sender_id
     )
  then
    new.delivered_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists zz_messages_set_delivered on public.messages;
create trigger zz_messages_set_delivered before insert on public.messages
  for each row execute function public.messages_set_delivered();

create or replace function public.mark_all_delivered()
returns void language plpgsql security definer set search_path = ''
as $$
declare r record;
begin
  for r in select cm.conversation_id from public.conversation_members cm where cm.user_id = auth.uid() loop
    perform public.mark_delivered(r.conversation_id);
  end loop;
end;
$$;
revoke all on function public.mark_all_delivered() from public, anon;
grant execute on function public.mark_all_delivered() to authenticated;
revoke all on function public.messages_set_delivered() from public, anon, authenticated;

commit;
