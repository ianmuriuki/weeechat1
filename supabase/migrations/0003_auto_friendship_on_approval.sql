begin;

create or replace function public.set_account_status(p_user uuid, p_status text)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_invited_by uuid;
  v_conversation uuid;
  v_key text;
begin
  if not public.is_admin() then
    raise exception 'not allowed';
  end if;
  if p_status not in ('approved', 'rejected') then
    raise exception 'invalid status';
  end if;
  if p_user = auth.uid() then
    raise exception 'cannot change your own status';
  end if;

  select invited_by into v_invited_by
  from public.profiles
  where id = p_user;

  update public.profiles
  set status = p_status, approved_at = case when p_status = 'approved' then now() else null end
  where id = p_user;

  if p_status = 'approved' and v_invited_by is not null then
    insert into public.friendships (requester_id, addressee_id, status)
    values (v_invited_by, p_user, 'accepted')
    on conflict (least(requester_id, addressee_id), greatest(requester_id, addressee_id))
    do update set status = 'accepted', updated_at = now();

    v_key := least(v_invited_by, p_user)::text || ':' || greatest(v_invited_by, p_user)::text;
    insert into public.conversations (kind, created_by, direct_key)
    values ('direct', auth.uid(), v_key)
    on conflict (direct_key) do nothing
    returning id into v_conversation;

    if v_conversation is null then
      select id into v_conversation
      from public.conversations
      where direct_key = v_key;
    end if;

    insert into public.conversation_members (conversation_id, user_id, role)
    values
      (v_conversation, v_invited_by, 'member'),
      (v_conversation, p_user, 'member')
    on conflict (conversation_id, user_id) do nothing;
  end if;
end;
$$;

revoke all on function public.set_account_status(uuid, text) from public, anon;
grant execute on function public.set_account_status(uuid, text) to authenticated;

commit;
