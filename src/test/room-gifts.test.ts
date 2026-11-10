// @vitest-environment node
import { readFileSync } from 'node:fs';
import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { supabaseLike, addUser, asUser } from './supabase-like';

const files = ['sql/voli-starter.sql', 'supabase/001_levels.sql', 'supabase/002_special_id.sql', 'supabase/003_vip.sql',
  'supabase/004_rooms.sql', 'supabase/005_room_coins.sql', 'supabase/006_room_gifts.sql']
  .map((f) => readFileSync(f, 'utf8'));
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const OWNER = uuid(1), SENDER = uuid(2), FAN = uuid(3), OUTSIDER = uuid(4);

async function setup() {
  const db = await supabaseLike();
  for (const f of files) await db.exec(f);
  for (let i = 1; i <= 4; i++) await addUser(db, uuid(i), `عضو ${i}`);
  return db;
}
const one = async <T,>(db: PGlite, who: string, sql: string, params: unknown[] = []) =>
  (await asUser(db, who, () => db.query<{ r: T }>(sql, params))).rows[0]!.r;
const row = async (db: PGlite, who: string) =>
  (await db.query<{ coins: number; charisma: number; wealth: number; public_id: number }>(
    'select coins::int as coins, charisma_points::int as charisma, wealth_points::int as wealth, public_id from public.profiles where auth_id = $1', [who])).rows[0]!;
const give = async (db: PGlite, who: string, amount: number) =>
  db.query('select public.admin_add_coins($1, $2)', [(await row(db, who)).public_id, amount]);
const send = (db: PGlite, who: string, room: string, gift: string, qty: number, to: string[]) =>
  one<number>(db, who, 'select public.send_room_gift($1, $2, $3, $4::uuid[])::int as r', [room, gift, qty, `{${to.join(',')}}`]);

describe('gifts sent inside a room', () => {
  let db: PGlite;
  let room: string;
  beforeAll(async () => {
    db = await setup();
    room = await one<string>(db, OWNER, "select public.start_party('روم الحفلة', null, 'audio', 10, 'default', 'أهلاً', null) as r");
    await one(db, SENDER, 'select public.enter_room($1) as r', [room]);
    await one(db, FAN, 'select public.enter_room($1) as r', [room]);
    await give(db, SENDER, 1000);
  }, 30000);
  afterAll(async () => { await db.close(); });

  it('a bouquet (99) x2 to one person costs 198 and gives them 198 charisma', async () => {
    expect(await send(db, SENDER, room, 'bouquet', 2, [OWNER])).toBe(198);
    expect((await row(db, SENDER)).coins).toBe(802);
    expect((await row(db, SENDER)).wealth).toBe(198);
    expect((await row(db, OWNER)).charisma).toBe(198);
  });

  it('a gift to two people costs price x count x 2 and each gets the full value', async () => {
    expect(await send(db, SENDER, room, 'star', 3, [OWNER, FAN])).toBe(258);
    expect((await row(db, SENDER)).coins).toBe(742);
    expect((await row(db, OWNER)).charisma).toBe(228);
    expect((await row(db, FAN)).charisma).toBe(30);
  });

  it('shows what each person received to people inside, and nothing to outsiders', async () => {
    const got = await asUser(db, FAN, () => db.query<{ auth_id: string; total: number }>(
      'select auth_id, total::int as total from public.room_gifts_received($1) order by total desc', [room]));
    expect(got.rows).toEqual([{ auth_id: OWNER, total: 228 }, { auth_id: FAN, total: 30 }]);
    const out = await asUser(db, OUTSIDER, () => db.query('select * from public.room_gifts_received($1)', [room]));
    expect(out.rows).toHaveLength(0);
  });

  it('refuses a gift bigger than the balance and takes nothing', async () => {
    await expect(send(db, SENDER, room, 'diamond', 1, [OWNER])).rejects.toThrow(/Not enough coins/);
    expect((await row(db, SENDER)).coins).toBe(742);
    expect((await row(db, OWNER)).charisma).toBe(228);
  });

  it('refuses sending to yourself, to nobody, or to someone not in the room', async () => {
    await expect(send(db, SENDER, room, 'rose', 1, [SENDER])).rejects.toThrow(/yourself/);
    await expect(send(db, SENDER, room, 'rose', 1, [])).rejects.toThrow(/Pick who/);
    await expect(send(db, SENDER, room, 'rose', 1, [OUTSIDER])).rejects.toThrow(/left the room/);
    expect((await row(db, SENDER)).coins).toBe(742);
  });

  it('refuses unknown or hidden gifts and bad counts', async () => {
    await expect(send(db, SENDER, room, 'nope', 1, [OWNER])).rejects.toThrow(/No such gift/);
    await db.query("update public.room_gift_catalog set active = false where key = 'rose'");
    await expect(send(db, SENDER, room, 'rose', 1, [OWNER])).rejects.toThrow(/No such gift/);
    await expect(send(db, SENDER, room, 'star', 0, [OWNER])).rejects.toThrow(/Bad gift count/);
    await expect(send(db, SENDER, room, 'star', 10000, [OWNER])).rejects.toThrow(/Bad gift count/);
  });

  it('people outside the room cannot send', async () => {
    await give(db, OUTSIDER, 500);
    await expect(send(db, OUTSIDER, room, 'star', 1, [OWNER])).rejects.toThrow(/Not inside the room/);
    expect((await row(db, OUTSIDER)).coins).toBe(500);
  });

  it('members read the gift list but cannot change prices', async () => {
    const list = await asUser(db, FAN, () => db.query<{ key: string }>('select key from public.room_gift_catalog'));
    expect(list.rows.length).toBe(8);
    await expect(asUser(db, FAN, () => db.query("update public.room_gift_catalog set price = 1 where key = 'dragon'"))).rejects.toThrow();
  });

  it('runs again without errors and keeps admin price changes and gifts', async () => {
    await db.query("update public.room_gift_catalog set price = 77 where key = 'bouquet'");
    await db.exec(files[6]!);
    const p = await db.query<{ price: number }>("select price::int as price from public.room_gift_catalog where key = 'bouquet'");
    expect(p.rows[0]!.price).toBe(77);
    const n = await db.query<{ n: number }>('select count(*)::int as n from public.room_coins');
    expect(n.rows[0]!.n).toBe(3);
  });
});
