-- Admin notices chat: the account with public ID 100 is the management notices account.
-- Members can only receive from it; nobody can send a message to it. Re-runnable.
-- Creates a non-login system identity, not a staff/member account. Run AFTER the starter SQL.
begin;

-- Reserve ID 100 exclusively for this system identity; ordinary signup IDs stay seven digits.
do $$
declare c record;
begin
  if exists (select 1 from public.profiles where public_id = 100 and auth_id <> '00000000-0000-4000-8000-000000000100') then
    raise exception 'ID 100 already belongs to another account; no accounts were changed';
  end if;
  if exists (select 1 from auth.users where id = '00000000-0000-4000-8000-000000000100'
      and coalesce(raw_user_meta_data->>'voli_system_account', '') <> 'admin_notices') then
    raise exception 'Voli Helper system UUID is occupied; no accounts were changed';
  end if;
  -- Remove only the starter's public-ID range check, even if PostgreSQL named it differently.
  for c in select conname from pg_constraint
    where conrelid = 'public.profiles'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%public_id%'
      and pg_get_constraintdef(oid) like '%1000000%'
      and pg_get_constraintdef(oid) like '%9999999%'
  loop
    execute format('alter table public.profiles drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.profiles add constraint profiles_public_id_check check (
  public_id between 1000000 and 9999999
  or (public_id = 100 and auth_id = '00000000-0000-4000-8000-000000000100')
);

-- No email, password, provider identity or admin role: this account cannot sign in.
-- The normal signup trigger creates its profile/internal UID before we assign the reserved ID.
insert into auth.users (id, aud, role, raw_user_meta_data, banned_until, created_at, updated_at)
values ('00000000-0000-4000-8000-000000000100', 'authenticated', 'authenticated',
  '{"display_name":"Voli Helper","voli_system_account":"admin_notices"}'::jsonb,
  'infinity'::timestamptz, now(), now())
on conflict (id) do nothing;
select public.ensure_account('00000000-0000-4000-8000-000000000100', '{"display_name":"Voli Helper"}'::jsonb);
update public.profiles set public_id = 100, display_name = 'Voli Helper',
  bio = 'إشعارات رسمية من إدارة voli'
where auth_id = '00000000-0000-4000-8000-000000000100';

create or replace function public.is_admin_notice_account(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where auth_id = p and public_id = 100);
$$;
revoke all on function public.is_admin_notice_account(uuid) from public, anon;
grant execute on function public.is_admin_notice_account(uuid) to authenticated, service_role;

drop policy if exists messages_send on public.messages;
create policy messages_send on public.messages for insert to authenticated
  with check (auth.uid() = sender_id and read_at is null and not public.is_admin_notice_account(recipient_id));

commit;
