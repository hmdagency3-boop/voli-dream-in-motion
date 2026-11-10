-- voli update 006: gifts sent to people inside a party room (صندوق الهدايا).
-- Run AFTER supabase/005_room_coins.sql. Safe to run again.
--
-- A member inside the room picks one or more people (or "everyone" on the mics), a gift and a count.
-- The cost is price x count x number of people, taken from the sender's own coins (profiles.coins).
-- Each gift is written to public.room_coins with who received it, so it also counts in the room total.
-- The sender earns wealth points (الثروة) for every coin spent; each receiver earns charisma points
-- (الكاريزما) equal to the gift's value.
--
-- Admin: change a price or hide a gift from the SQL Editor, e.g.
--   update public.room_gift_catalog set price = 50 where key = 'rose';
--   update public.room_gift_catalog set active = false where key = 'dragon';
-- A re-run never overwrites those changes. A new gift needs its own picture in the app first.

-- ---------- 1) The gift list ----------
create table if not exists public.room_gift_catalog (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{0,30}$'),
  name text not null check (char_length(name) between 1 and 40),
  price bigint not null check (price > 0),
  sort integer not null default 0,
  active boolean not null default true
);
insert into public.room_gift_catalog(key, name, price, sort) values
  ('rose', 'وردة', 1, 1),
  ('star', 'نجمة الماس', 10, 2),
  ('bouquet', 'بوكيه ورد', 99, 3),
  ('ring', 'خاتم الزمرد', 520, 4),
  ('wolf', 'الذئب الكريستال', 1314, 5),
  ('diamond', 'الماسة الفاخرة', 5000, 6),
  ('lion', 'الأسد الذهبي', 30000, 7),
  ('dragon', 'ملك التنين', 100000, 8)
on conflict (key) do nothing;

-- Members read the list; nobody changes it from the app.
revoke all on public.room_gift_catalog from public, anon, authenticated;
grant select on public.room_gift_catalog to authenticated;
grant all on public.room_gift_catalog to service_role;
alter table public.room_gift_catalog enable row level security;
drop policy if exists room_gift_catalog_read on public.room_gift_catalog;
create policy room_gift_catalog_read on public.room_gift_catalog for select to authenticated using (true);

-- ---------- 2) Who received each gift (stays inside the closed room_coins table) ----------
alter table public.room_coins add column if not exists recipient_id uuid references public.profiles(auth_id) on delete set null;
alter table public.room_coins add column if not exists gift_key text;
alter table public.room_coins add column if not exists quantity integer;
create index if not exists room_coins_recipient_idx on public.room_coins(room_id, recipient_id);
-- 005 keeps the table closed (RLS on, no policies, no app-role grants); say it again after the new columns.
revoke all on public.room_coins from public, anon, authenticated;

-- Most people one gift can go to at once (the biggest room has 20 mics), and the biggest count.
create or replace function public.room_gift_max_recipients() returns integer
language sql immutable as $$ select 20 $$;
create or replace function public.room_gift_max_quantity() returns integer
language sql immutable as $$ select 9999 $$;
revoke all on function public.room_gift_max_recipients() from public, anon, authenticated;
revoke all on function public.room_gift_max_quantity() from public, anon, authenticated;

-- ---------- 3) Send a gift ----------
-- Returns the room's new total, or raises (hint):
--   not_in_room      -> the sender is not inside that room right now
--   bad_amount       -> count below 1 or above the cap
--   bad_gift         -> no such gift, or it is hidden
--   no_recipient     -> nobody picked, too many, or the sender picked themself
--   recipient_left   -> one of the picked people is no longer inside the room
--   not_enough_coins -> the balance is smaller than the whole cost
create or replace function public.send_room_gift(p_room uuid, p_gift text, p_quantity integer, p_to uuid[]) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  gift public.room_gift_catalog;
  people uuid[];
  each_value bigint;
  cost bigint;
  total bigint;
begin
  if me is null then raise exception 'Not signed in' using errcode = 'P0001', hint = 'not_in_room'; end if;
  if not public.in_room(p_room, me) then raise exception 'Not inside the room' using errcode = 'P0001', hint = 'not_in_room'; end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > public.room_gift_max_quantity() then
    raise exception 'Bad gift count' using errcode = 'P0001', hint = 'bad_amount';
  end if;

  select * into gift from public.room_gift_catalog where key = p_gift and active;
  if not found then raise exception 'No such gift' using errcode = 'P0001', hint = 'bad_gift'; end if;

  select coalesce(array_agg(distinct x), '{}') into people from unnest(coalesce(p_to, '{}')) x where x is not null;
  if cardinality(people) = 0 or cardinality(people) > public.room_gift_max_recipients() then
    raise exception 'Pick who gets the gift' using errcode = 'P0001', hint = 'no_recipient';
  end if;
  if me = any(people) then raise exception 'You cannot send a gift to yourself' using errcode = 'P0001', hint = 'no_recipient'; end if;
  if exists (select 1 from unnest(people) x where not public.in_room(p_room, x)) then
    raise exception 'Someone left the room' using errcode = 'P0001', hint = 'recipient_left';
  end if;

  each_value := gift.price * p_quantity;
  cost := each_value * cardinality(people);

  -- Take the whole cost from the sender at once; the check keeps the balance from going below zero.
  update public.profiles set coins = coins - cost, wealth_points = wealth_points + cost
    where auth_id = me and coins >= cost;
  if not found then raise exception 'Not enough coins' using errcode = 'P0001', hint = 'not_enough_coins'; end if;

  update public.profiles set charisma_points = charisma_points + each_value where auth_id = any(people);

  insert into public.room_coins(room_id, sender_id, amount, recipient_id, gift_key, quantity)
    select p_room, me, each_value, x, gift.key, p_quantity from unnest(people) x;

  select coalesce(sum(amount), 0) into total from public.room_coins where room_id = p_room;
  return total;
end;
$$;
revoke all on function public.send_room_gift(uuid, text, integer, uuid[]) from public, anon;
grant execute on function public.send_room_gift(uuid, text, integer, uuid[]) to authenticated;

-- ---------- 4) Gifts each person received in this room (shown under the mics) ----------
-- Empty when the caller is not inside the room.
create or replace function public.room_gifts_received(p_room uuid) returns table(auth_id uuid, total bigint)
language sql stable security definer set search_path = '' as $$
  select c.recipient_id, sum(c.amount)::bigint
  from public.room_coins c
  where c.room_id = p_room and c.recipient_id is not null and public.in_room(p_room, auth.uid())
  group by c.recipient_id
$$;
revoke all on function public.room_gifts_received(uuid) from public, anon;
grant execute on function public.room_gifts_received(uuid) to authenticated;
