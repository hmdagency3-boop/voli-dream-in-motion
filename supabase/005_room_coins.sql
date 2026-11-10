-- voli update 005: coins thrown inside a party room (الكوينزات المرمية في الروم).
-- Run AFTER supabase/004_rooms.sql. Safe to run again.
--
-- Members throw coins into the room they are inside of. The throw comes out of the member's own
-- coin balance (profiles.coins, added by 003_vip.sql) and is written to public.room_coins.
-- The room header shows the total thrown, so the number is real money spent, not a counter.
--
-- Nobody reads or writes the table from the app: both ways in and out are the functions below.
--
-- Admin: nothing to set here. To hand coins out, use public.admin_add_coins (003_vip.sql).

-- ---------- 1) Table ----------
create table if not exists public.room_coins (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  sender_id uuid not null references public.profiles(auth_id) on delete cascade,
  amount bigint not null check (amount > 0),
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists room_coins_room_idx on public.room_coins(room_id, created_at);
create index if not exists room_coins_sender_idx on public.room_coins(room_id, sender_id);

-- ---------- 2) Access: the table itself is closed to the app ----------
revoke all on public.room_coins from public, anon, authenticated;
grant all on public.room_coins to service_role;
alter table public.room_coins enable row level security;
-- Row level security stays on with no policies: app roles can never select, insert, update or delete.

-- Biggest single throw a member can make.
create or replace function public.room_coins_max_throw() returns bigint
language sql immutable as $$ select 1000000::bigint $$;
revoke all on function public.room_coins_max_throw() from public, anon, authenticated;

-- ---------- 3) Throw coins into the room ----------
-- Returns the room's new total, or raises:
--   not_in_room      -> the member is not inside that room right now
--   not_enough_coins -> the balance is smaller than the throw
create or replace function public.throw_room_coins(p_room uuid, p_amount bigint) returns bigint
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); total bigint;
begin
  if me is null then raise exception 'Not signed in' using errcode = 'P0001', hint = 'not_in_room'; end if;
  if p_amount is null or p_amount < 1 then raise exception 'Amount must be at least 1' using errcode = 'P0001', hint = 'bad_amount'; end if;
  if p_amount > public.room_coins_max_throw() then raise exception 'Too many coins at once' using errcode = 'P0001', hint = 'bad_amount'; end if;
  if not public.in_room(p_room, me) then raise exception 'Not inside the room' using errcode = 'P0001', hint = 'not_in_room'; end if;

  -- Take the coins from the member's own balance; the check keeps the balance from going below zero.
  update public.profiles set coins = coins - p_amount
    where auth_id = me and coins >= p_amount;
  if not found then raise exception 'Not enough coins' using errcode = 'P0001', hint = 'not_enough_coins'; end if;

  insert into public.room_coins(room_id, sender_id, amount) values (p_room, me, p_amount);

  select coalesce(sum(amount), 0) into total from public.room_coins where room_id = p_room;
  return total;
end;
$$;
revoke all on function public.throw_room_coins(uuid, bigint) from public, anon;
grant execute on function public.throw_room_coins(uuid, bigint) to authenticated;

-- ---------- 4) The room total shown in the header ----------
-- Null when the caller is not inside the room.
create or replace function public.room_coins_total(p_room uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select case
    when public.in_room(p_room, auth.uid())
      then coalesce((select sum(amount) from public.room_coins where room_id = p_room
        and created_at >= (date_trunc('day', now() at time zone 'Asia/Riyadh') at time zone 'Asia/Riyadh')), 0)
    end
$$;
revoke all on function public.room_coins_total(uuid) from public, anon;
grant execute on function public.room_coins_total(uuid) to authenticated;
