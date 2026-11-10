-- voli update 020: gender (الجنس) and country (الدولة) on member profiles.
-- Run once in the SQL Editor AFTER supabase/003_vip.sql. Safe to run again.
--
--   Members pick their own gender and country from their profile page.
--   Gender: 'male' or 'female'. Country: a two-letter country code, e.g. 'EG', 'SA'.
--   A member who turned on "hide location" (VIP 2+) keeps their country hidden from everyone else.
--   The table is closed to the app; reading and saving go through the two functions below.
begin;

create table if not exists public.member_info (
  auth_id uuid primary key references public.profiles(auth_id) on delete cascade,
  gender text,
  country text,
  updated_at timestamptz not null default now()
);
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.member_info'::regclass and conname = 'member_info_gender_check') then
    alter table public.member_info add constraint member_info_gender_check check (gender is null or gender in ('male', 'female'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.member_info'::regclass and conname = 'member_info_country_check') then
    alter table public.member_info add constraint member_info_country_check check (country is null or country ~ '^[A-Z]{2}$');
  end if;
end $$;
revoke all on public.member_info from public, anon, authenticated;
grant all on public.member_info to service_role;
alter table public.member_info enable row level security;

-- Save my own gender and country (null clears one).
create or replace function public.set_my_profile_info(p_gender text, p_country text) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); g text := nullif(lower(trim(p_gender)), ''); c text := nullif(upper(trim(p_country)), '');
begin
  if me is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles where auth_id = me) then raise exception 'No profile' using errcode = 'P0001'; end if;
  if g is not null and g not in ('male', 'female') then raise exception 'Bad gender' using errcode = '22023', hint = 'bad_gender'; end if;
  if c is not null and c !~ '^[A-Z]{2}$' then raise exception 'Bad country' using errcode = '22023', hint = 'bad_country'; end if;
  insert into public.member_info(auth_id, gender, country) values (me, g, c)
  on conflict (auth_id) do update set gender = excluded.gender, country = excluded.country, updated_at = now();
end;
$$;
revoke all on function public.set_my_profile_info(text, text) from public, anon;
grant execute on function public.set_my_profile_info(text, text) to authenticated;

-- Read a member's gender and country. The country comes back null for other people
-- while the member's "hide location" is on and their VIP tier still allows it.
create or replace function public.profile_info(p_auth uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := auth.uid(); i public.member_info; hidden boolean;
begin
  if me is null then return null; end if;
  select * into i from public.member_info where auth_id = p_auth;
  select coalesce(p.hide_location, false) and public.vip_has(p.auth_id, 'hide_location') into hidden
    from public.profiles p where p.auth_id = p_auth;
  hidden := coalesce(hidden, false);
  return jsonb_build_object(
    'gender', i.gender,
    'country', case when hidden and p_auth is distinct from me then null else i.country end,
    'country_hidden', hidden);
end;
$$;
revoke all on function public.profile_info(uuid) from public, anon;
grant execute on function public.profile_info(uuid) to authenticated;

commit;
