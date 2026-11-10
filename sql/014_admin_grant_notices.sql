-- voli update 014: management grant notices. Run AFTER supabase/009_admin.sql and supabase/010_admin_notices.sql.
-- Safe to run more than once.
--
-- When top management gives a member VIP or coins from the management panel (admin_member_vip / admin_member_coins),
-- the member gets an official message from Voli Helper (public ID 100) in their chats, for example:
--   Congratulations on your upgrade to VIP5, valid for 15 days.
--   You have received 5000 coins from Voli management.
-- The panel functions are not changed: a trigger on the panel's own log (public.admin_actions) writes the message.
-- Removing coins sends nothing. If the Voli Helper account does not exist yet, or the message cannot be written,
-- the panel action still succeeds without a message.
begin;

create or replace function public.admin_grant_notice_body(p_action text, p_details jsonb)
returns text language plpgsql immutable set search_path = '' as $$
declare lvl int; days int; amount bigint;
begin
  if p_action = 'vip_grant' then
    lvl := nullif(p_details->>'level', '')::int;
    if lvl is null then return null; end if;
    days := nullif(p_details->>'days', '')::int;
    return 'Congratulations on your upgrade to VIP' || lvl || ', ' ||
      case when days is null then 'valid permanently.'
           when days = 1 then 'valid for 1 day.'
           else 'valid for ' || days || ' days.' end;
  elsif p_action = 'coins' then
    amount := nullif(p_details->>'amount', '')::bigint;
    if amount is null or amount <= 0 then return null; end if;
    return 'You have received ' || amount || ' coins from Voli management.';
  end if;
  return null;
end;
$$;
revoke all on function public.admin_grant_notice_body(text, jsonb) from public, anon, authenticated;
grant execute on function public.admin_grant_notice_body(text, jsonb) to service_role;

create or replace function public.admin_grant_notice() returns trigger
language plpgsql security definer set search_path = '' as $$
declare helper uuid; body text;
begin
  if new.target_id is null then return new; end if;
  body := public.admin_grant_notice_body(new.action, new.details);
  if body is null then return new; end if;
  select auth_id into helper from public.profiles
    where public_id = 100 and auth_id = '00000000-0000-4000-8000-000000000100';
  if helper is null or helper = new.target_id then return new; end if;
  begin
    insert into public.messages(sender_id, recipient_id, body) values (helper, new.target_id, body);
  exception when others then
    null; -- a missing notice must never undo the management action
  end;
  return new;
end;
$$;
revoke all on function public.admin_grant_notice() from public, anon, authenticated;

drop trigger if exists admin_grant_notice on public.admin_actions;
create trigger admin_grant_notice after insert on public.admin_actions
  for each row execute function public.admin_grant_notice();

commit;
