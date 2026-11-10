// @vitest-environment node
import { readFileSync } from 'node:fs';
import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { supabaseLike, addUser, asUser } from './supabase-like';

const base = ['sql/voli-starter.sql', 'supabase/001_levels.sql', 'supabase/002_special_id.sql', 'supabase/003_vip.sql',
  'supabase/004_rooms.sql', 'supabase/005_room_coins.sql', 'supabase/006_room_gifts.sql', 'supabase/007_room_ranking.sql',
  'supabase/008_agencies.sql', 'supabase/009_admin.sql'].map((f) => readFileSync(f, 'utf8'));
const helperSql = readFileSync('supabase/010_admin_notices.sql', 'utf8');
const update = readFileSync('sql/014_admin_grant_notices.sql', 'utf8');
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ADMIN = uuid(1), MEMBER = uuid(2), HELPER = uuid(100);

async function setup(withHelper: boolean) {
  const db = await supabaseLike();
  await db.exec(`alter table auth.users add column email text; alter table auth.users add column banned_until timestamptz;
    alter table auth.users add column aud text; alter table auth.users add column role text;
    alter table auth.users add column updated_at timestamptz;`);
  for (const f of base) await db.exec(f);
  if (withHelper) await db.exec(helperSql);
  await db.exec(update);
  await db.exec(update); // safe to run again
  await addUser(db, ADMIN, 'مدير');
  await addUser(db, MEMBER, 'عضو');
  const pid = (await db.query<{ p: number }>('select public_id as p from public.profiles where auth_id = $1', [ADMIN])).rows[0]!.p;
  await db.query("select public.admin_set_role($1, 'admin')", [pid]);
  await db.query('update public.vip_tiers set duration_days = coalesce(duration_days, 30)');
  return db;
}
const asAdmin = (db: PGlite, sql: string, params: unknown[]) => asUser(db, ADMIN, () => db.query(sql, params));
const notices = async (db: PGlite) =>
  (await db.query<{ sender_id: string; body: string }>(
    'select sender_id, body from public.messages where recipient_id = $1 order by created_at, body', [MEMBER])).rows;

describe('management grant notices', () => {
  let db: PGlite;
  beforeAll(async () => { db = await setup(true); }, 60000);
  afterAll(async () => { await db.close(); });

  it('giving VIP5 for 15 days sends the member a Voli Helper message', async () => {
    await asAdmin(db, 'select public.admin_member_vip($1, 5, 15)', [MEMBER]);
    expect(await notices(db)).toEqual([{ sender_id: HELPER, body: 'Congratulations on your upgrade to VIP5, valid for 15 days.' }]);
  });

  it('VIP with no end date says it is permanent', async () => {
    await db.query('delete from public.messages');
    await asAdmin(db, 'select public.admin_member_vip($1, 2, null)', [MEMBER]);
    expect((await notices(db)).map((n) => n.body)).toEqual(['Congratulations on your upgrade to VIP2, valid permanently.']);
  });

  it('adding coins sends a message, removing coins sends nothing', async () => {
    await db.query('delete from public.messages');
    await asAdmin(db, 'select public.admin_member_coins($1, 5000)', [MEMBER]);
    await asAdmin(db, 'select public.admin_member_coins($1, -1000)', [MEMBER]);
    expect((await notices(db)).map((n) => n.body)).toEqual(['You have received 5000 coins from Voli management.']);
  });

  it('the member still cannot reply to Voli Helper', async () => {
    await expect(asUser(db, MEMBER, () => db.query(
      'insert into public.messages(sender_id, recipient_id, body) values ($1, $2, $3)', [MEMBER, HELPER, 'hi']))).rejects.toThrow();
  });
});

describe('management grant notices without Voli Helper', () => {
  it('the VIP grant still works and no message is written', async () => {
    const db = await setup(false);
    await asAdmin(db, 'select public.admin_member_vip($1, 5, 15)', [MEMBER]);
    expect(Number((await db.query<{ n: string }>('select count(*) as n from public.vip_grants where auth_id = $1', [MEMBER])).rows[0]!.n)).toBe(1);
    expect(await notices(db)).toEqual([]);
    await db.close();
  }, 60000);
});
