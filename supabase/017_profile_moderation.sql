-- voli update 017: management removes a rule-breaking name or picture, warns the member, and can stop them changing it.
-- Run once in the SQL Editor AFTER sql/014_admin_grant_notices.sql. Safe to run again.
--
--   Remove name    -> display_name becomes 'voli' || public_id (e.g. voli545545)
--   Remove picture -> avatar_url becomes null
--   Each removal sends an English warning from Voli Helper (ID 100) and is logged.
--   Locks: name / picture changes can be blocked for N days or forever; admins are never blocked.
begin;

create table if not exists public.profile_edit_locks (
  auth_id uuid primary key references public.profiles(auth_id) on delete cascade,
  name_locked_until timestamptz,
  avatar_locked_until timestamptz,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
revoke all on public.profile_edit_locks from public, anon, authenticated;
grant all on public.profile_edit_locks to service_role;
alter table public.profile_edit_locks enable row level security;

-- 'infinity' = forever, null / past = not locked.
create or replace function public.voli_lock_until(p_days integer, p_forever boolean) returns timestamptz
language sql stable set search_path = '' as $$
  select case when coalesce(p_forever, false) then 'infinity'::timestamptz
              when p_days is null or p_days <= 0 then null
              else now() + make_interval(days => p_days) end
$$;
revoke all on function public.voli_lock_until(integer, boolean) from public, anon, authenticated;

create or replace function public.voli_lock_text(p_until timestamptz) returns text
language sql stable set search_path = '' as $$
  select case when p_until is null or p_until <= now() then ''
              when p_until = 'infinity'::timestamptz then ' You can no longer change it.'
              else ' You cannot change it for ' || greatest(1, ceil(extract(epoch from (p_until - now())) / 86400))::int::text || ' days.' end
$$;
revoke all on function public.voli_lock_text(timestamptz) from public, anon, authenticated;

-- ---------- Enforcement: members cannot change a locked name / picture ----------
create or replace function public.voli_profile_lock_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare l public.profile_edit_locks;
begin
  if auth.uid() is null or public.has_role(auth.uid(), 'admin') then return new; end if;
  select * into l from public.profile_edit_locks where auth_id = new.auth_id;
  if not found then return new; end if;
  if new.display_name is distinct from old.display_name and l.name_locked_until > now() then
    raise exception 'Name changes are blocked' using errcode = 'P0001', hint = 'name_locked';
  end if;
  if new.avatar_url is distinct from old.avatar_url and l.avatar_locked_until > now() then
    raise exception 'Picture changes are blocked' using errcode = 'P0001', hint = 'avatar_locked';
  end if;
  return new;
end;
$$;
drop trigger if exists profile_lock_guard on public.profiles;
create trigger profile_lock_guard before update of display_name, avatar_url on public.profiles
  for each row execute function public.voli_profile_lock_guard();

-- ---------- Panel: set / clear a lock ----------
create or replace function public.admin_profile_lock(p_auth uuid, p_field text, p_days integer default null, p_forever boolean default false)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare me uuid := public.admin_guard(); u timestamptz := public.voli_lock_until(p_days, p_forever);
begin
  perform public.admin_member_exists(p_auth);
  if p_field not in ('name', 'avatar') then raise exception 'Bad field' using errcode = 'P0001', hint = 'bad_field'; end if;
  insert into public.profile_edit_locks(auth_id, name_locked_until, avatar_locked_until, updated_by)
    values (p_auth, case when p_field = 'name' then u end, case when p_field = 'avatar' then u end, me)
  on conflict (auth_id) do update set
    name_locked_until = case when p_field = 'name' then u else profile_edit_locks.name_locked_until end,
    avatar_locked_until = case when p_field = 'avatar' then u else profile_edit_locks.avatar_locked_until end,
    updated_by = me, updated_at = now();
  perform public.admin_log(me, 'profile_lock', p_auth, jsonb_build_object('field', p_field, 'days', p_days, 'forever', coalesce(p_forever, false)));
  return u;
end;
$$;
revoke all on function public.admin_profile_lock(uuid, text, integer, boolean) from public, anon;
grant execute on function public.admin_profile_lock(uuid, text, integer, boolean) to authenticated;

create or replace function public.admin_profile_locks(p_auth uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.admin_guard(); l public.profile_edit_locks;
begin
  select * into l from public.profile_edit_locks where auth_id = p_auth;
  return jsonb_build_object(
    'name_until', case when l.name_locked_until > now() then l.name_locked_until end,
    'avatar_until', case when l.avatar_locked_until > now() then l.avatar_locked_until end);
end;
$$;
revoke all on function public.admin_profile_locks(uuid) from public, anon;
grant execute on function public.admin_profile_locks(uuid) to authenticated;

-- ---------- Panel: remove a rule-breaking name / picture, warn, optionally lock ----------
create or replace function public.admin_profile_violation(p_auth uuid, p_field text, p_days integer default null, p_forever boolean default false)
returns text language plpgsql security definer set search_path = '' as $$
declare me uuid := public.admin_guard(); pid bigint; u timestamptz; newname text; body text;
begin
  perform public.admin_member_exists(p_auth);
  if p_field not in ('name', 'avatar') then raise exception 'Bad field' using errcode = 'P0001', hint = 'bad_field'; end if;
  select public_id into pid from public.profiles where auth_id = p_auth for update;
  if p_field = 'name' then
    newname := 'voli' || pid::text;
    update public.profiles set display_name = newname where auth_id = p_auth;
  else
    update public.profiles set avatar_url = null where auth_id = p_auth;
  end if;
  u := public.voli_lock_until(p_days, p_forever);
  if u is not null then perform public.admin_profile_lock(p_auth, p_field, p_days, p_forever); end if;
  body := 'Warning: your ' || case when p_field = 'name' then 'name' else 'profile picture' end
       || ' violates Voli community rules and has been removed.' || public.voli_lock_text(u);
  perform public.voli_helper_notice(p_auth, body);
  perform public.admin_log(me, 'profile_violation', p_auth, jsonb_build_object('field', p_field, 'days', p_days, 'forever', coalesce(p_forever, false), 'name', newname));
  return body;
end;
$$;
revoke all on function public.admin_profile_violation(uuid, text, integer, boolean) from public, anon;
grant execute on function public.admin_profile_violation(uuid, text, integer, boolean) to authenticated;

commit;
