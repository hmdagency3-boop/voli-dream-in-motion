-- Update 002: VIP level and special ID (الايدي المميز). Run AFTER sql/voli-starter.sql. Safe to run more than once.
-- A special ID is shown instead of the normal seven-digit public ID. Only the admin sets it (SQL Editor),
-- so an admin can grant one at any VIP level. Example:
--   update public.profiles set vip_level = 50, special_id = '777' where public_id = 1234567;
--   update public.profiles set special_id = null where public_id = 1234567;  -- remove it
begin;

-- ---------- Columns (members can read them, never change them: no update grant) ----------
alter table public.profiles add column if not exists vip_level smallint not null default 0;
alter table public.profiles add column if not exists special_id text;
do $$
begin
  -- Skipped once update 003 has moved VIP to the 8 dragon tiers (profiles_vip_level_tier).
  if not exists (select 1 from pg_constraint where conrelid = 'public.profiles'::regclass and conname in ('profiles_vip_level_range', 'profiles_vip_level_tier')) then
    alter table public.profiles add constraint profiles_vip_level_range check (vip_level between 0 and 100);
  end if;
  -- Digits only, no leading zero, 1 to 10 digits.
  if not exists (select 1 from pg_constraint where conrelid = 'public.profiles'::regclass and conname = 'profiles_special_id_format') then
    alter table public.profiles add constraint profiles_special_id_format check (special_id is null or special_id ~ '^[1-9][0-9]{0,9}$');
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.profiles'::regclass and conname = 'profiles_special_id_key') then
    alter table public.profiles add constraint profiles_special_id_key unique (special_id);
  end if;
end $$;

-- ---------- A special ID can never equal another member's normal ID (and new normal IDs skip special IDs) ----------
-- Raises unique_violation so the signup ID generator simply retries with another number.
create or replace function public.check_special_id_clash() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.special_id is not null and exists (
    select 1 from public.profiles p where p.public_id::text = new.special_id and p.auth_id <> new.auth_id
  ) then
    raise exception 'Special ID % is already a member ID', new.special_id using errcode = 'unique_violation';
  end if;
  if exists (
    select 1 from public.profiles p where p.special_id = new.public_id::text and p.auth_id <> new.auth_id
  ) then
    raise exception 'Public ID % is already a special ID', new.public_id using errcode = 'unique_violation';
  end if;
  return new;
end;
$$;
revoke all on function public.check_special_id_clash() from public, anon, authenticated;
drop trigger if exists profiles_special_id_clash on public.profiles;
create trigger profiles_special_id_clash before insert or update of public_id, special_id on public.profiles
  for each row execute function public.check_special_id_clash();

-- ---------- Re-assert member grants (profiles columns members may edit) ----------
revoke update on public.profiles from authenticated;
grant update (display_name, avatar_url, bio) on public.profiles to authenticated;
-- VIP settings added by update 003 stay editable when this file is run again.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'vip_invisible') then
    grant update (hide_location, vip_invisible) on public.profiles to authenticated;
  end if;
end $$;

commit;
