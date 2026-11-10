-- voli update 022: show the member's age (السن) next to the gender sign on every profile.
-- Run once in the SQL Editor AFTER supabase/021_profile_extras.sql. Safe to run again.
--
--   The age is worked out from the saved birthday every time, so it goes up by itself on each birthday.
--   Everyone sees the age; the exact birthday is still seen by the member only.
begin;

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
    'country_hidden', hidden,
    'birthday', case when p_auth = me then i.birthday end,
    'age', case when i.birthday is not null then extract(year from age(current_date, i.birthday))::int end,
    'album', to_jsonb(coalesce(i.album, '{}'::text[])));
end;
$$;
revoke all on function public.profile_info(uuid) from public, anon;
grant execute on function public.profile_info(uuid) to authenticated;

commit;
