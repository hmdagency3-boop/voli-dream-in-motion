// @vitest-environment node
import { readFileSync } from 'node:fs';
import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { supabaseLike, addUser, asUser } from './supabase-like';
import { daysLeft } from '@/lib/store';

const files = ['sql/voli-starter.sql', 'supabase/001_levels.sql', 'supabase/002_special_id.sql', 'supabase/003_vip.sql',
  'supabase/004_rooms.sql', 'supabase/005_room_coins.sql', 'supabase/006_room_gifts.sql', 'supabase/007_room_ranking.sql',
  'supabase/008_agencies.sql', 'supabase/009_admin.sql', 'supabase/023_store.sql'].map((f) => readFileSync(f, 'utf8'));
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ADMIN = uuid(1), BUYER = uuid(2), OTHER = uuid(3);
const ART = 'https://res.cloudinary.com/zsxxjkqg/image/upload/v1700000000/voli/store/ghost-cemetery.png';
const ART2 = 'https://res.cloudinary.com/zsxxjkqg/image/upload/v1700000000/voli/store/cool-goose.png';
const VIDEO = 'https://res.cloudinary.com/zsxxjkqg/video/upload/v1700000000/voli/store/halloween-rush.mp4';
const DAY = 86_400_000;

const one = async <T,>(db: PGlite, who: string, sql: string, params: unknown[] = []) =>
  (await asUser(db, who, () => db.query<{ r: T }>(sql, params))).rows[0]?.r as T;
const hintOf = async (p: Promise<unknown>) => { try { await p; return 'ok'; } catch (e) { return (e as { hint?: string }).hint ?? String(e); } };
const pid = async (db: PGlite, who: string) =>
  (await db.query<{ p: number }>('select public_id as p from public.profiles where auth_id = $1', [who])).rows[0]!.p;
const coins = async (db: PGlite, who: string) =>
  Number((await db.query<{ c: string }>('select coins::text as c from public.profiles where auth_id = $1', [who])).rows[0]!.c);
const create = (db: PGlite, kind: string, name: string, price: number, days: number, art = ART, video: string | null = null) =>
  one<number>(db, ADMIN, 'select public.admin_create_store_item($1, $2, $3, $4, $5, null, $6, $7)::int as r', [kind, 'simple', name, price, days, art, video]);
const backpack = (db: PGlite, who: string) =>
  asUser(db, who, () => db.query<{ item_id: number; kind: string; expires_at: Date; equipped: boolean }>(
    'select item_id::int as item_id, kind, expires_at, equipped from public.my_backpack()')).then((r) => r.rows);
const worn = (db: PGlite, who: string, ids: string[]) =>
  asUser(db, who, () => db.query<{ auth_id: string; kind: string; item_id: number }>(
    'select auth_id, kind, item_id::int as item_id from public.worn_items($1::uuid[])', [`{${ids.join(',')}}`])).then((r) => r.rows);
const buy = (db: PGlite, who: string, item: number) => one(db, who, 'select public.buy_store_item($1) as r', [item]);

describe('store', () => {
  let db: PGlite;
  let ghost: number, goose: number, rush: number;
  beforeAll(async () => {
    db = await supabaseLike();
    await db.exec('alter table auth.users add column email text; alter table auth.users add column banned_until timestamptz;');
    for (const f of files) await db.exec(f);
    await db.exec(files.at(-1)!); // safe to run again
    for (let i = 1; i <= 3; i++) await addUser(db, uuid(i), `عضو ${i}`);
    await db.query("select public.admin_set_role($1, 'admin')", [await pid(db, ADMIN)]);
    await db.query('select public.admin_add_coins($1, 100000)', [await pid(db, BUYER)]);
  }, 30000);
  afterAll(async () => { await db.close(); });

  it('only management adds items, and only with Voli Cloudinary pictures and videos', async () => {
    expect(await hintOf(one(db, BUYER, "select public.admin_create_store_item('headwear', 'simple', 'x', 10, 7, null, $1) as r", [ART]))).toBe('not_admin');
    expect(await hintOf(create(db, 'headwear', 'x', 10, 7, 'https://evil.example.com/x.png'))).toBe('bad_art');
    expect(await hintOf(create(db, 'ride', 'x', 10, 7, ART, 'https://evil.example.com/x.mp4'))).toBe('bad_video');
    expect(await hintOf(create(db, 'hat', 'x', 10, 7))).toBe('bad_kind');
    expect(await hintOf(create(db, 'headwear', 'x', 0, 7))).toBe('bad_price');
    ghost = await create(db, 'headwear', 'Ghost Cemetery', 15999, 7);
    goose = await create(db, 'headwear', 'Cool Goose', 20000, 30, ART2);
    rush = await create(db, 'ride', 'Halloween Rush', 89999, 7, ART, VIDEO);
    const shelf = await asUser(db, OTHER, () => db.query<{ name: string }>('select name from public.store_items order by id'));
    expect(shelf.rows.map((r) => r.name)).toEqual(['Ghost Cemetery', 'Cool Goose', 'Halloween Rush']);
  });

  it('buying takes the price in coins, lasts the item\'s days, and puts it on', async () => {
    await buy(db, BUYER, ghost);
    expect(await coins(db, BUYER)).toBe(100000 - 15999);
    const [row] = await backpack(db, BUYER);
    expect(row).toMatchObject({ item_id: ghost, kind: 'headwear', equipped: true });
    expect(Math.round((row!.expires_at.getTime() - Date.now()) / DAY)).toBe(7);
  });

  it('buying the same item again adds its days after the current end', async () => {
    await buy(db, BUYER, ghost);
    expect(await coins(db, BUYER)).toBe(100000 - 2 * 15999);
    const [row] = await backpack(db, BUYER);
    expect(Math.round((row!.expires_at.getTime() - Date.now()) / DAY)).toBe(14);
  });

  it('not enough coins: nothing is taken and nothing is added', async () => {
    const before = await coins(db, BUYER);
    expect(await hintOf(buy(db, BUYER, rush))).toBe('not_enough_coins');
    expect(await coins(db, BUYER)).toBe(before);
    expect((await backpack(db, BUYER)).some((r) => r.item_id === rush)).toBe(false);
  });

  it('one frame worn at a time: a new one takes the old one off', async () => {
    await buy(db, BUYER, goose);
    const bag = await backpack(db, BUYER);
    expect(bag.find((r) => r.item_id === goose)?.equipped).toBe(true);
    expect(bag.find((r) => r.item_id === ghost)?.equipped).toBe(false);
    expect(await worn(db, OTHER, [BUYER])).toEqual([{ auth_id: BUYER, kind: 'headwear', item_id: goose }]);
  });

  it('members wear or take off only what they own', async () => {
    expect(await hintOf(one(db, OTHER, 'select public.equip_store_item($1, true) as r', [ghost]))).toBe('not_owned');
    expect(await hintOf(one(db, BUYER, 'select public.equip_store_item($1, true) as r', [ghost]))).toBe('ok');
    expect(await worn(db, OTHER, [BUYER])).toEqual([{ auth_id: BUYER, kind: 'headwear', item_id: ghost }]);
    await one(db, BUYER, 'select public.equip_store_item($1, false) as r', [ghost]);
    expect(await worn(db, OTHER, [BUYER])).toEqual([]);
  });

  it('members cannot read ownership, give themselves items or change prices directly', async () => {
    expect(await hintOf(one(db, BUYER, 'select count(*) as r from public.member_items'))).not.toBe('ok');
    expect(await hintOf(one(db, BUYER, 'select count(*) as r from public.store_purchases'))).not.toBe('ok');
    await expect(asUser(db, BUYER, () => db.query('update public.store_items set price = 1'))).rejects.toThrow();
    expect(await hintOf(one(db, BUYER, 'select public.admin_give_store_item($1, $2, 30) as r', [await pid(db, BUYER), rush]))).toBe('not_admin');
  });

  it('hidden items leave the shelf and cannot be bought, but owners keep them', async () => {
    await one(db, ADMIN, "select public.admin_update_store_item($1, 'simple', 'Ghost Cemetery', 15999, 7, null, false) as r", [ghost]);
    const shelf = await asUser(db, OTHER, () => db.query<{ id: number }>('select id::int as id from public.store_items'));
    expect(shelf.rows.map((r) => r.id)).not.toContain(ghost);
    expect(await hintOf(buy(db, BUYER, ghost))).toBe('not_for_sale');
    expect((await backpack(db, BUYER)).some((r) => r.item_id === ghost)).toBe(true);
  });

  it('management can give an item for free, and cannot delete an item someone still owns', async () => {
    const before = await coins(db, OTHER);
    await one(db, ADMIN, 'select public.admin_give_store_item($1, $2, 3) as r', [await pid(db, OTHER), rush]);
    expect(await coins(db, OTHER)).toBe(before);
    expect(await worn(db, BUYER, [OTHER])).toEqual([{ auth_id: OTHER, kind: 'ride', item_id: rush }]);
    expect(await hintOf(one(db, ADMIN, 'select public.admin_delete_store_item($1) as r', [rush]))).toBe('in_use');
    const loose = await create(db, 'ride', 'Lunar rover', 200000, 7);
    expect(await hintOf(one(db, ADMIN, 'select public.admin_delete_store_item($1) as r', [loose]))).toBe('ok');
  });

  it('the panel list counts sales and current owners', async () => {
    const r = await asUser(db, ADMIN, () => db.query<{ id: number; owners: number; sold_count: number; sold_value: number }>(
      'select id::int as id, owners::int, sold_count::int, sold_value::int from public.admin_store_items()'));
    expect(r.rows.find((x) => x.id === ghost)).toMatchObject({ owners: 1, sold_count: 2, sold_value: 2 * 15999 });
    expect(r.rows.find((x) => x.id === rush)).toMatchObject({ owners: 1, sold_count: 0, sold_value: 0 });
  });
});

describe('days left shown in the backpack', () => {
  const now = Date.UTC(2026, 10, 10, 12);
  it('rounds up part of a day, and never shows less than one day', () => {
    expect(daysLeft(new Date(now + 13 * DAY).toISOString(), now)).toBe(13);
    expect(daysLeft(new Date(now + 12.2 * DAY).toISOString(), now)).toBe(13);
    expect(daysLeft(new Date(now + 60_000).toISOString(), now)).toBe(1);
  });
});
