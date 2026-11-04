begin;

create or replace function public.clear_conversation_for_everyone(p_conversation uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_member(p_conversation) then
    raise exception 'not a member';
  end if;

  update public.messages
  set deleted_at = coalesce(deleted_at, now()),
      body = null,
      media_id = null
  where conversation_id = p_conversation;
end;
$$;

revoke all on function public.clear_conversation_for_everyone(uuid) from public, anon;
grant execute on function public.clear_conversation_for_everyone(uuid) to authenticated;

commit;
