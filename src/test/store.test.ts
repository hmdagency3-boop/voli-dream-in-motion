// @vitest-environment node
import { readFileSync } from 'node:fs';
import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { supabaseLike, addUser, asUser } from './supabase-like';
import { daysLeft } from '@/lib/store';

// supabase/023_store.sql is the same file as the management panel's sql/023_store.sql.
const files = ['sql/voli-starter.sql', 'supabase/001_levels.sql', 'supabase/002_special_id.sql', 'supabase/003_vip.sql',
  'supabase/004_rooms.sql', 'supabase/005_room_coins.sql', 'supabase/006_room_gifts.sql', 'supabase/007_room_ranking.sql',
  'supabase/008_agencies.sql', 'supabase/009_admin.sql', 'supabase/023_store.sql'].map((f) => readFileSync(f, 'utf8'));
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ADMIN = uuid(1), BUYER = uuid(2), OTHER = uuid(3);
const ART = 'https://res.cloudinary.com/zsxxjkqg/image/upload/v1700000000/voli/store/ghost-cemetery.png';
const VIDEO = 'https://res.cloudinary.com/zsxxjkqg/video/upload/v1700000000/voli/store-videos/halloween-rush.mp4';
const DAY = 86_400_000;

const one = async <T,>(db: PGlite, who: string, sql: string, params: unknown[] = []) =>
  (await asUser(db, who, () => db.query<{ r: T }>(sql, params))).rows[0]?.r as T;
const hintOf = async (p: Promise<unknown>) => { try { await p; return 'ok'; } catch (e) { return (e as { hint?: string }).hint ?? String(e); } };
const pid = async (db: PGlite, who: string) =>
  (await db.query<{ p: number }>('select public_id as p from public.profiles where auth_id = $1', [who])).rows[0]!.p;
const coins = async (db: PGlite, who: string) =>
  Number((await db.query<{ c: string }>('select coins::text as c from public.profiles where auth_id = $1', [who])).rows[0]!.c);
const create = (db: PGlite, kind: string, name: string, price: number, days: number, video: string | null = null) =>
  one<string>(db, ADMIN, "select public.admin_create_store_item($1, 'simple', $2, $3, $4, null, $5, $6) as r", [kind, name, price, days, ART, video]);
/** The app's backpack read: own rows that have not ended. */
const backpack = (db: PGlite, who: string) =>
  asUser(db, who, () => db.query<{ item_id: string; kind: string; expires_at: Date; equipped: boolean }>(
    'select item_id, kind, expires_at, equipped from public.member_items where auth_id = $1 and expires_at > now()', [who])).then((r) => r.rows);
/** The app's "what others wear" read. */
const worn = (db: PGlite, who: string, of: string) =>
  asUser(db, who, () => db.query<{ item_id: string; kind: string }>(
    'select item_id, kind from public.member_items where auth_id = $1 and equipped and expires_at > now()', [of])).then((r) => r.rows);
const buy = (db: PGlite, who: string, item: string) => one(db, who, 'select public.store_buy($1) as r', [item]);
const equip = (db: PGlite, who: string, item: string, on: boolean) => one(db, who, 'select public.store_equip($1, $2) as r', [item, on]);

describe('store and backpack as the app uses them', () => {
  let db: PGlite;
  let ghost: string, goose: string, rush: string;
  beforeAll(async () => {
    db = await supabaseLike();
    await db.exec('alter table auth.users add column email text; alter table auth.users add column banned_until timestamptz;');
    for (const f of files) await db.exec(f);
    await db.exec(files.at(-1)!); // safe to run again
    for (let i = 1; i <= 3; i++) await addUser(db, uuid(i), `عضو ${i}`);
    await db.query("select public.admin_set_role($1, 'admin')", [await pid(db, ADMIN)]);
    await db.query('select public.admin_add_coins($1, 100000)', [await pid(db, BUYER)]);
    ghost = await create(db, 'frame', 'Ghost Cemetery', 15999, 7);
    goose = await create(db, 'frame', 'Cool Goose', 20000, 30);
    rush = await create(db, 'ride', 'Halloween Rush', 89999, 7, VIDEO);
  }, 30000);
  afterAll(async () => { await db.close(); });

  it('members see the items on sale with style, days and a UUID id', async () => {
    const r = await asUser(db, OTHER, () => db.query<{ id: string; kind: string; style: string; days: number }>(
      'select id, kind, style, days from public.store_items where active order by sort, created_at'));
    expect(r.rows.map((x) => x.kind).sort()).toEqual(['frame', 'frame', 'ride']);
    expect(r.rows[0]).toMatchObject({ style: 'simple', days: 7 });
    expect(r.rows[0]!.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('buying takes the price in coins and lasts the item\'s days; buying again adds the days', async () => {
    await buy(db, BUYER, ghost);
    expect(await coins(db, BUYER)).toBe(100000 - 15999);
    expect(Math.round(((await backpack(db, BUYER))[0]!.expires_at.getTime() - Date.now()) / DAY)).toBe(7);
    await buy(db, BUYER, ghost);
    expect(await coins(db, BUYER)).toBe(100000 - 2 * 15999);
    expect(Math.round(((await backpack(db, BUYER))[0]!.expires_at.getTime() - Date.now()) / DAY)).toBe(14);
  });

  it('not enough coins: nothing is taken and nothing is added', async () => {
    const before = await coins(db, BUYER);
    expect(await hintOf(buy(db, BUYER, rush))).toBe('not_enough_coins');
    expect(await coins(db, BUYER)).toBe(before);
    expect((await backpack(db, BUYER)).some((r) => r.item_id === rush)).toBe(false);
  });

  it('one frame worn at a time, and others see the worn one', async () => {
    await buy(db, BUYER, goose);
    expect(await hintOf(equip(db, BUYER, ghost, true))).toBe('ok');
    expect(await hintOf(equip(db, BUYER, goose, true))).toBe('ok');
    const bag = await backpack(db, BUYER);
    expect(bag.find((r) => r.item_id === goose)?.equipped).toBe(true);
    expect(bag.find((r) => r.item_id === ghost)?.equipped).toBe(false);
    expect(await worn(db, OTHER, BUYER)).toEqual([{ item_id: goose, kind: 'frame' }]);
    await equip(db, BUYER, goose, false);
    expect(await worn(db, OTHER, BUYER)).toEqual([]);
  });

  it('members wear only what they own, and cannot read others\' unworn items or change prices', async () => {
    expect(await hintOf(equip(db, OTHER, ghost, true))).toBe('not_owned');
    expect((await backpack(db, OTHER)).length).toBe(0);
    const peek = await asUser(db, OTHER, () => db.query('select * from public.member_items where auth_id = $1 and not equipped', [BUYER]));
    expect(peek.rows).toHaveLength(0);
    await expect(asUser(db, BUYER, () => db.query('update public.store_items set price = 1'))).rejects.toThrow();
  });

  it('hidden items cannot be bought', async () => {
    await one(db, ADMIN, "select public.admin_update_store_item($1, 'Ghost Cemetery', 'simple', 15999, 7, null, false) as r", [ghost]);
    expect(await hintOf(buy(db, BUYER, ghost))).toBe('not_for_sale');
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
