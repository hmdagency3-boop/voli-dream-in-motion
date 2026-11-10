// @vitest-environment node
import { readFileSync } from 'node:fs';
import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { supabaseLike, addUser, asUser } from './supabase-like';

const files = ['sql/voli-starter.sql', 'supabase/001_levels.sql', 'supabase/002_special_id.sql', 'supabase/003_vip.sql',
  'supabase/004_rooms.sql', 'supabase/005_room_coins.sql', 'supabase/006_room_gifts.sql', 'supabase/007_room_ranking.sql']
  .map((f) => readFileSync(f, 'utf8'));
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const OWNER = uuid(1), A = uuid(2), B = uuid(3), OUTSIDER = uuid(4);

const one = async <T,>(db: PGlite, who: string, sql: string, params: unknown[] = []) =>
  (await asUser(db, who, () => db.query<{ r: T }>(sql, params))).rows[0]!.r;
const board = (db: PGlite, who: string, room: string, b: string, p: string) =>
  asUser(db, who, () => db.query<{ auth_id: string; score: number }>(
    'select auth_id, score::int as score from public.room_ranking($1, $2, $3)', [room, b, p])).then((r) => r.rows);

describe('room ranking', () => {
  let db: PGlite;
  let room: string;
  beforeAll(async () => {
    db = await supabaseLike();
    for (const f of files) await db.exec(f);
    for (let i = 1; i <= 4; i++) await addUser(db, uuid(i), `عضو ${i}`);
    room = await one<string>(db, OWNER, "select public.start_party('روم', null, 'audio', 10, 'default', '', null) as r");
    await one(db, A, 'select public.enter_room($1) as r', [room]);
    await one(db, B, 'select public.enter_room($1) as r', [room]);
    for (const who of [A, B]) {
      const pid = (await db.query<{ p: number }>('select public_id as p from public.profiles where auth_id = $1', [who])).rows[0]!.p;
      await db.query('select public.admin_add_coins($1, 100000)', [pid]);
    }
    // Today: A sends a bouquet (99) to the owner and throws 50 coins; B sends 2 stars (20) to A.
    await one(db, A, "select public.send_room_gift($1, 'bouquet', 1, $2::uuid[]) as r", [room, `{${OWNER}}`]);
    await one(db, A, 'select public.throw_room_coins($1, 50) as r', [room]);
    await one(db, B, "select public.send_room_gift($1, 'star', 2, $2::uuid[]) as r", [room, `{${A}}`]);
    // Old gift from 40 days ago: B gave the owner 1000. It counts in no period.
    await db.query("insert into public.room_coins(room_id, sender_id, amount, recipient_id, gift_key, quantity, created_at) values ($1, $2, 1000, $3, 'rose', 1000, now() - interval '40 days')", [room, B, OWNER]);
  }, 30000);
  afterAll(async () => { await db.close(); });

  it('support board ranks senders by coins thrown plus gifts sent', async () => {
    expect(await board(db, OWNER, room, 'support', 'day')).toEqual([{ auth_id: A, score: 149 }, { auth_id: B, score: 20 }]);
  });

  it('received board ranks people by gift value received', async () => {
    expect(await board(db, OWNER, room, 'received', 'day')).toEqual([{ auth_id: OWNER, score: 99 }, { auth_id: A, score: 20 }]);
  });

  it('a gift older than a month counts in no period', async () => {
    expect(await board(db, OWNER, room, 'support', 'month')).toEqual([{ auth_id: A, score: 149 }, { auth_id: B, score: 20 }]);
  });

  it('shows nothing to people outside the room or for unknown boards and periods', async () => {
    expect(await board(db, OUTSIDER, room, 'support', 'day')).toEqual([]);
    expect(await board(db, OWNER, room, 'nope', 'day')).toEqual([]);
    expect(await board(db, OWNER, room, 'support', 'year')).toEqual([]);
  });

  it('can be run again', async () => {
    await db.exec(files[7]!);
    expect(await board(db, OWNER, room, 'support', 'day')).toHaveLength(2);
  });
});
