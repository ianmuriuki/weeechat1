begin;

create or replace function public.disable_account(p_user uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  if p_user = auth.uid() then raise exception 'cannot disable yourself'; end if;
  update public.profiles
  set status = 'rejected', approved_at = null
  where id = p_user;
  delete from auth.refresh_tokens where user_id = p_user;
  delete from auth.sessions where user_id = p_user;
  delete from public.push_tokens where user_id = p_user;
end;
$$;

commit;
