// @vitest-environment node
import { readFileSync } from 'node:fs';
import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { supabaseLike, addUser, asUser } from './supabase-like';

const files = ['sql/voli-starter.sql', 'supabase/001_levels.sql', 'supabase/002_special_id.sql', 'supabase/003_vip.sql', 'supabase/004_rooms.sql', 'supabase/005_room_coins.sql']
  .map((f) => readFileSync(f, 'utf8'));
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const OWNER = uuid(1), GUEST = uuid(2), OTHER = uuid(3);

async function setup() {
  const db = await supabaseLike();
  for (const f of files) await db.exec(f);
  for (let i = 1; i <= 3; i++) await addUser(db, uuid(i), `عضو ${i}`);
  return db;
}
const one = async <T,>(db: PGlite, who: string, sql: string, params: unknown[] = []) =>
  (await asUser(db, who, () => db.query<{ r: T }>(sql, params))).rows[0]!.r;
const start = (db: PGlite, password: string | null = null, seats = 10) =>
  one<string>(db, OWNER, "select public.start_party('روم الحفلة', null, 'audio', $1, 'default', 'أهلاً', $2) as r", [seats, password]);

describe('party rooms', () => {
  let db: PGlite;
  let room: string;
  beforeAll(async () => { db = await setup(); room = await start(db); }, 30000);
  afterAll(async () => { await db.close(); });

  it('runs again without errors and keeps the room', async () => {
    await db.exec(files[4]!);
    const { rows } = await db.query<{ n: number }>('select count(*)::int as n from public.rooms');
    expect(rows[0]!.n).toBe(1);
  });

  it('gives each member one room, reused on every start', async () => {
    expect(await start(db)).toBe(room);
  });

  it('only allows 5, 10, 15 or 20 seats', async () => {
    await expect(start(db, null, 12)).rejects.toThrow();
  });

  it('members cannot change room tables directly', async () => {
    await expect(asUser(db, GUEST, () => db.query("update public.rooms set name = 'x'"))).rejects.toThrow();
    await expect(asUser(db, GUEST, () => db.query('insert into public.room_seats values ($1, 1, $2)', [room, GUEST]))).rejects.toThrow();
    await expect(asUser(db, GUEST, () => db.query('select * from public.room_secrets'))).rejects.toThrow();
  });

  it('a locked room needs the right password; a wrong one is refused', async () => {
    await start(db, '1234');
    expect(await one(db, GUEST, 'select public.enter_room($1) as r', [room])).toBe('wrong_password');
    expect(await one(db, GUEST, "select public.enter_room($1, '9999') as r", [room])).toBe('wrong_password');
    expect(await one(db, GUEST, "select public.enter_room($1, '1234') as r", [room])).toBe('ok');
    // Already inside: the heartbeat needs no password.
    expect(await one(db, GUEST, 'select public.enter_room($1) as r', [room])).toBe('ok');
  });

  it('a password must be 4 to 8 digits', async () => {
    await expect(start(db, '12')).rejects.toThrow();
    await expect(start(db, 'abcd')).rejects.toThrow();
  });

  it('removing the lock lets anyone in', async () => {
    await start(db, '');
    expect(await one(db, OTHER, 'select public.enter_room($1) as r', [room])).toBe('ok');
  });

  it('one member per seat, one seat per member, only inside the room', async () => {
    expect(await one(db, GUEST, 'select public.take_seat($1, 3) as r', [room])).toBe('ok');
    expect(await one(db, OTHER, 'select public.take_seat($1, 3) as r', [room])).toBe('taken');
    expect(await one(db, OTHER, 'select public.take_seat($1, 11) as r', [room])).toBe('no_seat');
    expect(await one(db, GUEST, 'select public.take_seat($1, 5) as r', [room])).toBe('ok');
    const { rows } = await db.query<{ seat_no: number }>('select seat_no from public.room_seats where auth_id = $1', [GUEST]);
    expect(rows.map((r) => r.seat_no)).toEqual([5]);
  });

  it('fewer seats frees the seats that no longer exist', async () => {
    expect(await one(db, OTHER, 'select public.take_seat($1, 8) as r', [room])).toBe('ok');
    await start(db, null, 5);
    const { rows } = await db.query<{ seat_no: number }>('select seat_no from public.room_seats order by seat_no');
    expect(rows.map((r) => r.seat_no)).toEqual([5]);
    await start(db, null, 10);
  });

  it('only members inside the room can chat and read the chat', async () => {
    expect(await one(db, GUEST, "select public.send_room_message($1, 'سلام') as r", [room])).toBe('ok');
    await one(db, OTHER, 'select public.leave_room($1) as r', [room]);
    expect(await one(db, OTHER, "select public.send_room_message($1, 'hi') as r", [room])).toBe('not_in_room');
    const seen = await asUser(db, OTHER, () => db.query('select * from public.room_messages'));
    expect(seen.rows).toHaveLength(0);
    const inside = await asUser(db, GUEST, () => db.query<{ body: string }>('select body from public.room_messages'));
    expect(inside.rows.map((r) => r.body)).toEqual(['سلام']);
  });

  it('the owner can remove a member for 10 minutes; members cannot remove each other', async () => {
    await one(db, OTHER, 'select public.enter_room($1) as r', [room]);
    expect(await one(db, GUEST, 'select public.kick_from_room($1, $2) as r', [room, OTHER])).toBe('not_allowed');
    expect(await one(db, OWNER, 'select public.kick_from_room($1, $2) as r', [room, GUEST])).toBe('ok');
    expect(await one(db, GUEST, 'select public.enter_room($1) as r', [room])).toBe('kicked');
    const { rows } = await db.query<{ mins: number }>(
      "select round(extract(epoch from until - now()) / 60)::int as mins from public.room_kicks where auth_id = $1", [GUEST]);
    expect(rows[0]!.mins).toBe(10);
  });

  it('nobody can remove the owner', async () => {
    await db.query("select public.admin_set_role((select public_id from public.profiles where auth_id = $1), 'moderator')", [OTHER]);
    expect(await one(db, OTHER, 'select public.kick_from_room($1, $2) as r', [room, OWNER])).toBe('not_allowed');
  });

  it('ending the party empties the room and hides it', async () => {
    await one(db, OWNER, 'select public.end_party() as r');
    expect(await one(db, OTHER, 'select public.enter_room($1) as r', [room])).toBe('not_live');
    const { rows } = await db.query<{ n: number }>('select count(*)::int as n from public.room_members');
    expect(rows[0]!.n).toBe(0);
    const visible = await asUser(db, OTHER, () => db.query('select * from public.rooms'));
    expect(visible.rows).toHaveLength(0);
  });
});
