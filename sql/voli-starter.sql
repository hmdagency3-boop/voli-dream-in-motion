-- voli starter schema: safe to run more than once in your external project's SQL Editor.
-- Auth UUID identifies ownership; public.account_uids.uid is a separate internal sequence that clients can never read.
-- Re-running keeps existing rows, adds missing columns (bio, updated_at), refreshes grants,
-- policies and the signup trigger, and creates missing accounts for users who signed up earlier.
begin;

-- ---------- Internal sequential UIDs (no client access at all) ----------
-- Earlier versions kept this table in a "private" schema: move it (rows and sequence kept).
do $$
begin
  if to_regclass('public.account_uids') is null and to_regclass('private.account_uids') is not null then
    alter table private.account_uids set schema public;
  end if;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists private.create_account();
drop function if exists private.ensure_account(uuid, jsonb);

create table if not exists public.account_uids (
  auth_id uuid primary key references auth.users(id) on delete cascade,
  uid bigint generated always as identity (start with 20000) unique not null
);
-- Internal UIDs start at 20000. On an existing table, restart at 20000 (or after the highest
-- UID already at or above 20000, so a re-run never repeats a number), then renumber any older
-- UIDs below 20000 in their original order.
alter table public.account_uids alter column uid set start with 20000;
do $$
declare next_uid bigint; r record;
begin
  select greatest(20000, coalesce(max(uid) + 1, 20000)) into next_uid from public.account_uids where uid >= 20000;
  execute format('alter table public.account_uids alter column uid restart with %s', next_uid);
  for r in select auth_id from public.account_uids where uid < 20000 order by uid loop
    update public.account_uids set uid = default where auth_id = r.auth_id;
  end loop;
end $$;
-- RLS on with no policies, and no grants: the Data API can never read or change these rows.
revoke all on public.account_uids from public, anon, authenticated;
grant all on public.account_uids to service_role;
alter table public.account_uids enable row level security;
drop policy if exists account_uids_service on public.account_uids;

-- ---------- Profiles ----------
create table if not exists public.profiles (
  auth_id uuid primary key references auth.users(id) on delete cascade,
  public_id integer unique not null check (public_id between 1000000 and 9999999),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 60),
  avatar_url text,
  bio text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Columns added after the first version of this script.
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists created_at timestamptz not null default now();
alter table public.profiles add column if not exists updated_at timestamptz not null default now();
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.profiles'::regclass and conname = 'profiles_bio_length') then
    alter table public.profiles add constraint profiles_bio_length check (bio is null or char_length(bio) <= 300);
  end if;
end $$;

-- Supabase grants every new public table to anon/authenticated by default; reset to the exact columns allowed.
revoke all on public.profiles from public, anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, avatar_url, bio) on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using (true);
drop policy if exists profiles_edit_own on public.profiles;
create policy profiles_edit_own on public.profiles for update to authenticated using (auth.uid() = auth_id) with check (auth.uid() = auth_id);

drop trigger if exists profiles_touch_updated_at on public.profiles;
drop function if exists private.touch_updated_at();
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.touch_updated_at() from public, anon, authenticated;
create trigger profiles_touch_updated_at before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------- Account creation (signup trigger + backfill) ----------
-- Creates the internal UID and public profile for one auth user; skips parts that already exist.
create or replace function public.ensure_account(p_auth_id uuid, p_meta jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare candidate integer; attempts integer := 0; name text;
begin
  insert into public.account_uids(auth_id) values (p_auth_id) on conflict (auth_id) do nothing;
  if exists (select 1 from public.profiles where auth_id = p_auth_id) then return; end if;
  name := coalesce(nullif(left(btrim(coalesce(p_meta->>'display_name', '')), 60), ''), 'مستخدم');
  loop
    attempts := attempts + 1;
    if attempts > 100 then raise exception 'Public ID allocation unavailable'; end if;
    candidate := 1000000 + floor(random() * 9000000)::integer;
    begin
      insert into public.profiles(auth_id, public_id, display_name) values (p_auth_id, candidate, name);
      exit;
    exception when unique_violation then
      -- Retry only a public-ID collision; all other constraints must fail.
      if exists (select 1 from public.profiles where auth_id = p_auth_id) then raise; end if;
    end;
  end loop;
end;
$$;
-- Not callable from the app: only the signup trigger and this script use it.
revoke all on function public.ensure_account(uuid, jsonb) from public, anon, authenticated;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.ensure_account(new.id, new.raw_user_meta_data);
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Users who signed up before this script ran get their UID and profile now, in signup order.
do $$
declare r record;
begin
  for r in
    select u.id, u.raw_user_meta_data from auth.users u
    where not exists (select 1 from public.account_uids a where a.auth_id = u.id)
       or not exists (select 1 from public.profiles p where p.auth_id = u.id)
    order by u.created_at, u.id
  loop
    perform public.ensure_account(r.id, r.raw_user_meta_data);
  end loop;
end $$;

-- ---------- Follows ----------
create table if not exists public.follows (
  follower_id uuid not null references public.profiles(auth_id) on delete cascade,
  following_id uuid not null references public.profiles(auth_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);
revoke all on public.follows from public, anon, authenticated;
grant select, insert, delete on public.follows to authenticated;
grant all on public.follows to service_role;
alter table public.follows enable row level security;
drop policy if exists follows_read on public.follows;
create policy follows_read on public.follows for select to authenticated using (true);
drop policy if exists follows_add on public.follows;
create policy follows_add on public.follows for insert to authenticated with check (auth.uid() = follower_id);
drop policy if exists follows_remove on public.follows;
create policy follows_remove on public.follows for delete to authenticated using (auth.uid() = follower_id);
create index if not exists follows_following_idx on public.follows(following_id);

-- ---------- Streams (metadata only: this table does not supply a live-video streaming service) ----------
create table if not exists public.streams (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles(auth_id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  category text not null check (category in ('غناء', 'ألعاب', 'دردشة', 'DJ', 'كوميديا', 'رقص')),
  status text not null default 'draft' check (status in ('draft', 'live', 'ended')),
  cover_url text,
  created_at timestamptz not null default now()
);
revoke all on public.streams from public, anon, authenticated;
grant select, insert, update, delete on public.streams to authenticated;
grant all on public.streams to service_role;
alter table public.streams enable row level security;
drop policy if exists streams_read on public.streams;
create policy streams_read on public.streams for select to authenticated using (status = 'live' or auth.uid() = host_id);
drop policy if exists streams_create on public.streams;
create policy streams_create on public.streams for insert to authenticated with check (auth.uid() = host_id);
drop policy if exists streams_edit on public.streams;
create policy streams_edit on public.streams for update to authenticated using (auth.uid() = host_id) with check (auth.uid() = host_id);
drop policy if exists streams_remove on public.streams;
create policy streams_remove on public.streams for delete to authenticated using (auth.uid() = host_id);
create index if not exists streams_host_idx on public.streams(host_id);
create index if not exists streams_live_idx on public.streams(category) where status = 'live';

-- ---------- Direct messages ----------
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(auth_id) on delete cascade,
  recipient_id uuid not null references public.profiles(auth_id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  check (sender_id <> recipient_id)
);
revoke all on public.messages from public, anon, authenticated;
grant select on public.messages to authenticated;
grant insert (sender_id, recipient_id, body) on public.messages to authenticated;
grant update (read_at) on public.messages to authenticated;
grant all on public.messages to service_role;
alter table public.messages enable row level security;
drop policy if exists messages_read on public.messages;
create policy messages_read on public.messages for select to authenticated using (auth.uid() in (sender_id, recipient_id));
drop policy if exists messages_send on public.messages;
create policy messages_send on public.messages for insert to authenticated with check (auth.uid() = sender_id and read_at is null);
drop policy if exists messages_mark_read on public.messages;
create policy messages_mark_read on public.messages for update to authenticated using (auth.uid() = recipient_id) with check (auth.uid() = recipient_id);
create index if not exists messages_sender_idx on public.messages(sender_id, created_at desc);
create index if not exists messages_recipient_idx on public.messages(recipient_id, created_at desc);

commit;
