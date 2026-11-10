-- voli update 021: birthday (تاريخ الميلاد) and photo album (الألبوم، 5 صور) on member profiles.
-- Run once in the SQL Editor AFTER supabase/020_gender_country.sql. Safe to run again.
--
--   Both live in the closed member_info table from update 020; saving goes through the functions below.
--   Birthday: seen by the member only. Album: up to 5 Cloudinary pictures, seen by every signed-in member.
begin;

alter table public.member_info add column if not exists birthday date;
alter table public.member_info add column if not exists album text[] not null default '{}';
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.member_info'::regclass and conname = 'member_info_album_size') then
    alter table public.member_info add constraint member_info_album_size check (coalesce(array_length(album, 1), 0) <= 5);
  end if;
end $$;
revoke all on public.member_info from public, anon, authenticated;
grant all on public.member_info to service_role;

create or replace function public.voli_album_url_ok(p_url text) returns boolean
language sql immutable set search_path = '' as $$
  select p_url ~ '^https://res\.cloudinary\.com/zsxxjkqg/image/upload/[A-Za-z0-9._/,:-]+$' and char_length(p_url) <= 500
$$;
revoke all on function public.voli_album_url_ok(text) from public, anon, authenticated;

-- Save my own birthday (null clears it).
create or replace function public.set_my_birthday(p_birthday date) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles where auth_id = me) then raise exception 'No profile' using errcode = 'P0001'; end if;
  if p_birthday is not null and (p_birthday < date '1900-01-01' or p_birthday > current_date) then
    raise exception 'Bad birthday' using errcode = '22023', hint = 'bad_birthday';
  end if;
  insert into public.member_info(auth_id, birthday) values (me, p_birthday)
  on conflict (auth_id) do update set birthday = excluded.birthday, updated_at = now();
end;
$$;
revoke all on function public.set_my_birthday(date) from public, anon;
grant execute on function public.set_my_birthday(date) to authenticated;

-- Replace my whole album (in display order).
create or replace function public.set_my_album(p_urls text[]) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); urls text[] := coalesce(p_urls, '{}'); u text;
begin
  if me is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles where auth_id = me) then raise exception 'No profile' using errcode = 'P0001'; end if;
  if coalesce(array_length(urls, 1), 0) > 5 then raise exception 'Album is full' using errcode = '22023', hint = 'album_full'; end if;
  foreach u in array urls loop
    if u is null or not public.voli_album_url_ok(u) then raise exception 'Bad picture' using errcode = '22023', hint = 'bad_picture'; end if;
  end loop;
  insert into public.member_info(auth_id, album) values (me, urls)
  on conflict (auth_id) do update set album = excluded.album, updated_at = now();
end;
$$;
revoke all on function public.set_my_album(text[]) from public, anon;
grant execute on function public.set_my_album(text[]) to authenticated;

-- Same as update 020, plus the album for everyone and the birthday for the member only.
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
    'album', to_jsonb(coalesce(i.album, '{}'::text[])));
end;
$$;
revoke all on function public.profile_info(uuid) from public, anon;
grant execute on function public.profile_info(uuid) to authenticated;

commit;
