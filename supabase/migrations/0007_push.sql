begin;

create extension if not exists pg_net;

create table public.push_tokens (
  token text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null default 'android',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index push_tokens_user on public.push_tokens (user_id);
alter table public.push_tokens enable row level security;
revoke all on public.push_tokens from anon, authenticated;

create or replace function public.register_push_token(p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  if p_token is null or p_token !~ '^Expo(nent)?PushToken\[.+\]$' then
    raise exception 'invalid token';
  end if;
  insert into public.push_tokens (token, user_id)
  values (p_token, auth.uid())
  on conflict (token) do update
  set user_id = excluded.user_id, updated_at = now();
end;
$$;

create or replace function public.unregister_push_token(p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  delete from public.push_tokens
  where token = p_token and user_id = auth.uid();
end;
$$;

create or replace function public.notify_new_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
  v_body text;
  v_name text;
  v_duration int;
  v_messages jsonb;
begin
  if new.deleted_at is not null then
    return new;
  end if;

  select coalesce(nullif(btrim(p.display_name), ''), 'New message')
  into v_title
  from public.profiles p
  where p.id = new.sender_id;
  v_title := coalesce(v_title, 'New message');

  if new.media_id is not null then
    select m.name, round(m.duration_ms / 1000.0)::int
    into v_name, v_duration
    from public.media m
    where m.id = new.media_id;
  end if;

  v_body := case new.kind
    when 'text' then left(btrim(coalesce(new.body, '')), 160)
    when 'link' then left(btrim(coalesce(new.body, '')), 160)
    when 'image' then case
      when new.max_views is not null then 'Photo'
      else coalesce(nullif(left(btrim(coalesce(new.body, '')), 160), ''), 'Photo')
    end
    when 'video' then 'Video'
    when 'voice' then 'Voice message' || case
      when v_duration is not null then ', ' || (v_duration / 60)::text || ':' || lpad((v_duration % 60)::text, 2, '0')
      else ''
    end
    when 'file' then coalesce(nullif(v_name, ''), 'File')
    else 'New message'
  end;
  v_body := coalesce(nullif(v_body, ''), 'New message');

  select jsonb_agg(jsonb_build_object(
    'to', t.token,
    'title', v_title,
    'body', v_body,
    'sound', 'default',
    'channelId', 'messages',
    'priority', 'high',
    'data', jsonb_build_object(
      'type', 'message',
      'conversationId', new.conversation_id,
      'messageId', new.id
    )
  ))
  into v_messages
  from public.push_tokens t
  join public.conversation_members cm on cm.user_id = t.user_id
  where cm.conversation_id = new.conversation_id
    and cm.user_id <> new.sender_id;

  if v_messages is not null then
    perform net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      body := v_messages,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Accept', 'application/json'
      )
    );
  end if;
  return new;
exception when others then
  raise warning 'on_message_push failed: %', sqlerrm;
  return new;
end;
$$;

revoke all on function public.register_push_token(text) from public, anon;
revoke all on function public.unregister_push_token(text) from public, anon;
revoke all on function public.notify_new_message() from public, anon, authenticated;
grant execute on function public.register_push_token(text) to authenticated;
grant execute on function public.unregister_push_token(text) to authenticated;

drop trigger if exists on_message_push on public.messages;
create trigger on_message_push
after insert on public.messages
for each row execute function public.notify_new_message();

commit;
