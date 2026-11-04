begin;

create table public.calls (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  caller_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('audio', 'video')),
  status text not null default 'ringing' check (status in ('ringing', 'active', 'ended', 'declined', 'missed')),
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  ended_at timestamptz,
  ringing_at timestamptz
);
create index calls_conv_created on public.calls (conversation_id, created_at desc);

alter table public.calls enable row level security;
create policy calls_select on public.calls for select to authenticated
  using (public.is_member(conversation_id));

revoke all on public.calls from anon, authenticated;
grant select on public.calls to authenticated;

create or replace function public.start_call(p_conversation uuid, p_kind text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.is_member(p_conversation) then raise exception 'not a member'; end if;
  if p_kind not in ('audio', 'video') then raise exception 'invalid kind'; end if;
  update public.calls set status = 'ended', ended_at = now()
  where conversation_id = p_conversation
    and ((status = 'ringing' and created_at < now() - interval '60 seconds')
      or (status = 'active' and answered_at < now() - interval '4 hours'));
  if exists (select 1 from public.calls where conversation_id = p_conversation and status in ('ringing', 'active')) then
    raise exception 'call in progress';
  end if;
  insert into public.calls (conversation_id, caller_id, kind)
  values (p_conversation, auth.uid(), p_kind)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.answer_call(p_call uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare c public.calls;
begin
  select * into c from public.calls where id = p_call;
  if c.id is null or not public.is_member(c.conversation_id) then raise exception 'not a member'; end if;
  if c.caller_id = auth.uid() then raise exception 'cannot answer your own call'; end if;
  if c.status <> 'ringing' or c.created_at < now() - interval '90 seconds' then raise exception 'call is no longer ringing'; end if;
  update public.calls set status = 'active', answered_at = now() where id = p_call;
end;
$$;

create or replace function public.end_call(p_call uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare c public.calls;
begin
  select * into c from public.calls where id = p_call;
  if c.id is null or not public.is_member(c.conversation_id) then raise exception 'not a member'; end if;
  if c.status = 'ringing' then
    update public.calls set status = case when c.caller_id = auth.uid() then 'missed' else 'declined' end, ended_at = now() where id = p_call;
  elsif c.status = 'active' then
    update public.calls set status = 'ended', ended_at = now() where id = p_call;
  end if;
end;
$$;

create or replace function public.ack_ringing(p_call uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  update public.calls set ringing_at = coalesce(ringing_at, now())
  where id = p_call and status = 'ringing' and caller_id <> auth.uid() and public.is_member(conversation_id);
end;
$$;

create or replace function public.pending_call(p_conversation uuid)
returns setof public.calls language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_member(p_conversation) then raise exception 'not a member'; end if;
  return query
    select c from public.calls c
    where c.conversation_id = p_conversation and c.status = 'ringing'
      and c.caller_id <> auth.uid() and c.created_at > now() - interval '50 seconds'
    order by c.created_at desc limit 1;
end;
$$;

create or replace function public.push_call_event(p_conversation uuid, p_actor uuid, p_body text, p_call uuid, p_ttl int)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_title text; v_msgs jsonb;
begin
  select coalesce(nullif(btrim(p.display_name), ''), 'Call') into v_title from public.profiles p where p.id = p_actor;
  v_title := coalesce(v_title, 'Call');
  select jsonb_agg(jsonb_build_object(
    'to', t.token, 'title', v_title, 'body', p_body, 'sound', 'default',
    'channelId', case when p_body like 'Incoming%' then 'calls' else 'alerts' end,
    'priority', 'high', 'ttl', p_ttl,
    'data', jsonb_build_object('type', 'call', 'conversationId', p_conversation, 'callId', p_call)
  )) into v_msgs
  from public.push_tokens t
  join public.conversation_members cm on cm.user_id = t.user_id
  where cm.conversation_id = p_conversation and cm.user_id <> p_actor;
  if v_msgs is not null then
    perform net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      body := v_msgs,
      headers := jsonb_build_object('Content-Type', 'application/json', 'Accept', 'application/json')
    );
  end if;
exception when others then raise warning 'push_call_event failed: %', sqlerrm;
end;
$$;

create or replace function public.notify_call_start()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  perform public.push_call_event(new.conversation_id, new.caller_id,
    case new.kind when 'video' then 'Incoming video call' else 'Incoming voice call' end, new.id, 45);
  return new;
exception when others then raise warning 'notify_call_start failed: %', sqlerrm; return new;
end;
$$;

create or replace function public.notify_call_missed()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.status = 'missed' and old.status = 'ringing' then
    perform public.push_call_event(new.conversation_id, new.caller_id, 'Missed call', new.id, 86400);
  end if;
  return new;
exception when others then raise warning 'notify_call_missed failed: %', sqlerrm; return new;
end;
$$;

revoke all on function public.push_call_event(uuid, uuid, text, uuid, int) from public, anon, authenticated;
revoke all on function public.notify_call_start() from public, anon, authenticated;
revoke all on function public.notify_call_missed() from public, anon, authenticated;
revoke all on function public.start_call(uuid, text) from public, anon;
revoke all on function public.answer_call(uuid) from public, anon;
revoke all on function public.end_call(uuid) from public, anon;
revoke all on function public.ack_ringing(uuid) from public, anon;
revoke all on function public.pending_call(uuid) from public, anon;
grant execute on function public.start_call(uuid, text) to authenticated;
grant execute on function public.answer_call(uuid) to authenticated;
grant execute on function public.end_call(uuid) to authenticated;
grant execute on function public.ack_ringing(uuid) to authenticated;
grant execute on function public.pending_call(uuid) to authenticated;

create trigger on_call_start_push after insert on public.calls for each row execute function public.notify_call_start();
create trigger on_call_missed_push after update of status on public.calls for each row execute function public.notify_call_missed();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'calls'
  ) then alter publication supabase_realtime add table public.calls; end if;
end
$$;

commit;
