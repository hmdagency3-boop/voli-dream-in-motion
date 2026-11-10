-- Update 003: VIP dragon system (8 tiers). Run AFTER supabase/002_special_id.sql. Safe to run more than once.
--
-- How a member gets VIP: buying it with coins (public.buy_vip), an admin grant, a gift or an event.
-- Every way is a row in public.vip_grants; the member's VIP is the highest tier among their active grants.
--
-- Admin commands (SQL Editor only, the app cannot call them):
--   select public.admin_grant_vip(1234567, 5);                         -- VIP 5 forever
--   select public.admin_grant_vip(1234567, 3, 30);                     -- VIP 3 for 30 days
--   select public.admin_grant_vip(1234567, 8, 30, 'event', 'مسابقة');   -- source: admin | gift | event
--   select public.admin_revoke_vip(1234567);                            -- end all of a member's VIP now
--   select public.admin_add_coins(1234567, 50000);                      -- add coins (negative removes)
--   select public.admin_set_role(1234567, 'moderator');                -- 'moderator' (مشرف) or 'admin' (الإدارة العليا)
--   select public.admin_set_role(1234567, 'moderator', false);         -- remove the role
--   update public.vip_tiers set price_coins = 10000, duration_days = 30 where level = 1;  -- put VIP 1 on sale
--   update public.vip_tiers set monthly_salary_coins = 5000 where level = 6;               -- monthly salary
--   select public.pay_vip_salaries();                                   -- pay this month's salaries (once per month)
--   select public.refresh_all_vips();                                   -- update shown VIP after grants expire
begin;

-- ---------- 1) Move the old 0–100 VIP scale (update 002) to the 8 tiers, once ----------
do $$
begin
  if exists (select 1 from pg_constraint where conrelid = 'public.profiles'::regclass and conname = 'profiles_vip_level_range') then
    alter table public.profiles drop constraint profiles_vip_level_range;
    -- 1–12 → 1, 13–25 → 2, … 88–100 → 8 (keeps the order between members).
    update public.profiles set vip_level = ceil(vip_level * 8 / 100.0)::smallint where vip_level > 0;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.profiles'::regclass and conname = 'profiles_vip_level_tier') then
    alter table public.profiles add constraint profiles_vip_level_tier check (vip_level between 0 and 8);
  end if;
end $$;

-- ---------- 2) New profile columns ----------
-- vip_expires_at: when the shown VIP ends (null = never, or no VIP). Read-only for members.
alter table public.profiles add column if not exists vip_expires_at timestamptz;
-- coins: wallet balance used to buy VIP. Read-only for members.
alter table public.profiles add column if not exists coins bigint not null default 0;
-- Member settings, only switchable on when their VIP tier includes the feature.
alter table public.profiles add column if not exists hide_location boolean not null default false;   -- VIP 2+
alter table public.profiles add column if not exists vip_invisible boolean not null default false;   -- VIP 5+
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.profiles'::regclass and conname = 'profiles_coins_not_negative') then
    alter table public.profiles add constraint profiles_coins_not_negative check (coins >= 0);
  end if;
end $$;

-- ---------- 3) The 8 tiers and what each one includes ----------
-- Features add up as the tier rises; frame, chat bubble, entrance and ID card are replaced by the higher tier's own.
-- Artwork keys (frame, chat_bubble, entrance, id_card) name pictures that the app shows.
-- price_coins, duration_days, friends_limit and monthly_salary_coins are yours to set: a re-run keeps them.
create table if not exists public.vip_tiers (
  level smallint primary key check (level between 1 and 8),
  key text not null unique,
  name_ar text not null,
  name_en text not null,
  frame text not null,                                   -- إطار البروفايل
  chat_badge boolean not null default false,             -- شارة الشات
  name_color boolean not null default false,             -- لون الاسم في غرف البث
  chat_bubble text check (chat_bubble in ('custom', 'neon')),  -- فقاعة الكلام (null = عادية)
  hide_location boolean not null default false,          -- إخفاء الموقع والبلد
  entrance text,                                         -- دخولية البث (null = بدون)
  entrance_fullscreen boolean not null default false,
  entrance_sound boolean not null default false,
  id_card text check (id_card in ('special', 'gold', 'diamond', 'legendary')),  -- كارت الآيدي
  friends_bonus boolean not null default false,          -- زيادة سعة قائمة الأصدقاء
  friends_limit integer check (friends_limit > 0),       -- null = لم يحدد بعد
  immunity text not null default 'none' check (immunity in ('none', 'moderators', 'absolute')),  -- حصانة الكتم والطرد
  super_moderation boolean not null default false,       -- طرد وكتم المشرفين والـ VIP الأقل
  invisible_mode boolean not null default false,         -- وضع التخفي
  monthly_salary boolean not null default false,         -- راتب كوينز شهري
  monthly_salary_coins bigint check (monthly_salary_coins > 0),  -- null = لم يحدد بعد
  join_banner boolean not null default false,            -- شريط نيون في الروم عند الدخول
  private_support boolean not null default false,        -- خدمة عملاء خاصة
  system_broadcast boolean not null default false,       -- إذاعة عامة لكل الغرف عند الدخول
  price_coins bigint check (price_coins > 0),            -- null = غير متاح للشراء بعد
  duration_days integer not null default 30 check (duration_days > 0)
);

insert into public.vip_tiers as t (level, key, name_ar, name_en, frame, chat_badge, name_color, chat_bubble, hide_location,
  entrance, entrance_fullscreen, entrance_sound, id_card, friends_bonus, immunity, super_moderation, invisible_mode,
  monthly_salary, join_banner, private_support, system_broadcast)
values
  (1, 'bronze',  'تنين البرونز',            'Bronze Hatchling Dragon',  'bronze_hatchling', true, true, null,     false, 'bronze_dragon_bar',     false, false, null,        false, 'none',       false, false, false, false, false, false),
  (2, 'silver',  'تنين الفضة',              'Silver Wyvern Dragon',     'silver_wyvern',    true, true, 'custom', true,  'silver_dragon_bar',     false, false, null,        false, 'none',       false, false, false, false, false, false),
  (3, 'gold',    'تنين الذهب',              'Golden Flame Dragon',      'golden_flame',     true, true, 'custom', true,  'gold_dragon',           false, false, 'special',   true,  'none',       false, false, false, false, false, false),
  (4, 'cosmic',  'تنين الأرجوان الكوني',     'Cosmic Void Dragon',       'cosmic_void',      true, true, 'neon',   true,  'purple_flying_dragon',  false, false, 'special',   true,  'moderators', false, false, false, false, false, false),
  (5, 'ruby',    'تنين الياقوت الأحمر',      'Crimson Ruby Dragon',      'crimson_ruby',     true, true, 'neon',   true,  'red_fire_dragon',       false, false, 'gold',      true,  'moderators', false, true,  false, false, false, false),
  (6, 'emerald', 'تنين الزمرد الأخضر',       'Emerald Serpent Dragon',   'emerald_serpent',  true, true, 'neon',   true,  'emerald_giant_dragon',  false, false, 'gold',      true,  'moderators', true,  true,  true,  false, false, false),
  (7, 'diamond', 'تنين الماس الملكي',        'Royal Diamond Dragon',     'royal_diamond',    true, true, 'neon',   true,  'diamond_flying_dragon', false, false, 'diamond',   true,  'moderators', true,  true,  true,  true,  true,  false),
  (8, 'emperor', 'التنين الأسطوري الكوني',   'Supreme Emperor Dragon - Ultimate King', 'supreme_emperor', true, true, 'neon', true, 'legendary_dragon', true, true, 'legendary', true, 'absolute', true, true, true, true, true, true)
on conflict (level) do update set
  key = excluded.key, name_ar = excluded.name_ar, name_en = excluded.name_en, frame = excluded.frame,
  chat_badge = excluded.chat_badge, name_color = excluded.name_color, chat_bubble = excluded.chat_bubble,
  hide_location = excluded.hide_location, entrance = excluded.entrance, entrance_fullscreen = excluded.entrance_fullscreen,
  entrance_sound = excluded.entrance_sound, id_card = excluded.id_card, friends_bonus = excluded.friends_bonus,
  immunity = excluded.immunity, super_moderation = excluded.super_moderation, invisible_mode = excluded.invisible_mode,
  monthly_salary = excluded.monthly_salary, join_banner = excluded.join_banner, private_support = excluded.private_support,
  system_broadcast = excluded.system_broadcast;

revoke all on public.vip_tiers from public, anon, authenticated;
grant select on public.vip_tiers to authenticated;
grant all on public.vip_tiers to service_role;
alter table public.vip_tiers enable row level security;
drop policy if exists vip_tiers_read on public.vip_tiers;
create policy vip_tiers_read on public.vip_tiers for select to authenticated using (true);

-- ---------- 4) Roles: moderators (مشرف) and top management (الإدارة العليا) ----------
do $$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'app_role') then
    create type public.app_role as enum ('admin', 'moderator');
  end if;
end $$;
create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  unique (user_id, role)
);
revoke all on public.user_roles from public, anon, authenticated;
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;
drop policy if exists user_roles_read_own on public.user_roles;
create policy user_roles_read_own on public.user_roles for select to authenticated using (auth.uid() = user_id);

create or replace function public.has_role(_user_id uuid, _role public.app_role) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;
revoke all on function public.has_role(uuid, public.app_role) from public, anon;
grant execute on function public.has_role(uuid, public.app_role) to authenticated;

-- ---------- 5) VIP grants: every purchase, admin grant, gift or event ----------
create table if not exists public.vip_grants (
  id uuid primary key default gen_random_uuid(),
  auth_id uuid not null references public.profiles(auth_id) on delete cascade,
  level smallint not null references public.vip_tiers(level),
  source text not null check (source in ('purchase', 'admin', 'gift', 'event')),
  starts_at timestamptz not null default now(),
  expires_at timestamptz,                         -- null = never expires
  coins_paid bigint not null default 0 check (coins_paid >= 0),
  note text,
  created_at timestamptz not null default now(),
  check (expires_at is null or expires_at >= starts_at)
);
create index if not exists vip_grants_member_idx on public.vip_grants(auth_id, level);
-- Members see their own VIP history; only the database functions below add or change rows.
revoke all on public.vip_grants from public, anon, authenticated;
grant select on public.vip_grants to authenticated;
grant all on public.vip_grants to service_role;
alter table public.vip_grants enable row level security;
drop policy if exists vip_grants_read_own on public.vip_grants;
create policy vip_grants_read_own on public.vip_grants for select to authenticated using (auth.uid() = auth_id);

-- Current VIP tier of a member, always live (0 = no VIP).
create or replace function public.vip_level_of(p_auth_id uuid) returns smallint
language sql stable security definer set search_path = '' as $$
  select coalesce(max(level), 0)::smallint from public.vip_grants
  where auth_id = p_auth_id and starts_at <= now() and (expires_at is null or expires_at > now())
$$;
revoke all on function public.vip_level_of(uuid) from public, anon;
grant execute on function public.vip_level_of(uuid) to authenticated;

-- Copies the live tier (and when it ends) onto the profile so the app can show it.
create or replace function public.refresh_vip(p_auth_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare lvl smallint := public.vip_level_of(p_auth_id); ends timestamptz;
begin
  if lvl > 0 then
    -- Includes back-to-back renewals of the same tier that start later.
    select case when bool_or(expires_at is null and starts_at <= now()) then null else max(expires_at) end into ends
    from public.vip_grants
    where auth_id = p_auth_id and level = lvl and (expires_at is null or expires_at > now());
  end if;
  update public.profiles set vip_level = lvl, vip_expires_at = ends
  where auth_id = p_auth_id and (vip_level is distinct from lvl or vip_expires_at is distinct from ends);
end;
$$;
revoke all on function public.refresh_vip(uuid) from public, anon, authenticated;

create or replace function public.refresh_all_vips() returns integer
language plpgsql security definer set search_path = '' as $$
declare r record; n integer := 0;
begin
  for r in select auth_id from public.profiles where vip_level > 0 or exists (select 1 from public.vip_grants g where g.auth_id = profiles.auth_id) loop
    perform public.refresh_vip(r.auth_id); n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function public.refresh_all_vips() from public, anon, authenticated;

create or replace function public.vip_grants_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then perform public.refresh_vip(old.auth_id); end if;
  if tg_op in ('INSERT', 'UPDATE') then perform public.refresh_vip(new.auth_id); end if;
  return null;
end;
$$;
revoke all on function public.vip_grants_changed() from public, anon, authenticated;
drop trigger if exists vip_grants_refresh on public.vip_grants;
create trigger vip_grants_refresh after insert or update or delete on public.vip_grants
  for each row execute function public.vip_grants_changed();

-- Members whose VIP was set directly on the profile (old way) keep it as a permanent admin grant.
insert into public.vip_grants(auth_id, level, source, note)
  select p.auth_id, p.vip_level, 'admin', 'من نظام VIP القديم' from public.profiles p
  where p.vip_level > 0 and not exists (select 1 from public.vip_grants g where g.auth_id = p.auth_id);

-- ---------- 6) Admin commands (SQL Editor only) ----------
create or replace function public.member_by_public_id(p_public_id integer) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare id uuid;
begin
  select auth_id into id from public.profiles where public_id = p_public_id;
  if id is null then raise exception 'No member with ID %', p_public_id using errcode = 'no_data_found'; end if;
  return id;
end;
$$;
revoke all on function public.member_by_public_id(integer) from public, anon, authenticated;

create or replace function public.admin_grant_vip(p_public_id integer, p_level integer, p_days integer default null,
  p_source text default 'admin', p_note text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare id uuid;
begin
  if p_source not in ('admin', 'gift', 'event') then raise exception 'Source must be admin, gift or event'; end if;
  if p_days is not null and p_days <= 0 then raise exception 'Days must be positive'; end if;
  insert into public.vip_grants(auth_id, level, source, expires_at, note)
    values (public.member_by_public_id(p_public_id), p_level, p_source,
            case when p_days is null then null else now() + make_interval(days => p_days) end, p_note)
    returning vip_grants.id into id;
  return id;
end;
$$;
revoke all on function public.admin_grant_vip(integer, integer, integer, text, text) from public, anon, authenticated;

create or replace function public.admin_revoke_vip(p_public_id integer) returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  update public.vip_grants set expires_at = greatest(starts_at, now())
  where auth_id = public.member_by_public_id(p_public_id) and (expires_at is null or expires_at > now());
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.admin_revoke_vip(integer) from public, anon, authenticated;

create or replace function public.admin_add_coins(p_public_id integer, p_amount bigint) returns bigint
language plpgsql security definer set search_path = '' as $$
declare balance bigint;
begin
  update public.profiles set coins = coins + p_amount where auth_id = public.member_by_public_id(p_public_id)
    returning coins into balance;
  return balance;
end;
$$;
revoke all on function public.admin_add_coins(integer, bigint) from public, anon, authenticated;

create or replace function public.admin_set_role(p_public_id integer, p_role public.app_role, p_enabled boolean default true) returns void
language plpgsql security definer set search_path = '' as $$
declare id uuid := public.member_by_public_id(p_public_id);
begin
  if p_enabled then
    insert into public.user_roles(user_id, role) values (id, p_role) on conflict (user_id, role) do nothing;
  else
    delete from public.user_roles where user_id = id and role = p_role;
  end if;
end;
$$;
revoke all on function public.admin_set_role(integer, public.app_role, boolean) from public, anon, authenticated;

-- ---------- 7) Buying VIP with coins (the app calls this) ----------
-- Price and length come from vip_tiers. Buying the same tier again adds its days after the current end.
create or replace function public.buy_vip(p_level integer) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); tier public.vip_tiers; balance bigint; starts timestamptz; ends timestamptz;
begin
  if me is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  select * into tier from public.vip_tiers where level = p_level;
  if not found then raise exception 'Unknown VIP level %', p_level; end if;
  if tier.price_coins is null then raise exception 'VIP % is not for sale yet', p_level using errcode = 'P0001', hint = 'not_for_sale'; end if;
  if exists (select 1 from public.vip_grants where auth_id = me and level >= p_level and expires_at is null and starts_at <= now()) then
    raise exception 'You already have this VIP level permanently' using hint = 'already_permanent';
  end if;
  select coins into balance from public.profiles where auth_id = me for update;
  if balance is null then raise exception 'No profile'; end if;
  if balance < tier.price_coins then raise exception 'Not enough coins' using hint = 'not_enough_coins'; end if;
  update public.profiles set coins = coins - tier.price_coins where auth_id = me;
  select greatest(now(), coalesce(max(expires_at), now())) into starts from public.vip_grants
    where auth_id = me and level = p_level and expires_at > now();
  ends := starts + make_interval(days => tier.duration_days);
  insert into public.vip_grants(auth_id, level, source, starts_at, expires_at, coins_paid)
    values (me, p_level, 'purchase', starts, ends, tier.price_coins);
  return ends;
end;
$$;
revoke all on function public.buy_vip(integer) from public, anon;
grant execute on function public.buy_vip(integer) to authenticated;

-- ---------- 8) Member settings that need a VIP feature ----------
create or replace function public.vip_has(p_auth_id uuid, p_feature text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare t public.vip_tiers;
begin
  select * into t from public.vip_tiers where level = public.vip_level_of(p_auth_id);
  if not found then return false; end if;
  return case p_feature
    when 'hide_location' then t.hide_location
    when 'invisible_mode' then t.invisible_mode
    when 'chat_badge' then t.chat_badge
    when 'name_color' then t.name_color
    when 'join_banner' then t.join_banner
    when 'system_broadcast' then t.system_broadcast
    when 'private_support' then t.private_support
    when 'super_moderation' then t.super_moderation
    when 'monthly_salary' then t.monthly_salary
    when 'friends_bonus' then t.friends_bonus
    else false end;
end;
$$;
revoke all on function public.vip_has(uuid, text) from public, anon;
grant execute on function public.vip_has(uuid, text) to authenticated;

create or replace function public.check_vip_settings() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.hide_location and not old.hide_location and not public.vip_has(new.auth_id, 'hide_location') then
    raise exception 'Hiding location needs VIP 2 or higher' using errcode = '42501';
  end if;
  if new.vip_invisible and not old.vip_invisible and not public.vip_has(new.auth_id, 'invisible_mode') then
    raise exception 'Invisible mode needs VIP 5 or higher' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.check_vip_settings() from public, anon, authenticated;
drop trigger if exists profiles_vip_settings on public.profiles;
create trigger profiles_vip_settings before update of hide_location, vip_invisible on public.profiles
  for each row execute function public.check_vip_settings();

-- Settings only count while the member still has the tier.
create or replace function public.location_hidden(p_auth_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select hide_location from public.profiles where auth_id = p_auth_id), false) and public.vip_has(p_auth_id, 'hide_location')
$$;
create or replace function public.is_invisible(p_auth_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select vip_invisible from public.profiles where auth_id = p_auth_id), false) and public.vip_has(p_auth_id, 'invisible_mode')
$$;
revoke all on function public.location_hidden(uuid) from public, anon;
revoke all on function public.is_invisible(uuid) from public, anon;
grant execute on function public.location_hidden(uuid) to authenticated;
grant execute on function public.is_invisible(uuid) to authenticated;

-- ---------- 9) Stream-room rules (ready for when rooms are built) ----------
-- Can actor mute or kick target?
--   * Nobody in the app can act on top management (admin).
--   * Top management can act on everyone else, including VIP 8.
--   * VIP 8 (absolute immunity): only top management.
--   * VIP 6+ (super moderation): moderators and members with a lower VIP tier (including no VIP).
--   * Moderators: members who are not moderators and whose tier has no immunity (VIP 0–3).
--   * Everyone else: no.
create or replace function public.can_mute_or_kick(p_actor uuid, p_target uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare a_vip smallint; t_vip smallint; a_super boolean; t_immunity text;
begin
  if p_actor is null or p_target is null or p_actor = p_target then return false; end if;
  if public.has_role(p_target, 'admin') then return false; end if;
  if public.has_role(p_actor, 'admin') then return true; end if;
  a_vip := public.vip_level_of(p_actor);
  t_vip := public.vip_level_of(p_target);
  select coalesce((select super_moderation from public.vip_tiers where level = a_vip), false) into a_super;
  select coalesce((select immunity from public.vip_tiers where level = t_vip), 'none') into t_immunity;
  if t_immunity = 'absolute' then return false; end if;
  if a_super and t_vip < a_vip then return true; end if;
  if public.has_role(p_actor, 'moderator') and not public.has_role(p_target, 'moderator') and t_immunity = 'none' then return true; end if;
  return false;
end;
$$;
revoke all on function public.can_mute_or_kick(uuid, uuid) from public, anon;
grant execute on function public.can_mute_or_kick(uuid, uuid) to authenticated;

-- What a room shows when the member enters. Invisible members enter silently.
create or replace function public.vip_room_entry(p_auth_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare t public.vip_tiers; lvl smallint := public.vip_level_of(p_auth_id); hidden boolean := public.is_invisible(p_auth_id);
begin
  select * into t from public.vip_tiers where level = lvl;
  if not found or hidden then
    return jsonb_build_object('level', case when hidden then lvl else 0 end, 'invisible', hidden, 'entrance', null,
      'fullscreen', false, 'sound', false, 'join_banner', false, 'system_broadcast', false, 'name_color', false);
  end if;
  return jsonb_build_object('level', lvl, 'invisible', false, 'entrance', t.entrance, 'fullscreen', t.entrance_fullscreen,
    'sound', t.entrance_sound, 'join_banner', t.join_banner, 'system_broadcast', t.system_broadcast, 'name_color', t.name_color);
end;
$$;
revoke all on function public.vip_room_entry(uuid) from public, anon;
grant execute on function public.vip_room_entry(uuid) to authenticated;

-- ---------- 10) Monthly coin salary (VIP 6+; pays nothing until amounts are set) ----------
create table if not exists public.vip_salary_payments (
  auth_id uuid not null references public.profiles(auth_id) on delete cascade,
  month date not null,
  level smallint not null,
  coins bigint not null check (coins > 0),
  paid_at timestamptz not null default now(),
  primary key (auth_id, month)
);
revoke all on public.vip_salary_payments from public, anon, authenticated;
grant select on public.vip_salary_payments to authenticated;
grant all on public.vip_salary_payments to service_role;
alter table public.vip_salary_payments enable row level security;
drop policy if exists vip_salary_read_own on public.vip_salary_payments;
create policy vip_salary_read_own on public.vip_salary_payments for select to authenticated using (auth.uid() = auth_id);

create or replace function public.pay_vip_salaries() returns integer
language plpgsql security definer set search_path = '' as $$
declare r record; n integer := 0; this_month date := date_trunc('month', now())::date;
begin
  for r in
    select p.auth_id, t.level, t.monthly_salary_coins from public.profiles p
    join public.vip_tiers t on t.level = public.vip_level_of(p.auth_id)
    where t.monthly_salary and t.monthly_salary_coins is not null
  loop
    insert into public.vip_salary_payments(auth_id, month, level, coins) values (r.auth_id, this_month, r.level, r.monthly_salary_coins)
      on conflict (auth_id, month) do nothing;
    if found then
      update public.profiles set coins = coins + r.monthly_salary_coins where auth_id = r.auth_id;
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;
revoke all on function public.pay_vip_salaries() from public, anon, authenticated;

-- ---------- 11) Member grants on profiles (VIP, coins and points stay read-only) ----------
revoke update on public.profiles from authenticated;
grant update (display_name, avatar_url, bio, hide_location, vip_invisible) on public.profiles to authenticated;

select public.refresh_all_vips();

commit;
