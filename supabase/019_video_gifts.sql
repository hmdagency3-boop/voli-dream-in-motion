-- voli update 019: video gifts (هدايا الفيديو).
-- Run once in the SQL Editor after updates 006, 009 and 013/018. Safe to run again.
--
-- 1) A gift can carry a video (video_url) next to its picture. The picture stays what the gift box shows;
--    the video plays inside the room for everyone there right after the gift is sent.
--    Only videos from Voli's Cloudinary account (cloud "zsxxjkqg", .mp4 / .webm / .mov) are accepted.
-- 2) Panel functions: admin_set_gift_video (add, change or remove a gift's video);
--    admin_gifts now also returns video_url.
-- 3) Every send of a video gift writes one row to public.room_gift_shows (closed to the app, filled by a
--    trigger on room_coins, so send_room_gift stays unchanged). People inside the room read new rows with
--    room_gift_shows_since and play the video. Rows older than a day are cleared automatically.
--
-- Admin from the SQL Editor:
--   update public.room_gift_catalog set video_url = 'https://res.cloudinary.com/zsxxjkqg/video/upload/v1/voli/gifts/lion.mp4' where key = 'lion';
--   update public.room_gift_catalog set video_url = null where key = 'lion';   -- back to picture only

-- ---------- 1) Video column ----------
alter table public.room_gift_catalog add column if not exists art_url text;
alter table public.room_gift_catalog add column if not exists video_url text;

create or replace function public.gift_video_ok(p_url text) returns boolean
language sql immutable set search_path = '' as $$
  select p_url ~ '^https://res\.cloudinary\.com/zsxxjkqg/video/upload/[A-Za-z0-9._/,:-]+\.(mp4|webm|mov)$'
$$;
revoke all on function public.gift_video_ok(text) from public, anon, authenticated;

-- ---------- 2) Panel: gift list with picture and video ----------
drop function if exists public.admin_gifts();
create function public.admin_gifts()
returns table(key text, name text, price bigint, sort integer, active boolean, art_url text, video_url text, sent_count bigint, sent_value bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.admin_guard();
  return query
    select g.key, g.name, g.price, g.sort, g.active, g.art_url, g.video_url,
      (select coalesce(sum(coalesce(c.quantity, 1)), 0)::bigint from public.room_coins c where c.gift_key = g.key),
      (select coalesce(sum(c.amount), 0)::bigint from public.room_coins c where c.gift_key = g.key)
    from public.room_gift_catalog g order by g.sort, g.key;
end;
$$;
revoke all on function public.admin_gifts() from public, anon;
grant execute on function public.admin_gifts() to authenticated;

-- ---------- 3) Panel: add, change or remove a gift's video ----------
-- p_video_url null or empty = remove the video (the gift goes back to picture only).
create or replace function public.admin_set_gift_video(p_key text, p_video_url text) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.admin_guard(); v text := nullif(btrim(coalesce(p_video_url, '')), '');
begin
  if not exists (select 1 from public.room_gift_catalog where key = p_key) then
    raise exception 'No such gift' using errcode = 'P0001', hint = 'not_found';
  end if;
  if v is not null and not public.gift_video_ok(v) then
    raise exception 'Bad video' using errcode = 'P0001', hint = 'bad_video';
  end if;
  update public.room_gift_catalog set video_url = v where key = p_key;
  perform public.admin_log(me, 'gift_video', null, jsonb_build_object('key', p_key, 'video', v is not null));
end;
$$;
revoke all on function public.admin_set_gift_video(text, text) from public, anon;
grant execute on function public.admin_set_gift_video(text, text) to authenticated;

-- ---------- 4) Video gifts sent in a room (closed table) ----------
create table if not exists public.room_gift_shows (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.rooms(id) on delete cascade,
  sender_id uuid references public.profiles(auth_id) on delete set null,
  gift_key text not null,
  video_url text not null,
  quantity integer not null default 1,
  recipients integer not null default 1,
  created_at timestamptz not null default now()
);
create index if not exists room_gift_shows_room_idx on public.room_gift_shows(room_id, id);
create index if not exists room_gift_shows_age_idx on public.room_gift_shows(created_at);
revoke all on public.room_gift_shows from public, anon, authenticated;
grant all on public.room_gift_shows to service_role;
alter table public.room_gift_shows enable row level security;
-- Row level security stays on with no policies: app roles can never touch the table directly.

-- One row per send (one gift to several people is still one video).
create or replace function public.room_gift_shows_add() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.room_gift_shows(room_id, sender_id, gift_key, video_url, quantity, recipients)
    select a.room_id, a.sender_id, a.gift_key, g.video_url, max(coalesce(a.quantity, 1)), count(*)::integer
    from added a join public.room_gift_catalog g on g.key = a.gift_key
    where a.gift_key is not null and g.video_url is not null
    group by a.room_id, a.sender_id, a.gift_key, g.video_url;
  delete from public.room_gift_shows where created_at < now() - interval '1 day';
  return null;
end;
$$;
revoke all on function public.room_gift_shows_add() from public, anon, authenticated;
drop trigger if exists room_gift_shows_add on public.room_coins;
create trigger room_gift_shows_add after insert on public.room_coins
  referencing new table as added for each statement execute function public.room_gift_shows_add();

-- ---------- 5) Read new video gifts (people inside the room only) ----------
-- Rows after p_after (null = from the start) from the last minute, oldest first. Empty for outsiders.
drop function if exists public.room_gift_shows_since(uuid, bigint);
create function public.room_gift_shows_since(p_room uuid, p_after bigint)
returns table(id bigint, sender_id uuid, gift_key text, gift_name text, video_url text, quantity integer, recipients integer, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select s.id, s.sender_id, s.gift_key, coalesce(g.name, ''), s.video_url, s.quantity, s.recipients, s.created_at
  from public.room_gift_shows s
  left join public.room_gift_catalog g on g.key = s.gift_key
  where s.room_id = p_room and public.in_room(p_room, auth.uid())
    and s.id > coalesce(p_after, 0) and s.created_at > now() - interval '1 minute'
  order by s.id
  limit 20
$$;
revoke all on function public.room_gift_shows_since(uuid, bigint) from public, anon;
grant execute on function public.room_gift_shows_since(uuid, bigint) to authenticated;
