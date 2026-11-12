-- 1. GIF and sticker messages: new kinds, plus a meta column holding the picture address.
--    The body is just the word GIF or Sticker, so notifications, previews and older app versions stay readable.
--    Only GIPHY addresses are accepted.
-- 2. Pinned chats: each person pins up to 3 of their own chats.
begin;

alter table public.messages add column if not exists meta jsonb;

alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages add constraint messages_kind_check
  check (kind = any (array['text','image','video','file','voice','link','call','gif','sticker']));

alter table public.messages drop constraint if exists messages_gif_meta;
alter table public.messages add constraint messages_gif_meta
  check (
    kind not in ('gif', 'sticker')
    or (meta is not null and jsonb_typeof(meta) = 'object' and (meta ->> 'u') ~ '^https://[a-z0-9.-]+\.giphy\.com/')
  );

grant select (meta), insert (meta), update (meta) on public.messages to authenticated;

alter table public.conversation_members add column if not exists pinned_at timestamptz;

create or replace function public.set_chat_pin(p_conversation uuid, p_pinned boolean)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_count int;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if not exists (select 1 from public.conversation_members where conversation_id = p_conversation and user_id = auth.uid()) then
    raise exception 'You are not in this chat';
  end if;
  if p_pinned then
    select count(*) into v_count from public.conversation_members
      where user_id = auth.uid() and pinned_at is not null and conversation_id <> p_conversation;
    if v_count >= 3 then raise exception 'You can pin up to 3 chats'; end if;
    update public.conversation_members set pinned_at = now() where conversation_id = p_conversation and user_id = auth.uid();
  else
    update public.conversation_members set pinned_at = null where conversation_id = p_conversation and user_id = auth.uid();
  end if;
end;
$$;
revoke all on function public.set_chat_pin(uuid, boolean) from public, anon;
grant execute on function public.set_chat_pin(uuid, boolean) to authenticated;

commit;
