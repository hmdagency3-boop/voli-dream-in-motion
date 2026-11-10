-- voli update 007: the room ranking (ترتيب الدعم والمدعومين).
-- Run AFTER supabase/006_room_gifts.sql. Safe to run again.
--
-- Two boards, each for today / this week / this month (Cairo time; a week starts on Monday):
--   support  -> who spent the most in this room: coins thrown plus gifts sent
--   received -> who received the most gift value in this room
-- Numbers come from public.room_coins (005/006), which stays closed to the app; this function only
-- returns totals, and only to people who are inside the room right now.

create or replace function public.room_ranking(p_room uuid, p_board text, p_period text)
returns table(auth_id uuid, score bigint)
language sql stable security definer set search_path = '' as $$
  with since as (
    select (date_trunc(p_period, now() at time zone 'Africa/Cairo') at time zone 'Africa/Cairo') as t
    where p_period in ('day', 'week', 'month')
  )
  select case when p_board = 'received' then c.recipient_id else c.sender_id end as auth_id,
         sum(c.amount)::bigint as score
  from public.room_coins c
  join since on c.created_at >= since.t
  where c.room_id = p_room
    and p_board in ('support', 'received')
    and (p_board = 'support' or c.recipient_id is not null)
    and public.in_room(p_room, auth.uid())
  group by 1
  order by 2 desc, 1
  limit 50
$$;
revoke all on function public.room_ranking(uuid, text, text) from public, anon;
grant execute on function public.room_ranking(uuid, text, text) to authenticated;
