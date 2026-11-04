begin;

create table public.media (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  uploader_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null unique,
  kind text not null check (kind in ('image', 'video', 'audio', 'file')),
  mime_type text not null,
  name text not null check (char_length(name) <= 255),
  size_bytes bigint not null check (size_bytes >= 0),
  width int,
  height int,
  duration_ms int,
  waveform jsonb,
  created_at timestamptz not null default now(),
  constraint media_id_conversation unique (id, conversation_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null default gen_random_uuid(),
  kind text not null default 'text' check (kind in ('text', 'image', 'video', 'file', 'voice', 'link', 'call')),
  body text check (char_length(body) <= 8000),
  reply_to uuid,
  media_id uuid,
  max_views smallint check (max_views >= 1 and max_views <= 10),
  views_used smallint not null default 0,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  deleted_at timestamptz,
  constraint messages_id_conversation unique (id, conversation_id),
  constraint messages_client unique (sender_id, client_id),
  constraint messages_body_required check (
    deleted_at is not null or kind <> 'text' or char_length(btrim(coalesce(body, ''))) > 0
  ),
  foreign key (media_id, conversation_id)
    references public.media (id, conversation_id) on delete set null (media_id),
  foreign key (reply_to, conversation_id)
    references public.messages (id, conversation_id)
);

create table public.reactions (
  message_id uuid not null,
  conversation_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null check (char_length(emoji) <= 16),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id),
  foreign key (message_id, conversation_id)
    references public.messages (id, conversation_id) on delete cascade
);

create index messages_conversation_created on public.messages (conversation_id, created_at desc);
create index media_conversation_created on public.media (conversation_id, created_at desc);

create or replace function public.mark_delivered(p_conversation uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_member(p_conversation) then raise exception 'not a member'; end if;
  update public.messages
  set delivered_at = now()
  where conversation_id = p_conversation
    and sender_id <> auth.uid()
    and delivered_at is null;
end;
$$;

create or replace function public.mark_read(p_conversation uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_member(p_conversation) then raise exception 'not a member'; end if;
  update public.messages
  set read_at = now(), delivered_at = coalesce(delivered_at, now())
  where conversation_id = p_conversation
    and sender_id <> auth.uid()
    and read_at is null;
  update public.conversation_members
  set last_read_at = now()
  where conversation_id = p_conversation and user_id = auth.uid();
end;
$$;

create or replace function public.consume_view(p_message uuid)
returns table (out_path text, views_left integer)
language plpgsql security definer set search_path = ''
as $$
declare
  v_conversation uuid;
  v_sender uuid;
  v_max smallint;
  v_path text;
  v_used smallint;
begin
  select m.conversation_id, m.sender_id, m.max_views, media.storage_path
  into v_conversation, v_sender, v_max, v_path
  from public.messages m
  join public.media media on media.id = m.media_id
  where m.id = p_message and m.deleted_at is null;
  if not found or not public.is_member(v_conversation) then raise exception 'not found'; end if;
  if v_max is null or v_sender = auth.uid() then
    return query select v_path, null::integer;
    return;
  end if;
  update public.messages
  set views_used = views_used + 1
  where id = p_message and views_used < max_views
  returning views_used into v_used;
  if not found then raise exception 'no views left'; end if;
  return query select v_path, (v_max - v_used)::integer;
end;
$$;

alter table public.media enable row level security;
alter table public.messages enable row level security;
alter table public.reactions enable row level security;

create policy media_select on public.media for select to authenticated
  using (public.is_member(conversation_id));
create policy media_insert on public.media for insert to authenticated
  with check (uploader_id = auth.uid() and public.is_member(conversation_id));
create policy media_delete on public.media for delete to authenticated
  using (public.is_member(conversation_id));
create policy messages_select on public.messages for select to authenticated
  using (public.is_member(conversation_id));
create policy messages_insert on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and public.is_member(conversation_id));
create policy messages_update on public.messages for update to authenticated
  using (sender_id = auth.uid() and public.is_member(conversation_id))
  with check (sender_id = auth.uid() and public.is_member(conversation_id));
create policy reactions_select on public.reactions for select to authenticated
  using (public.is_member(conversation_id));
create policy reactions_insert on public.reactions for insert to authenticated
  with check (user_id = auth.uid() and public.is_member(conversation_id));
create policy reactions_update on public.reactions for update to authenticated
  using (user_id = auth.uid() and public.is_member(conversation_id));
create policy reactions_delete on public.reactions for delete to authenticated
  using (user_id = auth.uid() and public.is_member(conversation_id));

revoke all on public.media, public.messages, public.reactions from anon, authenticated;
grant select on public.media, public.messages, public.reactions to authenticated;
grant insert (id, conversation_id, uploader_id, storage_path, kind, mime_type, name, size_bytes, width, height, duration_ms, waveform) on public.media to authenticated;
grant delete on public.media to authenticated;
grant insert (id, conversation_id, sender_id, client_id, kind, body, reply_to, media_id, max_views) on public.messages to authenticated;
grant update (body, edited_at, deleted_at) on public.messages to authenticated;
grant insert (message_id, conversation_id, user_id, emoji) on public.reactions to authenticated;
grant update (emoji) on public.reactions to authenticated;
grant delete on public.reactions to authenticated;
revoke all on function public.mark_delivered(uuid), public.mark_read(uuid), public.consume_view(uuid) from public, anon;
grant execute on function public.mark_delivered(uuid), public.mark_read(uuid), public.consume_view(uuid) to authenticated;

alter table public.messages replica identity full;
alter table public.reactions replica identity full;
alter publication supabase_realtime add table public.messages, public.reactions, public.media;

insert into storage.buckets (id, name, public, file_size_limit)
values ('chat_media', 'chat_media', false, 26214400)
on conflict (id) do nothing;

create policy chat_media_select on storage.objects for select to authenticated
  using (
    bucket_id = 'chat_media'
    and case
      when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then public.is_member(((storage.foldername(name))[1])::uuid)
      else false
    end
  );
create policy chat_media_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'chat_media'
    and case
      when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then public.is_member(((storage.foldername(name))[1])::uuid)
      else false
    end
  );
create policy chat_media_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'chat_media'
    and case
      when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then public.is_member(((storage.foldername(name))[1])::uuid)
      else false
    end
  );

commit;
