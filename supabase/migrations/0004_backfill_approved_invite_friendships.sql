begin;

do $$
declare
  v_profile record;
  v_conversation uuid;
  v_key text;
begin
  for v_profile in
    select id, invited_by
    from public.profiles
    where status = 'approved'
      and invited_by is not null
  loop
    insert into public.friendships (requester_id, addressee_id, status)
    values (v_profile.invited_by, v_profile.id, 'accepted')
    on conflict (least(requester_id, addressee_id), greatest(requester_id, addressee_id))
    do update set status = 'accepted', updated_at = now();

    v_key := least(v_profile.invited_by, v_profile.id)::text || ':' || greatest(v_profile.invited_by, v_profile.id)::text;
    insert into public.conversations (kind, created_by, direct_key)
    values ('direct', v_profile.invited_by, v_key)
    on conflict (direct_key) do nothing
    returning id into v_conversation;

    if v_conversation is null then
      select id into v_conversation
      from public.conversations
      where direct_key = v_key;
    end if;

    insert into public.conversation_members (conversation_id, user_id, role)
    values
      (v_conversation, v_profile.invited_by, 'member'),
      (v_conversation, v_profile.id, 'member')
    on conflict (conversation_id, user_id) do nothing;
  end loop;
end;
$$;

commit;
