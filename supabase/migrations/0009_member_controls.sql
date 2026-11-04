begin;

create or replace function public.list_members()
returns table (id uuid, username text, display_name text, email text, status text, last_seen_at timestamptz, created_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  return query
    select p.id, p.username, p.display_name, u.email::text, p.status, p.last_seen_at, p.created_at
    from public.profiles p
    join auth.users u on u.id = p.id
    order by p.created_at;
end;
$$;

create or replace function public.disable_account(p_user uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  if p_user = auth.uid() then raise exception 'cannot disable yourself'; end if;
  update public.profiles
  set status = 'rejected', approved_at = null
  where id = p_user;
  delete from auth.sessions where user_id = p_user;
  delete from auth.refresh_tokens where user_id = p_user;
  delete from public.push_tokens where user_id = p_user;
end;
$$;

revoke all on function public.list_members() from public, anon;
revoke all on function public.disable_account(uuid) from public, anon;
grant execute on function public.list_members() to authenticated;
grant execute on function public.disable_account(uuid) to authenticated;

commit;
