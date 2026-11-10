-- voli update 023: the store (المتجر) and the backpack (الحقيبة).
-- Run once in the SQL Editor after updates 003 (coins) and 009 (management). Safe to run again.
--
-- Two kinds of items, each in one of four categories (simple / romantic / luxury / theme):
--   headwear = a frame worn around the profile picture (profiles, room seats),
--   ride     = a vehicle shown when its owner comes into a room (picture, plus an optional video).
-- Every item has a price in coins and a length in days. Buying it again adds its days after the current end.
-- Buying (or getting it from management) puts it on; at most one item of each kind is worn at a time.
--
-- Members read the items on sale (RLS: active only). What each member owns lives in public.member_items,
-- closed to the app: members see their own items through my_backpack() and what others wear through
-- worn_items(). Every change goes through security-definer functions, so prices and coins stay server-side.
-- Pictures and videos must come from Voli's Cloudinary cloud (zsxxjkqg), like gift pictures and videos.
--
-- From the SQL Editor:
--   select * from public.admin_store_items();                                -- the whole store with sales
--   select public.admin_give_store_item(1234567, <item id>, 7);              -- give an item for 7 days
--   update public.store_items set active = false where id = <item id>;       -- take it off the shelf
begin;

-- ---------- 1) Items on sale ----------
create table if not exists public.store_items (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('headwear', 'ride')),
  category text not null default 'simple' check (category in ('simple', 'romantic', 'luxury', 'theme')),
  name text not null check (char_length(btrim(name)) between 1 and 40),
  price bigint not null check (price > 0),
  duration_days integer not null default 7 check (duration_days between 1 and 3650),
  art_url text not null,
  video_url text,
  sort integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists store_items_shelf_idx on public.store_items(kind, category, sort, id);
revoke all on public.store_items from public, anon, authenticated;
grant select on public.store_items to authenticated;
grant all on public.store_items to service_role;
alter table public.store_items enable row level security;
drop policy if exists store_items_read on public.store_items;
create policy store_items_read on public.store_items for select to authenticated using (active);

-- ---------- 2) What each member owns (closed to the app) ----------
create table if not exists public.member_items (
  auth_id uuid not null references public.profiles(auth_id) on delete cascade,
  item_id bigint not null references public.store_items(id) on delete cascade,
  expires_at timestamptz not null,
  equipped boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (auth_id, item_id)
);
create index if not exists member_items_item_idx on public.member_items(item_id);
revoke all on public.member_items from public, anon, authenticated;
grant all on public.member_items to service_role;
alter table public.member_items enable row level security;

-- Every purchase or management gift (closed to the app; used for the panel's sales numbers).
create table if not exists public.store_purchases (
  id bigint generated always as identity primary key,
  auth_id uuid references public.profiles(auth_id) on delete set null,
  item_id bigint references public.store_items(id) on delete set null,
  price bigint not null default 0 check (price >= 0),
  days integer not null check (days > 0),
  source text not null default 'purchase' check (source in ('purchase', 'admin')),
  created_at timestamptz not null default now()
);
create index if not exists store_purchases_item_idx on public.store_purchases(item_id);
revoke all on public.store_purchases from public, anon, authenticated;
grant all on public.store_purchases to service_role;
alter table public.store_purchases enable row level security;
-- Row level security stays on with no policies on member_items and store_purchases.

-- ---------- 3) Helpers (not callable from the app) ----------
-- Only links from Voli's Cloudinary cloud; p_kind is 'image' or 'video'.
create or replace function public.store_media_ok(p_url text, p_kind text) returns boolean
language sql immutable set search_path = '' as $$
  select p_kind in ('image', 'video')
    and coalesce(p_url ~ ('^https://res\.cloudinary\.com/zsxxjkqg/' || p_kind || '/upload/[^[:cntrl:]"''<>\\]+$'), false)
$$;
revoke all on function public.store_media_ok(text, text) from public, anon, authenticated;

-- Adds days to a member's item (after the current end when still running) and puts it on.
create or replace function public.store_add_days(p_auth uuid, p_item bigint, p_days integer) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare k text; ends timestamptz;
begin
  select kind into k from public.store_items where id = p_item;
  if k is null then raise exception 'No such item' using errcode = 'P0001', hint = 'not_found'; end if;
  update public.member_items m set equipped = false, updated_at = now()
    from public.store_items s
    where s.id = m.item_id and m.auth_id = p_auth and s.kind = k and m.item_id <> p_item and m.equipped;
  insert into public.member_items as m (auth_id, item_id, expires_at, equipped)
    values (p_auth, p_item, now() + make_interval(days => p_days), true)
  on conflict (auth_id, item_id) do update
    set expires_at = greatest(m.expires_at, now()) + make_interval(days => p_days), equipped = true, updated_at = now()
  returning m.expires_at into ends;
  return ends;
end;
$$;
revoke all on function public.store_add_days(uuid, bigint, integer) from public, anon, authenticated;

-- ---------- 4) Members: buy, backpack, wear ----------
-- Returns when the item ends for the buyer.
create or replace function public.buy_store_item(p_item bigint) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); it public.store_items; balance bigint; ends timestamptz;
begin
  if me is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  select * into it from public.store_items where id = p_item and active;
  if not found then raise exception 'Not for sale' using errcode = 'P0001', hint = 'not_for_sale'; end if;
  select coins into balance from public.profiles where auth_id = me for update;
  if balance is null then raise exception 'No profile' using errcode = 'P0001', hint = 'no_profile'; end if;
  if balance < it.price then raise exception 'Not enough coins' using errcode = 'P0001', hint = 'not_enough_coins'; end if;
  update public.profiles set coins = coins - it.price where auth_id = me;
  ends := public.store_add_days(me, it.id, it.duration_days);
  insert into public.store_purchases(auth_id, item_id, price, days, source) values (me, it.id, it.price, it.duration_days, 'purchase');
  return ends;
end;
$$;
revoke all on function public.buy_store_item(bigint) from public, anon;
grant execute on function public.buy_store_item(bigint) to authenticated;

-- The signed-in member's items that have not ended, newest end first.
drop function if exists public.my_backpack();
create function public.my_backpack()
returns table(item_id bigint, kind text, category text, name text, art_url text, video_url text, expires_at timestamptz, equipped boolean)
language sql stable security definer set search_path = '' as $$
  select s.id, s.kind, s.category, s.name, s.art_url, s.video_url, m.expires_at, m.equipped
  from public.member_items m join public.store_items s on s.id = m.item_id
  where m.auth_id = auth.uid() and m.expires_at > now()
  order by s.kind, m.expires_at desc, s.id
$$;
revoke all on function public.my_backpack() from public, anon;
grant execute on function public.my_backpack() to authenticated;

-- Put an owned item on (taking off the other one of the same kind) or take it off.
create or replace function public.equip_store_item(p_item bigint, p_on boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); k text;
begin
  if me is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  select s.kind into k from public.member_items m join public.store_items s on s.id = m.item_id
    where m.auth_id = me and m.item_id = p_item and m.expires_at > now();
  if k is null then raise exception 'Not in your backpack' using errcode = 'P0001', hint = 'not_owned'; end if;
  if coalesce(p_on, false) then
    update public.member_items m set equipped = false, updated_at = now()
      from public.store_items s
      where s.id = m.item_id and m.auth_id = me and s.kind = k and m.item_id <> p_item and m.equipped;
  end if;
  update public.member_items set equipped = coalesce(p_on, false), updated_at = now() where auth_id = me and item_id = p_item;
end;
$$;
revoke all on function public.equip_store_item(bigint, boolean) from public, anon;
grant execute on function public.equip_store_item(bigint, boolean) to authenticated;

-- What these members wear right now (for profiles and room seats). Up to 100 members per call.
drop function if exists public.worn_items(uuid[]);
create function public.worn_items(p_ids uuid[])
returns table(auth_id uuid, kind text, item_id bigint, name text, art_url text, video_url text)
language sql stable security definer set search_path = '' as $$
  select m.auth_id, s.kind, s.id, s.name, s.art_url, s.video_url
  from public.member_items m join public.store_items s on s.id = m.item_id
  where auth.uid() is not null and m.auth_id = any (p_ids[1:100]) and m.equipped and m.expires_at > now()
$$;
revoke all on function public.worn_items(uuid[]) from public, anon;
grant execute on function public.worn_items(uuid[]) to authenticated;

-- ---------- 5) Management panel ----------
drop function if exists public.admin_store_items();
create function public.admin_store_items()
returns table(id bigint, kind text, category text, name text, price bigint, duration_days integer, art_url text, video_url text,
  sort integer, active boolean, owners bigint, sold_count bigint, sold_value bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.admin_guard();
  return query
    select s.id, s.kind, s.category, s.name, s.price, s.duration_days, s.art_url, s.video_url, s.sort, s.active,
      (select count(*) from public.member_items m where m.item_id = s.id and m.expires_at > now())::bigint,
      (select count(*) from public.store_purchases p where p.item_id = s.id and p.source = 'purchase')::bigint,
      (select coalesce(sum(p.price), 0) from public.store_purchases p where p.item_id = s.id)::bigint
    from public.store_items s order by s.kind, s.category, s.sort, s.id;
end;
$$;
revoke all on function public.admin_store_items() from public, anon;
grant execute on function public.admin_store_items() to authenticated;

-- Checks shared by create and update.
create or replace function public.store_check(p_category text, p_name text, p_price bigint, p_days integer) returns void
language plpgsql immutable set search_path = '' as $$
begin
  if p_category is null or p_category not in ('simple', 'romantic', 'luxury', 'theme') then
    raise exception 'Bad category' using errcode = 'P0001', hint = 'bad_category'; end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 40 then
    raise exception 'Bad name' using errcode = 'P0001', hint = 'bad_name'; end if;
  if p_price is null or p_price <= 0 then raise exception 'Bad price' using errcode = 'P0001', hint = 'bad_price'; end if;
  if p_days is null or p_days not between 1 and 3650 then raise exception 'Bad days' using errcode = 'P0001', hint = 'bad_days'; end if;
end;
$$;
revoke all on function public.store_check(text, text, bigint, integer) from public, anon, authenticated;

-- New item; p_sort null = last in its category. Returns the item id.
create or replace function public.admin_create_store_item(p_kind text, p_category text, p_name text, p_price bigint,
  p_days integer, p_sort integer, p_art_url text, p_video_url text default null) returns bigint
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.admin_guard(); v text := nullif(btrim(coalesce(p_video_url, '')), ''); new_id bigint; s integer;
begin
  if p_kind is null or p_kind not in ('headwear', 'ride') then raise exception 'Bad kind' using errcode = 'P0001', hint = 'bad_kind'; end if;
  perform public.store_check(p_category, p_name, p_price, p_days);
  if not public.store_media_ok(p_art_url, 'image') then raise exception 'Bad picture' using errcode = 'P0001', hint = 'bad_art'; end if;
  if v is not null and not public.store_media_ok(v, 'video') then raise exception 'Bad video' using errcode = 'P0001', hint = 'bad_video'; end if;
  s := coalesce(p_sort, (select coalesce(max(i.sort), 0) + 1 from public.store_items i where i.kind = p_kind and i.category = p_category));
  insert into public.store_items(kind, category, name, price, duration_days, art_url, video_url, sort)
    values (p_kind, p_category, btrim(p_name), p_price, p_days, p_art_url, v, s) returning id into new_id;
  perform public.admin_log(me, 'store_create', null, jsonb_build_object('item', new_id, 'kind', p_kind, 'name', btrim(p_name), 'price', p_price));
  return new_id;
end;
$$;
revoke all on function public.admin_create_store_item(text, text, text, bigint, integer, integer, text, text) from public, anon;
grant execute on function public.admin_create_store_item(text, text, text, bigint, integer, integer, text, text) to authenticated;

create or replace function public.admin_update_store_item(p_id bigint, p_category text, p_name text, p_price bigint,
  p_days integer, p_sort integer, p_active boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.admin_guard();
begin
  perform public.store_check(p_category, p_name, p_price, p_days);
  update public.store_items set category = p_category, name = btrim(p_name), price = p_price, duration_days = p_days,
    sort = coalesce(p_sort, sort), active = coalesce(p_active, active)
  where id = p_id;
  if not found then raise exception 'No such item' using errcode = 'P0001', hint = 'not_found'; end if;
  perform public.admin_log(me, 'store_update', null, jsonb_build_object('item', p_id, 'price', p_price, 'active', p_active));
end;
$$;
revoke all on function public.admin_update_store_item(bigint, text, text, bigint, integer, integer, boolean) from public, anon;
grant execute on function public.admin_update_store_item(bigint, text, text, bigint, integer, integer, boolean) to authenticated;

create or replace function public.admin_set_store_item_art(p_id bigint, p_art_url text) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.admin_guard();
begin
  if not public.store_media_ok(p_art_url, 'image') then raise exception 'Bad picture' using errcode = 'P0001', hint = 'bad_art'; end if;
  update public.store_items set art_url = p_art_url where id = p_id;
  if not found then raise exception 'No such item' using errcode = 'P0001', hint = 'not_found'; end if;
  perform public.admin_log(me, 'store_art', null, jsonb_build_object('item', p_id));
end;
$$;
revoke all on function public.admin_set_store_item_art(bigint, text) from public, anon;
grant execute on function public.admin_set_store_item_art(bigint, text) to authenticated;

-- p_video_url null or empty = remove the video (picture only).
create or replace function public.admin_set_store_item_video(p_id bigint, p_video_url text) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.admin_guard(); v text := nullif(btrim(coalesce(p_video_url, '')), '');
begin
  if v is not null and not public.store_media_ok(v, 'video') then raise exception 'Bad video' using errcode = 'P0001', hint = 'bad_video'; end if;
  update public.store_items set video_url = v where id = p_id;
  if not found then raise exception 'No such item' using errcode = 'P0001', hint = 'not_found'; end if;
  perform public.admin_log(me, 'store_video', null, jsonb_build_object('item', p_id, 'video', v is not null));
end;
$$;
revoke all on function public.admin_set_store_item_video(bigint, text) from public, anon;
grant execute on function public.admin_set_store_item_video(bigint, text) to authenticated;

-- Deleting is refused while a member still owns the item (hide it instead), so nobody loses what they paid for.
create or replace function public.admin_delete_store_item(p_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.admin_guard(); n text;
begin
  if exists (select 1 from public.member_items where item_id = p_id and expires_at > now()) then
    raise exception 'Members still own this item' using errcode = 'P0001', hint = 'in_use';
  end if;
  delete from public.store_items where id = p_id returning name into n;
  if n is null then raise exception 'No such item' using errcode = 'P0001', hint = 'not_found'; end if;
  perform public.admin_log(me, 'store_delete', null, jsonb_build_object('item', p_id, 'name', n));
end;
$$;
revoke all on function public.admin_delete_store_item(bigint) from public, anon;
grant execute on function public.admin_delete_store_item(bigint) to authenticated;

-- Give an item to a member for p_days (null = the item's own length), free. Hidden items can be given too.
create or replace function public.admin_give_store_item(p_public_id integer, p_item bigint, p_days integer default null) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.admin_guard(); who uuid; d integer; ends timestamptz;
begin
  select id_, coalesce(p_days, s.duration_days) into who, d
    from (select auth_id as id_ from public.profiles where public_id = p_public_id) p, public.store_items s where s.id = p_item;
  if d is null then raise exception 'No such item' using errcode = 'P0001', hint = 'not_found'; end if;
  if who is null then raise exception 'No such member' using errcode = 'P0001', hint = 'not_found'; end if;
  if d not between 1 and 3650 then raise exception 'Bad days' using errcode = 'P0001', hint = 'bad_days'; end if;
  ends := public.store_add_days(who, p_item, d);
  insert into public.store_purchases(auth_id, item_id, price, days, source) values (who, p_item, 0, d, 'admin');
  perform public.admin_log(me, 'store_give', who, jsonb_build_object('item', p_item, 'days', d));
  return ends;
end;
$$;
revoke all on function public.admin_give_store_item(integer, bigint, integer) from public, anon;
grant execute on function public.admin_give_store_item(integer, bigint, integer) to authenticated;

commit;

notify pgrst, 'reload schema';
