-- voli update 023: the Store (المتجر) and the Backpack (الحقيبة).
-- Run once in the SQL Editor after update 009. Safe to run again.
--
-- 1) store_items: what the store sells. Two kinds, like the reference screens:
--      frame = Headwear (إطار حول صورة العضو)   ride = Ride (دخولية تظهر عند دخول الغرفة)
--    Each item has a style tab (simple / romantic / luxury / theme), a price in coins, a duration in days,
--    a picture (PNG / WebP / animated GIF from Voli's Cloudinary) and an optional video (played for rides).
--    Hidden items (active = false) are not for sale, but members who own them keep them until they end.
-- 2) member_items: each member's Backpack. Buying again adds the days on top of what is left.
--    One equipped item per kind. Members read their own items, and everyone signed in can see
--    the items other members are wearing right now (so frames and rides show to others).
-- 3) store_purchases: every sale and every management grant (closed to the app).
-- 4) App functions: store_buy (pay with coins) and store_equip (wear / take off).
-- 5) Panel functions: admin_store_items, admin_create_store_item, admin_update_store_item,
--    admin_set_store_item_art, admin_set_store_item_video, admin_member_items,
--    admin_grant_store_item, admin_revoke_store_item. All check the admin role first.
-- 6) The last line refreshes the API's function list right away.

begin;

-- ---------- Accepted links (Voli's own Cloudinary cloud only) ----------
create or replace function public.store_art_ok(p_url text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(p_url ~ '^https://res\.cloudinary\.com/zsxxjkqg/image/upload/[^[:cntrl:]"''<>\\]+$', false)
$$;
revoke all on function public.store_art_ok(text) from public, anon, authenticated;

create or replace function public.store_video_ok(p_url text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(p_url ~ '^https://res\.cloudinary\.com/zsxxjkqg/video/upload/[^[:cntrl:]"''<>\\]+$', false)
$$;
revoke all on function public.store_video_ok(text) from public, anon, authenticated;

-- ---------- 1) Store items ----------
create table if not exists public.store_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('frame', 'ride')),
  style text not null default 'simple' check (style in ('simple', 'romantic', 'luxury', 'theme')),
  name text not null check (char_length(btrim(name)) between 1 and 40),
  price bigint not null check (price > 0 and price <= 100000000000),
  days integer not null check (days between 1 and 3650),
  art_url text not null,
  video_url text,
  sort integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists store_items_list_idx on public.store_items(kind, style, sort);
revoke all on public.store_items from public, anon, authenticated;
grant select on public.store_items to authenticated;
grant all on public.store_items to service_role;
alter table public.store_items enable row level security;
-- Everyone signed in can read every item (hidden ones too), so owned and worn items always show their picture.
drop policy if exists store_items_read on public.store_items;
create policy store_items_read on public.store_items for select to authenticated using (true);

-- ---------- 2) Backpack ----------
create table if not exists public.member_items (
  auth_id uuid not null references public.profiles(auth_id) on delete cascade,
  item_id uuid not null references public.store_items(id) on delete cascade,
  kind text not null check (kind in ('frame', 'ride')),
  expires_at timestamptz not null,
  equipped boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (auth_id, item_id)
);
create unique index if not exists member_items_one_equipped on public.member_items(auth_id, kind) where equipped;
create index if not exists member_items_worn_idx on public.member_items(auth_id) where equipped;
revoke all on public.member_items from public, anon, authenticated;
grant select on public.member_items to authenticated;
grant all on public.member_items to service_role;
alter table public.member_items enable row level security;
drop policy if exists member_items_read on public.member_items;
create policy member_items_read on public.member_items for select to authenticated
  using (auth_id = auth.uid() or (equipped and expires_at > now()));

-- ---------- 3) Sales and grants (closed to the app) ----------
create table if not exists public.store_purchases (
  id bigint generated always as identity primary key,
  auth_id uuid not null references public.profiles(auth_id) on delete cascade,
  item_id uuid not null references public.store_items(id) on delete cascade,
  price bigint not null default 0,
  days integer not null,
  source text not null check (source in ('buy', 'admin')),
  admin_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists store_purchases_item_idx on public.store_purchases(item_id);
revoke all on public.store_purchases from public, anon, authenticated;
grant all on public.store_purchases to service_role;
alter table public.store_purchases enable row level security;

-- Adds days to a member's item (on top of what is left) and returns the new end time.
create or replace function public.store_add_days(p_auth uuid, p_item uuid, p_kind text, p_days integer) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare until timestamptz;
begin
  insert into public.member_items(auth_id, item_id, kind, expires_at)
    values (p_auth, p_item, p_kind, now() + make_interval(days => p_days))
  on conflict (auth_id, item_id) do update
    set expires_at = greatest(public.member_items.expires_at, now()) + make_interval(days => p_days), updated_at = now()
  returning expires_at into until;
  return until;
end;
$$;
revoke all on function public.store_add_days(uuid, uuid, text, integer) from public, anon, authenticated;

-- ---------- 4) App: buy and wear ----------
-- Errors (hint): not_signed_in, not_for_sale, not_enough_coins. Returns the item's new end time.
create or replace function public.store_buy(p_item uuid) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); it public.store_items; until timestamptz;
begin
  if me is null then raise exception 'Sign in first' using errcode = 'P0001', hint = 'not_signed_in'; end if;
  select * into it from public.store_items where id = p_item and active;
  if not found then raise exception 'Not for sale' using errcode = 'P0001', hint = 'not_for_sale'; end if;
  update public.profiles set coins = coins - it.price where auth_id = me and coins >= it.price;
  if not found then raise exception 'Not enough coins' using errcode = 'P0001', hint = 'not_enough_coins'; end if;
  until := public.store_add_days(me, it.id, it.kind, it.days);
  insert into public.store_purchases(auth_id, item_id, price, days, source) values (me, it.id, it.price, it.days, 'buy');
  return until;
end;
$$;
revoke all on function public.store_buy(uuid) from public, anon;
grant execute on function public.store_buy(uuid) to authenticated;

-- Wear (p_on = true) or take off (false). Wearing takes off the other item of the same kind.
-- Errors (hint): not_signed_in, not_owned (not in the backpack, or its days ended).
create or replace function public.store_equip(p_item uuid, p_on boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); k text;
begin
  if me is null then raise exception 'Sign in first' using errcode = 'P0001', hint = 'not_signed_in'; end if;
  if not coalesce(p_on, false) then
    update public.member_items set equipped = false, updated_at = now() where auth_id = me and item_id = p_item;
    return;
  end if;
  select kind into k from public.member_items where auth_id = me and item_id = p_item and expires_at > now();
  if not found then raise exception 'Not owned' using errcode = 'P0001', hint = 'not_owned'; end if;
  update public.member_items set equipped = false, updated_at = now()
    where auth_id = me and kind = k and equipped and item_id <> p_item;
  update public.member_items set equipped = true, updated_at = now() where auth_id = me and item_id = p_item;
end;
$$;
revoke all on function public.store_equip(uuid, boolean) from public, anon;
grant execute on function public.store_equip(uuid, boolean) to authenticated;

-- ---------- 5) Panel ----------
drop function if exists public.admin_store_items();
create function public.admin_store_items()
returns table(id uuid, kind text, style text, name text, price bigint, days integer, art_url text, video_url text,
  sort integer, active boolean, created_at timestamptz, sold_count bigint, sold_value bigint, owners_now bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.admin_guard();
  return query
    select i.id, i.kind, i.style, i.name, i.price, i.days, i.art_url, i.video_url, i.sort, i.active, i.created_at,
      (select count(*) from public.store_purchases p where p.item_id = i.id and p.source = 'buy'),
      (select coalesce(sum(p.price), 0)::bigint from public.store_purchases p where p.item_id = i.id and p.source = 'buy'),
      (select count(*) from public.member_items m where m.item_id = i.id and m.expires_at > now())
    from public.store_items i order by i.kind, i.sort, i.created_at;
end;
$$;
revoke all on function public.admin_store_items() from public, anon;
grant execute on function public.admin_store_items() to authenticated;

-- Shared checks for item fields. Errors (hint): bad_item_kind, bad_style, bad_name, bad_price, bad_days.
create or replace function public.store_check_item(p_kind text, p_style text, p_name text, p_price bigint, p_days integer) returns void
language plpgsql immutable set search_path = '' as $$
begin
  if p_kind is null or p_kind not in ('frame', 'ride') then raise exception 'Bad kind' using errcode = 'P0001', hint = 'bad_item_kind'; end if;
  if p_style is null or p_style not in ('simple', 'romantic', 'luxury', 'theme') then raise exception 'Bad style' using errcode = 'P0001', hint = 'bad_style'; end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 40 then raise exception 'Bad name' using errcode = 'P0001', hint = 'bad_name'; end if;
  if p_price is null or p_price <= 0 or p_price > 100000000000 then raise exception 'Bad price' using errcode = 'P0001', hint = 'bad_price'; end if;
  if p_days is null or p_days not between 1 and 3650 then raise exception 'Bad days' using errcode = 'P0001', hint = 'bad_days'; end if;
end;
$$;
revoke all on function public.store_check_item(text, text, text, bigint, integer) from public, anon, authenticated;

-- New item (for sale right away). Sort null = after the last item of the same kind. Returns its id.
-- Errors (hint): the checks above, bad_item_art, bad_video.
create or replace function public.admin_create_store_item(p_kind text, p_style text, p_name text, p_price bigint, p_days integer,
  p_sort integer, p_art_url text, p_video_url text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.admin_guard(); new_id uuid; s integer;
begin
  perform public.store_check_item(p_kind, p_style, p_name, p_price, p_days);
  if not public.store_art_ok(p_art_url) then raise exception 'Bad picture' using errcode = 'P0001', hint = 'bad_item_art'; end if;
  if p_video_url is not null and not public.store_video_ok(p_video_url) then raise exception 'Bad video' using errcode = 'P0001', hint = 'bad_video'; end if;
  s := coalesce(p_sort, (select coalesce(max(sort), 0) + 1 from public.store_items where kind = p_kind));
  insert into public.store_items(kind, style, name, price, days, sort, art_url, video_url)
    values (p_kind, p_style, btrim(p_name), p_price, p_days, s, p_art_url, p_video_url) returning id into new_id;
  perform public.admin_log(me, 'store_create', null, jsonb_build_object('id', new_id, 'kind', p_kind, 'name', btrim(p_name), 'price', p_price, 'days', p_days));
  return new_id;
end;
$$;
revoke all on function public.admin_create_store_item(text, text, text, bigint, integer, integer, text, text) from public, anon;
grant execute on function public.admin_create_store_item(text, text, text, bigint, integer, integer, text, text) to authenticated;

-- Edit name, style, price, days, order, and whether it is for sale. The kind never changes.
create or replace function public.admin_update_store_item(p_id uuid, p_name text, p_style text, p_price bigint, p_days integer,
  p_sort integer, p_active boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.admin_guard(); k text;
begin
  select kind into k from public.store_items where id = p_id;
  if not found then raise exception 'No such item' using errcode = 'P0001', hint = 'not_found'; end if;
  perform public.store_check_item(k, p_style, p_name, p_price, p_days);
  update public.store_items set name = btrim(p_name), style = p_style, price = p_price, days = p_days,
    sort = coalesce(p_sort, sort), active = coalesce(p_active, active) where id = p_id;
  perform public.admin_log(me, 'store_update', null, jsonb_build_object('id', p_id, 'kind', k, 'name', btrim(p_name), 'price', p_price, 'days', p_days, 'active', coalesce(p_active, true)));
end;
$$;
revoke all on function public.admin_update_store_item(uuid, text, text, bigint, integer, integer, boolean) from public, anon;
grant execute on function public.admin_update_store_item(uuid, text, text, bigint, integer, integer, boolean) to authenticated;

create or replace function public.admin_set_store_item_art(p_id uuid, p_art_url text) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.admin_guard(); n text;
begin
  if not public.store_art_ok(p_art_url) then raise exception 'Bad picture' using errcode = 'P0001', hint = 'bad_item_art'; end if;
  update public.store_items set art_url = p_art_url where id = p_id returning name into n;
  if not found then raise exception 'No such item' using errcode = 'P0001', hint = 'not_found'; end if;
  perform public.admin_log(me, 'store_art', null, jsonb_build_object('id', p_id, 'name', n));
end;
$$;
revoke all on function public.admin_set_store_item_art(uuid, text) from public, anon;
grant execute on function public.admin_set_store_item_art(uuid, text) to authenticated;

-- Add, change or remove (null) an item's video.
create or replace function public.admin_set_store_item_video(p_id uuid, p_video_url text) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.admin_guard(); n text;
begin
  if p_video_url is not null and not public.store_video_ok(p_video_url) then raise exception 'Bad video' using errcode = 'P0001', hint = 'bad_video'; end if;
  update public.store_items set video_url = p_video_url where id = p_id returning name into n;
  if not found then raise exception 'No such item' using errcode = 'P0001', hint = 'not_found'; end if;
  perform public.admin_log(me, 'store_video', null, jsonb_build_object('id', p_id, 'name', n, 'removed', p_video_url is null));
end;
$$;
revoke all on function public.admin_set_store_item_video(uuid, text) from public, anon;
grant execute on function public.admin_set_store_item_video(uuid, text) to authenticated;

-- A member's backpack (ended items too, newest end first).
drop function if exists public.admin_member_items(uuid);
create function public.admin_member_items(p_auth uuid)
returns table(item_id uuid, kind text, name text, art_url text, expires_at timestamptz, equipped boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.admin_guard();
  perform public.admin_member_exists(p_auth);
  return query
    select m.item_id, m.kind, i.name, i.art_url, m.expires_at, m.equipped and m.expires_at > now()
    from public.member_items m join public.store_items i on i.id = m.item_id
    where m.auth_id = p_auth order by m.expires_at desc;
end;
$$;
revoke all on function public.admin_member_items(uuid) from public, anon;
grant execute on function public.admin_member_items(uuid) to authenticated;

-- Give an item free (hidden items too). Days null = the item's own duration. Returns the new end time.
create or replace function public.admin_grant_store_item(p_auth uuid, p_item uuid, p_days integer) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.admin_guard(); it public.store_items; d integer; until timestamptz;
begin
  perform public.admin_member_exists(p_auth);
  select * into it from public.store_items where id = p_item;
  if not found then raise exception 'No such item' using errcode = 'P0001', hint = 'not_found'; end if;
  d := coalesce(p_days, it.days);
  if d not between 1 and 3650 then raise exception 'Bad days' using errcode = 'P0001', hint = 'bad_days'; end if;
  until := public.store_add_days(p_auth, it.id, it.kind, d);
  insert into public.store_purchases(auth_id, item_id, price, days, source, admin_id) values (p_auth, it.id, 0, d, 'admin', me);
  perform public.admin_log(me, 'store_grant', p_auth, jsonb_build_object('id', it.id, 'kind', it.kind, 'name', it.name, 'days', d));
  return until;
end;
$$;
revoke all on function public.admin_grant_store_item(uuid, uuid, integer) from public, anon;
grant execute on function public.admin_grant_store_item(uuid, uuid, integer) to authenticated;

-- Take an item out of a member's backpack (no refund).
create or replace function public.admin_revoke_store_item(p_auth uuid, p_item uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.admin_guard(); n text; k text;
begin
  select i.name, i.kind into n, k from public.member_items m join public.store_items i on i.id = m.item_id
    where m.auth_id = p_auth and m.item_id = p_item;
  if not found then raise exception 'Not owned' using errcode = 'P0001', hint = 'not_found'; end if;
  delete from public.member_items where auth_id = p_auth and item_id = p_item;
  perform public.admin_log(me, 'store_revoke', p_auth, jsonb_build_object('id', p_item, 'kind', k, 'name', n));
end;
$$;
revoke all on function public.admin_revoke_store_item(uuid, uuid) from public, anon;
grant execute on function public.admin_revoke_store_item(uuid, uuid) to authenticated;

commit;

-- ---------- 6) Refresh the API's function list right away ----------
notify pgrst, 'reload schema';
