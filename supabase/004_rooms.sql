-- voli update 004: party rooms (روم الحفلة). Run after 003_vip.sql. Safe to run again.
-- Holds room settings, who is inside, mic seats and room chat. It does NOT carry live voice or video:
-- that needs a separate voice service connected later.
--
-- Every change goes through the functions below (security definer), so members can only read the tables.
-- One room per member; the room is reached by the owner's public ID.

-- ---------- 1) Tables ----------
create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references public.profiles(auth_id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  cover_url text check (cover_url is null or char_length(cover_url) <= 1000),
  mode text not null default 'audio' check (mode in ('audio', 'video')),
  seat_count smallint not null default 10 check (seat_count in (5, 10, 15, 20)),
  theme text not null default 'default' check (theme in ('default', 'night', 'violet', 'gold')),
  announcement text not null default '' check (char_length(announcement) <= 300),
  locked boolean not null default false,
  is_live boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Room password (hashed). Never readable by members.
create table if not exists public.room_secrets (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  salt text not null,
  hash text not null
);

create table if not exists public.room_members (
  room_id uuid not null references public.rooms(id) on delete cascade,
  auth_id uuid not null references public.profiles(auth_id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  primary key (room_id, auth_id)
);
create index if not exists room_members_auth_idx on public.room_members(auth_id);

-- Only taken seats have a row.
create table if not exists public.room_seats (
  room_id uuid not null references public.rooms(id) on delete cascade,
  seat_no smallint not null check (seat_no between 1 and 20),
  auth_id uuid not null references public.profiles(auth_id) on delete cascade,
  taken_at timestamptz not null default now(),
  primary key (room_id, seat_no),
  unique (room_id, auth_id)
);

create table if not exists public.room_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  sender_id uuid not null references public.profiles(auth_id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 300),
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists room_messages_room_idx on public.room_messages(room_id, created_at);

-- Members removed from a room cannot come back until the time ends.
create table if not exists public.room_kicks (
  room_id uuid not null references public.rooms(id) on delete cascade,
  auth_id uuid not null references public.profiles(auth_id) on delete cascade,
  until timestamptz not null,
  primary key (room_id, auth_id)
);

-- ---------- 2) Access: read-only for members, nothing for visitors ----------
revoke all on public.rooms, public.room_secrets, public.room_members, public.room_seats, public.room_messages, public.room_kicks
  from public, anon, authenticated;
grant select on public.rooms, public.room_members, public.room_seats, public.room_messages to authenticated;
grant all on public.rooms, public.room_secrets, public.room_members, public.room_seats, public.room_messages, public.room_kicks to service_role;
alter table public.rooms enable row level security;
alter table public.room_secrets enable row level security;
alter table public.room_members enable row level security;
alter table public.room_seats enable row level security;
alter table public.room_messages enable row level security;
alter table public.room_kicks enable row level security;

-- Seconds a member stays "inside" without a heartbeat.
create or replace function public.room_presence_seconds() returns int language sql immutable as $$ select 60 $$;

create or replace function public.in_room(p_room uuid, p_auth_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.room_members m
    where m.room_id = p_room and m.auth_id = p_auth_id
      and m.last_seen > now() - make_interval(secs => public.room_presence_seconds())
  )
$$;
revoke all on function public.in_room(uuid, uuid) from public, anon;
grant execute on function public.in_room(uuid, uuid) to authenticated;

drop policy if exists rooms_read on public.rooms;
create policy rooms_read on public.rooms for select to authenticated using (is_live or owner_id = auth.uid());
drop policy if exists room_members_read on public.room_members;
create policy room_members_read on public.room_members for select to authenticated
  using (exists (select 1 from public.rooms r where r.id = room_id and (r.is_live or r.owner_id = auth.uid())));
drop policy if exists room_seats_read on public.room_seats;
create policy room_seats_read on public.room_seats for select to authenticated
  using (exists (select 1 from public.rooms r where r.id = room_id and (r.is_live or r.owner_id = auth.uid())));
drop policy if exists room_messages_read on public.room_messages;
create policy room_messages_read on public.room_messages for select to authenticated using (public.in_room(room_id, auth.uid()));

drop trigger if exists rooms_touch on public.rooms;
create or replace function public.rooms_touch() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end; $$;
create trigger rooms_touch before update on public.rooms for each row execute function public.rooms_touch();

-- ---------- 3) Owner: start / end the party ----------
create or replace function public.room_hash(p_salt text, p_password text) returns text
language sql immutable set search_path = '' as $$ select encode(sha256(convert_to(p_salt || ':' || p_password, 'UTF8')), 'hex') $$;
revoke all on function public.room_hash(text, text) from public, anon, authenticated;

-- Saves the room settings, makes it live and puts the owner inside. Returns the room id.
-- p_password: null keeps the current lock, '' removes the lock, 4–8 digits sets a new password.
create or replace function public.start_party(
  p_name text, p_cover_url text, p_mode text, p_seat_count int, p_theme text, p_announcement text, p_password text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); rid uuid; s text;
begin
  if me is null then raise exception 'not_signed_in' using errcode = '28000'; end if;
  if p_password is not null and p_password <> '' and p_password !~ '^[0-9]{4,8}$' then
    raise exception 'bad_password' using errcode = '22023';
  end if;
  insert into public.rooms as r (owner_id, name, cover_url, mode, seat_count, theme, announcement, is_live)
  values (me, btrim(p_name), nullif(btrim(p_cover_url), ''), p_mode, p_seat_count, p_theme, coalesce(btrim(p_announcement), ''), true)
  on conflict (owner_id) do update set
    name = excluded.name, cover_url = excluded.cover_url, mode = excluded.mode, seat_count = excluded.seat_count,
    theme = excluded.theme, announcement = excluded.announcement, is_live = true
  returning r.id into rid;

  if p_password = '' then
    delete from public.room_secrets where room_id = rid;
    update public.rooms set locked = false where id = rid;
  elsif p_password is not null then
    s := md5(random()::text || clock_timestamp()::text);
    insert into public.room_secrets(room_id, salt, hash) values (rid, s, public.room_hash(s, p_password))
    on conflict (room_id) do update set salt = excluded.salt, hash = excluded.hash;
    update public.rooms set locked = true where id = rid;
  end if;

  -- Fewer seats: free the ones that no longer exist.
  delete from public.room_seats where room_id = rid and seat_no > p_seat_count;
  insert into public.room_members(room_id, auth_id) values (rid, me)
  on conflict (room_id, auth_id) do update set last_seen = now();
  return rid;
end;
$$;
revoke all on function public.start_party(text, text, text, int, text, text, text) from public, anon;
grant execute on function public.start_party(text, text, text, int, text, text, text) to authenticated;

-- Ends the party: room goes offline, everyone leaves, seats are freed. Chat history is cleared.
create or replace function public.end_party() returns void
language plpgsql security definer set search_path = '' as $$
declare rid uuid;
begin
  select id into rid from public.rooms where owner_id = auth.uid();
  if rid is null then return; end if;
  update public.rooms set is_live = false where id = rid;
  delete from public.room_members where room_id = rid;
  delete from public.room_seats where room_id = rid;
  delete from public.room_messages where room_id = rid;
  delete from public.room_kicks where room_id = rid;
end;
$$;
revoke all on function public.end_party() from public, anon;
grant execute on function public.end_party() to authenticated;

-- ---------- 4) Members: enter, stay, leave ----------
-- Returns 'ok', 'not_found', 'not_live', 'wrong_password' or 'kicked'. Calling it again is the heartbeat.
create or replace function public.enter_room(p_room uuid, p_password text default null) returns text
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); r public.rooms; sec public.room_secrets;
begin
  if me is null then raise exception 'not_signed_in' using errcode = '28000'; end if;
  select * into r from public.rooms where id = p_room;
  if not found then return 'not_found'; end if;
  if not r.is_live then return 'not_live'; end if;

  -- Drop members who left without saying so, and their seats.
  delete from public.room_seats s using public.room_members m
   where s.room_id = p_room and m.room_id = p_room and m.auth_id = s.auth_id
     and m.last_seen <= now() - make_interval(secs => public.room_presence_seconds());
  delete from public.room_members where room_id = p_room and last_seen <= now() - make_interval(secs => public.room_presence_seconds());

  if r.owner_id <> me then
    if exists (select 1 from public.room_kicks where room_id = p_room and auth_id = me and until > now()) then return 'kicked'; end if;
    if r.locked and not exists (select 1 from public.room_members where room_id = p_room and auth_id = me) then
      select * into sec from public.room_secrets where room_id = p_room;
      if p_password is null or sec.hash is null or public.room_hash(sec.salt, p_password) <> sec.hash then return 'wrong_password'; end if;
    end if;
  end if;

  insert into public.room_members(room_id, auth_id) values (p_room, me)
  on conflict (room_id, auth_id) do update set last_seen = now();
  return 'ok';
end;
$$;
revoke all on function public.enter_room(uuid, text) from public, anon;
grant execute on function public.enter_room(uuid, text) to authenticated;

create or replace function public.leave_room(p_room uuid) returns void
language sql security definer set search_path = '' as $$
  delete from public.room_seats where room_id = p_room and auth_id = auth.uid();
  delete from public.room_members where room_id = p_room and auth_id = auth.uid();
$$;
revoke all on function public.leave_room(uuid) from public, anon;
grant execute on function public.leave_room(uuid) to authenticated;

-- ---------- 5) Mic seats ----------
-- Returns 'ok', 'not_in_room', 'no_seat' or 'taken'. Moves the member if they already sit elsewhere.
create or replace function public.take_seat(p_room uuid, p_seat int) returns text
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); n smallint;
begin
  if not public.in_room(p_room, me) then return 'not_in_room'; end if;
  select seat_count into n from public.rooms where id = p_room and is_live;
  if n is null or p_seat < 1 or p_seat > n then return 'no_seat'; end if;
  if exists (select 1 from public.room_seats where room_id = p_room and seat_no = p_seat) then
    return case when exists (select 1 from public.room_seats where room_id = p_room and seat_no = p_seat and auth_id = me) then 'ok' else 'taken' end;
  end if;
  delete from public.room_seats where room_id = p_room and auth_id = me;
  insert into public.room_seats(room_id, seat_no, auth_id) values (p_room, p_seat, me);
  return 'ok';
end;
$$;
revoke all on function public.take_seat(uuid, int) from public, anon;
grant execute on function public.take_seat(uuid, int) to authenticated;

create or replace function public.leave_seat(p_room uuid) returns void
language sql security definer set search_path = '' as $$
  delete from public.room_seats where room_id = p_room and auth_id = auth.uid();
$$;
revoke all on function public.leave_seat(uuid) from public, anon;
grant execute on function public.leave_seat(uuid) to authenticated;

-- ---------- 6) Room chat ----------
create or replace function public.send_room_message(p_room uuid, p_body text) returns text
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); t text := btrim(coalesce(p_body, ''));
begin
  if not public.in_room(p_room, me) then return 'not_in_room'; end if;
  if t = '' then return 'empty'; end if;
  insert into public.room_messages(room_id, sender_id, body) values (p_room, me, left(t, 300));
  return 'ok';
end;
$$;
revoke all on function public.send_room_message(uuid, text) from public, anon;
grant execute on function public.send_room_message(uuid, text) to authenticated;

-- ---------- 7) Removing a member (10 minutes) ----------
-- Owner can remove anyone except top management; others follow the VIP room rules (can_mute_or_kick).
create or replace function public.kick_from_room(p_room uuid, p_target uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); owner uuid;
begin
  select owner_id into owner from public.rooms where id = p_room;
  if owner is null then return 'not_found'; end if;
  if p_target = owner or p_target = me then return 'not_allowed'; end if;
  if not ((owner = me and not public.has_role(p_target, 'admin')) or public.can_mute_or_kick(me, p_target)) then
    return 'not_allowed';
  end if;
  delete from public.room_seats where room_id = p_room and auth_id = p_target;
  delete from public.room_members where room_id = p_room and auth_id = p_target;
  insert into public.room_kicks(room_id, auth_id, until) values (p_room, p_target, now() + interval '10 minutes')
  on conflict (room_id, auth_id) do update set until = excluded.until;
  return 'ok';
end;
$$;
revoke all on function public.kick_from_room(uuid, uuid) from public, anon;
grant execute on function public.kick_from_room(uuid, uuid) to authenticated;

-- ---------- 8) Room cover pictures (public bucket; each member writes only in their own folder) ----------
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public) values ('room-covers', 'room-covers', true)
    on conflict (id) do update set public = true;
    execute 'drop policy if exists room_covers_read on storage.objects';
    execute $p$create policy room_covers_read on storage.objects for select to public using (bucket_id = 'room-covers')$p$;
    execute 'drop policy if exists room_covers_add on storage.objects';
    execute $p$create policy room_covers_add on storage.objects for insert to authenticated
      with check (bucket_id = 'room-covers' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
    execute 'drop policy if exists room_covers_edit on storage.objects';
    execute $p$create policy room_covers_edit on storage.objects for update to authenticated
      using (bucket_id = 'room-covers' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
    execute 'drop policy if exists room_covers_remove on storage.objects';
    execute $p$create policy room_covers_remove on storage.objects for delete to authenticated
      using (bucket_id = 'room-covers' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
  end if;
end;
$$;
