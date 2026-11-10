-- voli update 009: management panel (لوحة الإدارة, the hidden /admin pages). Run AFTER supabase/008_agencies.sql.
-- Safe to run more than once.
--
-- Everything here is for top management only (members with the admin role, see public.admin_set_role in 003_vip.sql).
-- First admin, from the SQL Editor:   select public.admin_set_role(1234567, 'admin');
--
-- Every panel action is a security-definer function that first checks the admin role, then writes one row to
-- public.admin_actions, so there is always a record of who did what. The two new tables are closed to the app.
--
-- Bans: a banned member is blocked from signing in again (auth.users.banned_until), taken out of every room,
-- their own live room is closed, and the app shows them a "banned" screen while their current session lasts.
begin;

-- ---------- 1) Log of management actions (closed to the app) ----------
create table if not exists public.admin_actions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists admin_actions_created_idx on public.admin_actions(created_at desc);
create index if not exists admin_actions_target_idx on public.admin_actions(target_id, created_at desc);
revoke all on public.admin_actions from public, anon, authenticated;
grant all on public.admin_actions to service_role;
alter table public.admin_actions enable row level security;

-- ---------- 2) Bans (closed to the app; members ask public.my_ban about themselves) ----------
create table if not exists public.member_bans (
  auth_id uuid primary key references public.profiles(auth_id) on delete cascade,
  until timestamptz,                                   -- null = forever
  reason text check (reason is null or char_length(reason) <= 200),
  banned_by uuid,
  created_at timestamptz not null default clock_timestamp()
);
revoke all on public.member_bans from public, anon, authenticated;
grant all on public.member_bans to service_role;
alter table public.member_bans enable row level security;

-- ---------- 3) Helpers (not callable from the app) ----------
create or replace function public.admin_guard() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if me is null or not public.has_role(me, 'admin') then
    raise exception 'Management only' using errcode = 'P0001', hint = 'not_admin';
  end if;
  return me;
end;
$$;
revoke all on function public.admin_guard() from public, anon, authenticated;

create or replace function public.admin_log(p_admin uuid, p_action text, p_target uuid, p_details jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.admin_actions(admin_id, action, target_id, details) values (p_admin, p_action, p_target, coalesce(p_details, '{}'::jsonb))
$$;
revoke all on function public.admin_log(uuid, text, uuid, jsonb) from public, anon, authenticated;

create or replace function public.admin_member_exists(p_auth uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.profiles where auth_id = p_auth) then
    raise exception 'No such member' using errcode = 'P0001', hint = 'not_found';
  end if;
end;
$$;
revoke all on function public.admin_member_exists(uuid) from public, anon, authenticated;

create or replace function public.is_banned(p_auth uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.member_bans b where b.auth_id = p_auth and (b.until is null or b.until > now()))
$$;
revoke all on function public.is_banned(uuid) from public, anon, authenticated;

-- Blocks (or allows again) signing in. Returns false when the sign-in system could not be updated.
create or replace function public.set_signin_ban(p_auth uuid, p_until timestamptz) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'auth' and table_name = 'users' and column_name = 'banned_until') then
    return false;
  end if;
  execute 'update auth.users set banned_until = $1 where id = $2' using p_until, p_auth;
  return true;
exception when insufficient_privilege then
  return false;
end;
$$;
revoke all on function public.set_signin_ban(uuid, timestamptz) from public, anon, authenticated;

-- Same as the owner ending the party: offline, everyone out, seats free, chat cleared.
create or replace function public.room_shutdown(p_room uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.rooms set is_live = false where id = p_room;
  delete from public.room_members where room_id = p_room;
  delete from public.room_seats where room_id = p_room;
  delete from public.room_messages where room_id = p_room;
  delete from public.room_kicks where room_id = p_room;
end;
$$;
revoke all on function public.room_shutdown(uuid) from public, anon, authenticated;

-- ---------- 4) For every member: am I banned? ----------
create or replace function public.my_ban() returns table(until timestamptz, reason text)
language sql stable security definer set search_path = '' as $$
  select b.until, b.reason from public.member_bans b
  where b.auth_id = auth.uid() and (b.until is null or b.until > now())
$$;
revoke all on function public.my_ban() from public, anon;
grant execute on function public.my_ban() to authenticated;

-- Is the signed-in member top management? (the panel uses it to decide whether to open)
create or replace function public.am_i_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and public.has_role(auth.uid(), 'admin')
$$;
revoke all on function public.am_i_admin() from public, anon;
grant execute on function public.am_i_admin() to authenticated;

-- ---------- 5) Dashboard ----------
create or replace function public.admin_dashboard() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare today timestamptz; result jsonb;
begin
  perform public.admin_guard();
  today := public.cairo_day_start((now() at time zone 'Africa/Cairo')::date);
  select jsonb_build_object(
    'members', (select count(*) from public.profiles),
    'members_today', (select count(*) from public.profiles where created_at >= today),
    'members_week', (select count(*) from public.profiles where created_at >= now() - interval '7 days'),
    'live_rooms', (select count(*) from public.rooms where is_live),
    'in_rooms_now', (select count(distinct m.auth_id) from public.room_members m join public.rooms r on r.id = m.room_id
                     where r.is_live and m.last_seen > now() - make_interval(secs => public.room_presence_seconds())),
    'coins_balance', (select coalesce(sum(coins), 0) from public.profiles),
    'gifts_today', (select coalesce(sum(amount), 0) from public.room_coins where gift_key is not null and created_at >= today),
    'gifts_week', (select coalesce(sum(amount), 0) from public.room_coins where gift_key is not null and created_at >= now() - interval '7 days'),
    'vip_active', (select count(*) from public.profiles where vip_level > 0 and (vip_expires_at is null or vip_expires_at > now())),
    'agencies', (select count(*) from public.agencies),
    'pending_applications', (select count(*) from public.agency_applications where status = 'pending'),
    'bans_active', (select count(*) from public.member_bans where until is null or until > now()),
    'days', (
      select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'signups', d.signups, 'gifts', d.gifts) order by d.day), '[]'::jsonb)
      from (
        select g.day::date as day,
          (select count(*) from public.profiles p
             where p.created_at >= public.cairo_day_start(g.day::date) and p.created_at < public.cairo_day_start(g.day::date + 1)) as signups,
          (select coalesce(sum(c.amount), 0) from public.room_coins c
             where c.gift_key is not null and c.created_at >= public.cairo_day_start(g.day::date)
               and c.created_at < public.cairo_day_start(g.day::date + 1)) as gifts
        from generate_series((now() at time zone 'Africa/Cairo')::date - 13, (now() at time zone 'Africa/Cairo')::date, interval '1 day') g(day)
      ) d
    )
  ) into result;
  return result;
end;
$$;
revoke all on function public.admin_dashboard() from public, anon;
grant execute on function public.admin_dashboard() to authenticated;

-- ---------- 6) Members ----------
-- p_query: public ID, special ID, part of the name, or the start of the email.
-- p_filter: all | vip | banned | staff | new (last 7 days)
create or replace function public.admin_members(p_query text default null, p_filter text default 'all',
  p_limit integer default 50, p_offset integer default 0)
returns table(auth_id uuid, public_id integer, special_id text, display_name text, avatar_url text, email text,
  coins bigint, vip_level smallint, vip_expires_at timestamptz, charisma_points bigint, wealth_points bigint,
  created_at timestamptz, roles text[], banned boolean, ban_until timestamptz, total bigint)
language plpgsql stable security definer set search_path = '' as $$
declare q text := nullif(btrim(coalesce(p_query, '')), '');
  pattern text := '%' || replace(replace(replace(coalesce(q, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';
begin
  perform public.admin_guard();
  return query
    select p.auth_id, p.public_id, p.special_id, p.display_name, p.avatar_url, u.email::text,
      p.coins, p.vip_level, p.vip_expires_at, p.charisma_points, p.wealth_points, p.created_at,
      coalesce((select array_agg(r.role::text order by r.role::text) from public.user_roles r where r.user_id = p.auth_id), '{}'),
      (b.auth_id is not null), b.until,
      count(*) over ()
    from public.profiles p
    left join auth.users u on u.id = p.auth_id
    left join public.member_bans b on b.auth_id = p.auth_id and (b.until is null or b.until > now())
    where (q is null or p.public_id::text = q or p.special_id = q or p.display_name ilike pattern or u.email::text ilike pattern)
      and case coalesce(p_filter, 'all')
        when 'vip' then p.vip_level > 0 and (p.vip_expires_at is null or p.vip_expires_at > now())
        when 'banned' then b.auth_id is not null
        when 'staff' then exists (select 1 from public.user_roles r where r.user_id = p.auth_id)
        when 'new' then p.created_at >= now() - interval '7 days'
        else true end
    order by (q is not null and (p.public_id::text = q or p.special_id = q)) desc, p.created_at desc
    limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;
revoke all on function public.admin_members(text, text, integer, integer) from public, anon;
grant execute on function public.admin_members(text, text, integer, integer) to authenticated;

-- Everything about one member.
create or replace function public.admin_member(p_auth uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  perform public.admin_guard();
  perform public.admin_member_exists(p_auth);
  select jsonb_build_object(
    'profile', (select to_jsonb(p) from public.profiles p where p.auth_id = p_auth),
    'email', (select u.email::text from auth.users u where u.id = p_auth),
    'roles', coalesce((select jsonb_agg(r.role::text) from public.user_roles r where r.user_id = p_auth), '[]'::jsonb),
    'ban', (select jsonb_build_object('until', b.until, 'reason', b.reason, 'created_at', b.created_at)
            from public.member_bans b where b.auth_id = p_auth and (b.until is null or b.until > now())),
    'vip_grants', coalesce((select jsonb_agg(to_jsonb(g) order by g.created_at desc)
            from (select id, level, source, starts_at, expires_at, coins_paid, note, created_at from public.vip_grants
                  where auth_id = p_auth order by created_at desc limit 30) g), '[]'::jsonb),
    'room', (select jsonb_build_object('id', r.id, 'name', r.name, 'is_live', r.is_live) from public.rooms r where r.owner_id = p_auth),
    'agency_owned', (select jsonb_build_object('id', a.id, 'code', a.code, 'name', a.name) from public.agencies a where a.owner_id = p_auth),
    'agency_member', (select jsonb_build_object('id', a.id, 'code', a.code, 'name', a.name, 'joined_at', m.joined_at)
            from public.agency_members m join public.agencies a on a.id = m.agency_id
            where m.host_id = p_auth and m.left_at is null),
    'gifts_sent', (select coalesce(sum(amount), 0) from public.room_coins where sender_id = p_auth and gift_key is not null),
    'gifts_received', (select coalesce(sum(amount), 0) from public.room_coins where recipient_id = p_auth and gift_key is not null),
    'actions', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
            select a.action, a.details, a.created_at, ap.display_name as admin_name
            from public.admin_actions a left join public.profiles ap on ap.auth_id = a.admin_id
            where a.target_id = p_auth order by a.created_at desc limit 30) x), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;
revoke all on function public.admin_member(uuid) from public, anon;
grant execute on function public.admin_member(uuid) to authenticated;

-- Add coins (negative removes). The balance can never go below zero.
create or replace function public.admin_member_coins(p_auth uuid, p_amount bigint, p_note text default null) returns bigint
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.admin_guard(); balance bigint;
begin
  perform public.admin_member_exists(p_auth);
  if p_amount is null or p_amount = 0 or abs(p_amount) > 1000000000000 then
    raise exception 'Bad amount' using errcode = 'P0001', hint = 'bad_amount';
  end if;
  select coins into balance from public.profiles where auth_id = p_auth for update;
  if balance + p_amount < 0 then raise exception 'Balance would be negative' using errcode = 'P0001', hint = 'negative_balance'; end if;
  update public.profiles set coins = coins + p_amount where auth_id = p_auth returning coins into balance;
  perform public.admin_log(me, 'coins', p_auth, jsonb_build_object('amount', p_amount, 'balance', balance,
    'note', nullif(left(btrim(coalesce(p_note, '')), 200), '')));
  return balance;
end;
$$;
revoke all on function public.admin_member_coins(uuid, bigint, text) from public, anon;
grant execute on function public.admin_member_coins(uuid, bigint, text) to authenticated;

-- Give a VIP tier for p_days days (null = forever).
create or replace function public.admin_member_vip(p_auth uuid, p_level integer, p_days integer default null,
  p_source text default 'admin', p_note text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.admin_guard(); gid uuid;
begin
  perform public.admin_member_exists(p_auth);
  if p_source not in ('admin', 'gift', 'event') then raise exception 'Bad source' using errcode = 'P0001', hint = 'bad_source'; end if;
  if not exists (select 1 from public.vip_tiers where level = p_level) then
    raise exception 'Unknown VIP level' using errcode = 'P0001', hint = 'bad_level';
  end if;
  if p_days is not null and (p_days <= 0 or p_days > 36500) then raise exception 'Bad days' using errcode = 'P0001', hint = 'bad_days'; end if;
  insert into public.vip_grants(auth_id, level, source, expires_at, note)
    values (p_auth, p_level, p_source, case when p_days is null then null else now() + make_interval(days => p_days) end,
            nullif(left(btrim(coalesce(p_note, '')), 200), ''))
    returning id into gid;
  perform public.admin_log(me, 'vip_grant', p_auth, jsonb_build_object('level', p_level, 'days', p_days, 'source', p_source));
  return gid;
end;
$$;
revoke all on function public.admin_member_vip(uuid, integer, integer, text, text) from public, anon;
grant execute on function public.admin_member_vip(uuid, integer, integer, text, text) to authenticated;

-- End all of a member's VIP now. Returns how many grants were ended.
create or replace function public.admin_member_vip_revoke(p_auth uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.admin_guard(); n integer;
begin
  perform public.admin_member_exists(p_auth);
  update public.vip_grants set expires_at = greatest(starts_at, now())
    where auth_id = p_auth and (expires_at is null or expires_at > now());
  get diagnostics n = row_count;
  perform public.admin_log(me, 'vip_revoke', p_auth, jsonb_build_object('ended', n));
  return n;
end;
$$;
revoke all on function public.admin_member_vip_revoke(uuid) from public, anon;
grant execute on function public.admin_member_vip_revoke(uuid) to authenticated;

-- Set (or remove with null / empty) a special ID.
create or replace function public.admin_member_special_id(p_auth uuid, p_special text) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.admin_guard(); v text := nullif(btrim(coalesce(p_special, '')), ''); old text;
begin
  perform public.admin_member_exists(p_auth);
  if v is not null and v !~ '^[1-9][0-9]{0,9}$' then
    raise exception 'Bad special ID' using errcode = 'P0001', hint = 'bad_special_id';
  end if;
  select special_id into old from public.profiles where auth_id = p_auth;
  begin
    update public.profiles set special_id = v where auth_id = p_auth;
  exception when unique_violation then
    raise exception 'Special ID taken' using errcode = 'P0001', hint = 'special_id_taken';
  end;
  perform public.admin_log(me, 'special_id', p_auth, jsonb_build_object('from', old, 'to', v));
end;
$$;
revoke all on function public.admin_member_special_id(uuid, text) from public, anon;
grant execute on function public.admin_member_special_id(uuid, text) to authenticated;

-- Give or take a role ('moderator' مشرف, 'admin' الإدارة العليا). An admin cannot take away their own admin role.
create or replace function public.admin_member_role(p_auth uuid, p_role public.app_role, p_enabled boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.admin_guard();
begin
  perform public.admin_member_exists(p_auth);
  if p_auth = me and p_role = 'admin' and not p_enabled then
    raise exception 'Cannot remove your own admin role' using errcode = 'P0001', hint = 'self';
  end if;
  if p_enabled then
    insert into public.user_roles(user_id, role) values (p_auth, p_role) on conflict (user_id, role) do nothing;
  else
    delete from public.user_roles where user_id = p_auth and role = p_role;
  end if;
  perform public.admin_log(me, 'role', p_auth, jsonb_build_object('role', p_role, 'enabled', p_enabled));
end;
$$;
revoke all on function public.admin_member_role(uuid, public.app_role, boolean) from public, anon;
grant execute on function public.admin_member_role(uuid, public.app_role, boolean) to authenticated;

-- Fix a member's name, or clear their picture / bio.
create or replace function public.admin_member_profile(p_auth uuid, p_display_name text default null,
  p_clear_avatar boolean default false, p_clear_bio boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.admin_guard(); n text := nullif(btrim(coalesce(p_display_name, '')), '');
begin
  perform public.admin_member_exists(p_auth);
  if n is not null and char_length(n) > 60 then raise exception 'Bad name' using errcode = 'P0001', hint = 'bad_name'; end if;
  update public.profiles set
    display_name = coalesce(n, display_name),
    avatar_url = case when p_clear_avatar then null else avatar_url end,
    bio = case when p_clear_bio then null else bio end
  where auth_id = p_auth;
  perform public.admin_log(me, 'profile', p_auth, jsonb_build_object('name', n, 'clear_avatar', p_clear_avatar, 'clear_bio', p_clear_bio));
end;
$$;
revoke all on function public.admin_member_profile(uuid, text, boolean, boolean) from public, anon;
grant execute on function public.admin_member_profile(uuid, text, boolean, boolean) to authenticated;

-- Ban for p_days days (null = forever). Admins and yourself cannot be banned.
-- Returns whether new sign-ins are blocked too (false only if the sign-in system refused the change).
create or replace function public.admin_member_ban(p_auth uuid, p_days integer default null, p_reason text default null) returns boolean
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.admin_guard(); ends timestamptz; blocked boolean; rid uuid;
begin
  perform public.admin_member_exists(p_auth);
  if p_auth = me then raise exception 'Cannot ban yourself' using errcode = 'P0001', hint = 'self'; end if;
  if public.has_role(p_auth, 'admin') then raise exception 'Cannot ban top management' using errcode = 'P0001', hint = 'target_admin'; end if;
  if p_days is not null and (p_days <= 0 or p_days > 36500) then raise exception 'Bad days' using errcode = 'P0001', hint = 'bad_days'; end if;
  ends := case when p_days is null then null else now() + make_interval(days => p_days) end;
  insert into public.member_bans(auth_id, until, reason, banned_by)
    values (p_auth, ends, nullif(left(btrim(coalesce(p_reason, '')), 200), ''), me)
    on conflict (auth_id) do update set until = excluded.until, reason = excluded.reason,
      banned_by = excluded.banned_by, created_at = clock_timestamp();
  blocked := public.set_signin_ban(p_auth, coalesce(ends, now() + interval '100 years'));
  -- Out of every room, and their own live room closes.
  select id into rid from public.rooms where owner_id = p_auth and is_live;
  if rid is not null then perform public.room_shutdown(rid); end if;
  delete from public.room_members where auth_id = p_auth;
  delete from public.room_seats where auth_id = p_auth;
  perform public.admin_log(me, 'ban', p_auth, jsonb_build_object('days', p_days, 'reason', nullif(btrim(coalesce(p_reason, '')), ''),
    'signin_blocked', blocked));
  return blocked;
end;
$$;
revoke all on function public.admin_member_ban(uuid, integer, text) from public, anon;
grant execute on function public.admin_member_ban(uuid, integer, text) to authenticated;

create or replace function public.admin_member_unban(p_auth uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.admin_guard();
begin
  perform public.admin_member_exists(p_auth);
  delete from public.member_bans where auth_id = p_auth;
  perform public.set_signin_ban(p_auth, null);
  perform public.admin_log(me, 'unban', p_auth, '{}'::jsonb);
end;
$$;
revoke all on function public.admin_member_unban(uuid) from public, anon;
grant execute on function public.admin_member_unban(uuid) to authenticated;

-- ---------- 7) Rooms ----------
create or replace function public.admin_rooms(p_query text default null, p_live_only boolean default false)
returns table(id uuid, name text, owner_id uuid, owner_public_id integer, owner_name text, owner_avatar text,
  is_live boolean, locked boolean, mode text, seat_count smallint, present bigint, coins_total bigint,
  created_at timestamptz, updated_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare q text := nullif(btrim(coalesce(p_query, '')), '');
begin
  perform public.admin_guard();
  return query
    select r.id, r.name, r.owner_id, p.public_id, p.display_name, p.avatar_url, r.is_live, r.locked, r.mode, r.seat_count,
      (select count(*) from public.room_members m where m.room_id = r.id
         and m.last_seen > now() - make_interval(secs => public.room_presence_seconds())),
      (select coalesce(sum(c.amount), 0)::bigint from public.room_coins c where c.room_id = r.id),
      r.created_at, r.updated_at
    from public.rooms r join public.profiles p on p.auth_id = r.owner_id
    where (not coalesce(p_live_only, false) or r.is_live)
      and (q is null or p.public_id::text = q or p.special_id = q or r.name ilike '%' || q || '%')
    order by r.is_live desc, 11 desc, r.updated_at desc
    limit 200;
end;
$$;
revoke all on function public.admin_rooms(text, boolean) from public, anon;
grant execute on function public.admin_rooms(text, boolean) to authenticated;

create or replace function public.admin_close_room(p_room uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.admin_guard(); owner uuid;
begin
  select owner_id into owner from public.rooms where id = p_room;
  if owner is null then raise exception 'No such room' using errcode = 'P0001', hint = 'not_found'; end if;
  perform public.room_shutdown(p_room);
  perform public.admin_log(me, 'room_close', owner, jsonb_build_object('room', p_room));
end;
$$;
revoke all on function public.admin_close_room(uuid) from public, anon;
grant execute on function public.admin_close_room(uuid) to authenticated;

create or replace function public.admin_clear_room_chat(p_room uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.admin_guard(); owner uuid;
begin
  select owner_id into owner from public.rooms where id = p_room;
  if owner is null then raise exception 'No such room' using errcode = 'P0001', hint = 'not_found'; end if;
  delete from public.room_messages where room_id = p_room;
  perform public.admin_log(me, 'room_chat_clear', owner, jsonb_build_object('room', p_room));
end;
$$;
revoke all on function public.admin_clear_room_chat(uuid) from public, anon;
grant execute on function public.admin_clear_room_chat(uuid) to authenticated;

-- ---------- 8) Gifts and VIP prices ----------
create or replace function public.admin_gifts()
returns table(key text, name text, price bigint, sort integer, active boolean, sent_count bigint, sent_value bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.admin_guard();
  return query
    select g.key, g.name, g.price, g.sort, g.active,
      (select coalesce(sum(coalesce(c.quantity, 1)), 0)::bigint from public.room_coins c where c.gift_key = g.key),
      (select coalesce(sum(c.amount), 0)::bigint from public.room_coins c where c.gift_key = g.key)
    from public.room_gift_catalog g order by g.sort, g.key;
end;
$$;
revoke all on function public.admin_gifts() from public, anon;
grant execute on function public.admin_gifts() to authenticated;

create or replace function public.admin_update_gift(p_key text, p_name text, p_price bigint, p_sort integer, p_active boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.admin_guard(); n text := btrim(coalesce(p_name, ''));
begin
  if not exists (select 1 from public.room_gift_catalog where key = p_key) then
    raise exception 'No such gift' using errcode = 'P0001', hint = 'not_found';
  end if;
  if char_length(n) not between 1 and 40 then raise exception 'Bad name' using errcode = 'P0001', hint = 'bad_name'; end if;
  if p_price is null or p_price <= 0 or p_price > 100000000000 then raise exception 'Bad price' using errcode = 'P0001', hint = 'bad_price'; end if;
  update public.room_gift_catalog set name = n, price = p_price, sort = coalesce(p_sort, sort), active = coalesce(p_active, active)
    where key = p_key;
  perform public.admin_log(me, 'gift_update', null, jsonb_build_object('key', p_key, 'price', p_price, 'active', p_active));
end;
$$;
revoke all on function public.admin_update_gift(text, text, bigint, integer, boolean) from public, anon;
grant execute on function public.admin_update_gift(text, text, bigint, integer, boolean) to authenticated;

-- Price null = not for sale. Salary null = not set yet.
create or replace function public.admin_update_vip_tier(p_level integer, p_price_coins bigint, p_duration_days integer,
  p_monthly_salary_coins bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.admin_guard();
begin
  if not exists (select 1 from public.vip_tiers where level = p_level) then
    raise exception 'Unknown VIP level' using errcode = 'P0001', hint = 'bad_level';
  end if;
  if p_price_coins is not null and p_price_coins <= 0 then raise exception 'Bad price' using errcode = 'P0001', hint = 'bad_price'; end if;
  if p_duration_days is null or p_duration_days <= 0 or p_duration_days > 3650 then
    raise exception 'Bad days' using errcode = 'P0001', hint = 'bad_days';
  end if;
  if p_monthly_salary_coins is not null and p_monthly_salary_coins <= 0 then
    raise exception 'Bad salary' using errcode = 'P0001', hint = 'bad_price';
  end if;
  update public.vip_tiers set price_coins = p_price_coins, duration_days = p_duration_days,
    monthly_salary_coins = p_monthly_salary_coins where level = p_level;
  perform public.admin_log(me, 'vip_tier_update', null, jsonb_build_object('level', p_level, 'price', p_price_coins,
    'days', p_duration_days, 'salary', p_monthly_salary_coins));
end;
$$;
revoke all on function public.admin_update_vip_tier(integer, bigint, integer, bigint) from public, anon;
grant execute on function public.admin_update_vip_tier(integer, bigint, integer, bigint) to authenticated;

-- ---------- 9) Agencies ----------
create or replace function public.admin_agencies(p_query text default null)
returns table(id uuid, code integer, name text, owner_id uuid, owner_public_id integer, owner_name text, owner_avatar text,
  commission_percent numeric, members bigint, income_week bigint, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare q text := nullif(btrim(coalesce(p_query, '')), '');
begin
  perform public.admin_guard();
  return query
    select a.id, a.code, a.name, a.owner_id, p.public_id, p.display_name, p.avatar_url, a.commission_percent,
      (select count(*) from public.agency_members m where m.agency_id = a.id and m.left_at is null),
      (select coalesce(sum(public.agency_stay_income(m.host_id, m.joined_at, m.left_at, now() - interval '7 days', now())), 0)::bigint
         from public.agency_members m where m.agency_id = a.id),
      a.created_at
    from public.agencies a join public.profiles p on p.auth_id = a.owner_id
    where q is null or a.code::text = q or p.public_id::text = q or a.name ilike '%' || q || '%'
    order by a.code;
end;
$$;
revoke all on function public.admin_agencies(text) from public, anon;
grant execute on function public.admin_agencies(text) to authenticated;

create or replace function public.admin_update_agency(p_id uuid, p_name text, p_commission numeric) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.admin_guard(); n text := btrim(coalesce(p_name, '')); owner uuid;
begin
  select owner_id into owner from public.agencies where id = p_id;
  if owner is null then raise exception 'No such agency' using errcode = 'P0001', hint = 'not_found'; end if;
  if char_length(n) not between 2 and 40 then raise exception 'Bad name' using errcode = 'P0001', hint = 'bad_name'; end if;
  if p_commission is not null and (p_commission < 0 or p_commission > 100) then
    raise exception 'Bad percent' using errcode = 'P0001', hint = 'bad_percent';
  end if;
  update public.agencies set name = n, commission_percent = p_commission where id = p_id;
  perform public.admin_log(me, 'agency_update', owner, jsonb_build_object('agency', p_id, 'name', n, 'commission', p_commission));
end;
$$;
revoke all on function public.admin_update_agency(uuid, text, numeric) from public, anon;
grant execute on function public.admin_update_agency(uuid, text, numeric) to authenticated;

create or replace function public.admin_agency_members(p_agency uuid)
returns table(host_id uuid, public_id integer, display_name text, avatar_url text, joined_at timestamptz, income_week bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.admin_guard();
  return query
    select m.host_id, p.public_id, p.display_name, p.avatar_url, m.joined_at,
      public.agency_stay_income(m.host_id, m.joined_at, m.left_at, now() - interval '7 days', now())
    from public.agency_members m join public.profiles p on p.auth_id = m.host_id
    where m.agency_id = p_agency and m.left_at is null
    order by m.joined_at;
end;
$$;
revoke all on function public.admin_agency_members(uuid) from public, anon;
grant execute on function public.admin_agency_members(uuid) to authenticated;

-- Take a host out of an agency. The agent themselves stays.
create or replace function public.admin_remove_agency_host(p_agency uuid, p_host uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.admin_guard();
begin
  if exists (select 1 from public.agencies where id = p_agency and owner_id = p_host) then
    raise exception 'The agent stays in the agency' using errcode = 'P0001', hint = 'is_agent';
  end if;
  update public.agency_members set left_at = clock_timestamp(), left_reason = 'removed'
    where agency_id = p_agency and host_id = p_host and left_at is null;
  if not found then raise exception 'Not a member' using errcode = 'P0001', hint = 'not_found'; end if;
  perform public.admin_log(me, 'agency_remove_host', p_host, jsonb_build_object('agency', p_agency));
end;
$$;
revoke all on function public.admin_remove_agency_host(uuid, uuid) from public, anon;
grant execute on function public.admin_remove_agency_host(uuid, uuid) to authenticated;

-- Review a request to open an agency (same rules as 008, plus a log line). Returns the new code when approved.
create or replace function public.admin_review_application(p_id uuid, p_approve boolean, p_reason text default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.admin_guard(); code integer; applicant uuid;
begin
  select applicant_id into applicant from public.agency_applications where id = p_id;
  code := public.agency_review(p_id, p_approve, p_reason, me);
  perform public.admin_log(me, case when p_approve then 'agency_approve' else 'agency_reject' end, applicant,
    jsonb_build_object('application', p_id, 'code', code, 'reason', nullif(btrim(coalesce(p_reason, '')), '')));
  return code;
end;
$$;
revoke all on function public.admin_review_application(uuid, boolean, text) from public, anon;
grant execute on function public.admin_review_application(uuid, boolean, text) to authenticated;

-- ---------- 10) The log ----------
create or replace function public.admin_actions_log(p_limit integer default 100, p_offset integer default 0)
returns table(id uuid, created_at timestamptz, action text, details jsonb, admin_name text, admin_public_id integer,
  target_id uuid, target_name text, target_public_id integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.admin_guard();
  return query
    select a.id, a.created_at, a.action, a.details, ap.display_name, ap.public_id, a.target_id, tp.display_name, tp.public_id
    from public.admin_actions a
    left join public.profiles ap on ap.auth_id = a.admin_id
    left join public.profiles tp on tp.auth_id = a.target_id
    order by a.created_at desc
    limit least(greatest(coalesce(p_limit, 100), 1), 200) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;
revoke all on function public.admin_actions_log(integer, integer) from public, anon;
grant execute on function public.admin_actions_log(integer, integer) to authenticated;

commit;
