// @vitest-environment node
import { readFileSync } from 'node:fs';
import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { supabaseLike, addUser, asUser } from './supabase-like';

const files = ['sql/voli-starter.sql', 'supabase/001_levels.sql', 'supabase/002_special_id.sql', 'supabase/003_vip.sql', 'supabase/004_rooms.sql', 'supabase/005_room_coins.sql']
  .map((f) => readFileSync(f, 'utf8'));
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const OWNER = uuid(1), GUEST = uuid(2), OUTSIDER = uuid(3);

async function setup() {
  const db = await supabaseLike();
  for (const f of files) await db.exec(f);
  for (let i = 1; i <= 3; i++) await addUser(db, uuid(i), `عضو ${i}`);
  return db;
}
const one = async <T,>(db: PGlite, who: string, sql: string, params: unknown[] = []) =>
  (await asUser(db, who, () => db.query<{ r: T }>(sql, params))).rows[0]!.r;
const publicId = async (db: PGlite, who: string) =>
  (await db.query<{ public_id: number }>('select public_id from public.profiles where auth_id = $1', [who])).rows[0]!.public_id;
const give = async (db: PGlite, who: string, amount: number) =>
  db.query('select public.admin_add_coins($1, $2)', [await publicId(db, who), amount]);
const balance = async (db: PGlite, who: string) =>
  (await db.query<{ coins: number }>('select coins::int as coins from public.profiles where auth_id = $1', [who])).rows[0]!.coins;

describe('coins thrown in a room', () => {
  let db: PGlite;
  let room: string;
  beforeAll(async () => {
    db = await setup();
    room = await one<string>(db, OWNER, "select public.start_party('روم الحفلة', null, 'audio', 10, 'default', 'أهلاً', null) as r");
    await one(db, GUEST, 'select public.enter_room($1) as r', [room]);
    await give(db, GUEST, 1000);
  }, 30000);
  afterAll(async () => { await db.close(); });

  it('moves coins from the member balance into the room total', async () => {
    expect(await one<number>(db, GUEST, 'select public.throw_room_coins($1, 100)::int as r', [room])).toBe(100);
    expect(await balance(db, GUEST)).toBe(900);
    expect(await one<number>(db, GUEST, 'select public.throw_room_coins($1, 50)::int as r', [room])).toBe(150);
    expect(await balance(db, GUEST)).toBe(850);
    expect(await one<number>(db, OWNER, 'select public.room_coins_total($1)::int as r', [room])).toBe(150);
  });

  it('refuses a throw bigger than the balance and keeps the coins', async () => {
    await expect(one(db, GUEST, 'select public.throw_room_coins($1, 100000)::int as r', [room])).rejects.toThrow(/Not enough coins/);
    expect(await balance(db, GUEST)).toBe(850);
    expect(await one<number>(db, GUEST, 'select public.room_coins_total($1)::int as r', [room])).toBe(150);
  });

  it('nobody outside the room can throw coins or read the total', async () => {
    await give(db, OUTSIDER, 500);
    await expect(one(db, OUTSIDER, 'select public.throw_room_coins($1, 10)::int as r', [room])).rejects.toThrow(/Not inside the room/);
    expect(await one<number | null>(db, OUTSIDER, 'select public.room_coins_total($1)::int as r', [room])).toBe(null);
    expect(await balance(db, OUTSIDER)).toBe(500);
  });

  it('an amount must be at least 1 and no more than the cap', async () => {
    await expect(one(db, GUEST, 'select public.throw_room_coins($1, 0)::int as r', [room])).rejects.toThrow(/at least 1/);
    await expect(one(db, GUEST, 'select public.throw_room_coins($1, 1000001)::int as r', [room])).rejects.toThrow(/Too many coins/);
    expect(await one<number>(db, GUEST, 'select public.room_coins_total($1)::int as r', [room])).toBe(150);
  });

  it('members can never read or write the coins table directly', async () => {
    await expect(asUser(db, GUEST, () => db.query('select * from public.room_coins'))).rejects.toThrow();
    await expect(asUser(db, GUEST, () =>
      db.query('insert into public.room_coins(room_id, sender_id, amount) values ($1, $2, 5)', [room, GUEST]))).rejects.toThrow();
  });

  it('runs again without errors and keeps the throws', async () => {
    await db.exec(files[5]!);
    const { rows } = await db.query<{ n: number }>('select count(*)::int as n from public.room_coins');
    expect(rows[0]!.n).toBe(2);
  });
});
