-- One pinned message per chat, shown to everyone in the chat.
begin;

alter table public.conversations add column if not exists pinned_message_id uuid references public.messages(id) on delete set null;
grant select (pinned_message_id) on public.conversations to authenticated;

create or replace function public.set_pinned_message(p_conversation uuid, p_message uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if not exists (select 1 from public.conversation_members where conversation_id = p_conversation and user_id = auth.uid()) then
    raise exception 'You are not in this chat';
  end if;
  if p_message is not null and not exists (
    select 1 from public.messages where id = p_message and conversation_id = p_conversation and deleted_at is null
  ) then
    raise exception 'That message is not in this chat';
  end if;
  update public.conversations set pinned_message_id = p_message where id = p_conversation;
end;
$$;
revoke all on function public.set_pinned_message(uuid, uuid) from public, anon;
grant execute on function public.set_pinned_message(uuid, uuid) to authenticated;

-- So an open chat sees a pin or unpin straight away.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'conversations') then
    alter publication supabase_realtime add table public.conversations;
  end if;
end $$;

commit;