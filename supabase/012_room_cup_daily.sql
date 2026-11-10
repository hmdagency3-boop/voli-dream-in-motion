-- Room cup resets every day at 00:00 Saudi time (Asia/Riyadh).
-- Only the displayed total changes; room_coins history is kept for rankings and agency income.
create or replace function public.room_coins_total(p_room uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select case
    when public.in_room(p_room, auth.uid())
      then coalesce((
        select sum(amount) from public.room_coins
        where room_id = p_room
          and created_at >= (date_trunc('day', now() at time zone 'Asia/Riyadh') at time zone 'Asia/Riyadh')
      ), 0)
    end
$$;
revoke all on function public.room_coins_total(uuid) from public, anon;
grant execute on function public.room_coins_total(uuid) to authenticated;
