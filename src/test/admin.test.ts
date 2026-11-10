// @vitest-environment node
import { readFileSync } from 'node:fs';
import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { supabaseLike, addUser, asUser } from './supabase-like';

const files = ['sql/voli-starter.sql', 'supabase/001_levels.sql', 'supabase/002_special_id.sql', 'supabase/003_vip.sql',
  'supabase/004_rooms.sql', 'supabase/005_room_coins.sql', 'supabase/006_room_gifts.sql', 'supabase/007_room_ranking.sql',
  'supabase/008_agencies.sql', 'supabase/009_admin.sql'].map((f) => readFileSync(f, 'utf8'));
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ADMIN = uuid(1), MEMBER = uuid(2), OTHER = uuid(3), ADMIN2 = uuid(4);

const one = async <T,>(db: PGlite, who: string, sql: string, params: unknown[] = []) =>
  (await asUser(db, who, () => db.query<{ r: T }>(sql, params))).rows[0]?.r as T;
const hintOf = async (p: Promise<unknown>) => { try { await p; return 'ok'; } catch (e) { return (e as { hint?: string }).hint ?? String(e); } };
const pid = async (db: PGlite, who: string) =>
  (await db.query<{ p: number }>('select public_id as p from public.profiles where auth_id = $1', [who])).rows[0]!.p;
const coins = async (db: PGlite, who: string) =>
  Number((await db.query<{ c: string }>('select coins as c from public.profiles where auth_id = $1', [who])).rows[0]!.c);

describe('management panel', () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await supabaseLike();
    // The real sign-in system has these columns; the stand-in adds them so bans and emails can be checked.
    await db.exec('alter table auth.users add column email text; alter table auth.users add column banned_until timestamptz;');
    for (const f of files) await db.exec(f);
    await db.exec(files.at(-1)!); // the update must be safe to run again
    for (let i = 1; i <= 4; i++) await addUser(db, uuid(i), `عضو ${i}`);
    await db.query("update auth.users set email = 'member2@example.com' where id = $1", [MEMBER]);
    await db.query("select public.admin_set_role($1, 'admin')", [await pid(db, ADMIN)]);
    await db.query("select public.admin_set_role($1, 'admin')", [await pid(db, ADMIN2)]);
  }, 30000);
  afterAll(async () => { await db.close(); });

  it('only top management can use any panel function', async () => {
    expect(await hintOf(one(db, MEMBER, 'select public.admin_dashboard() as r'))).toBe('not_admin');
    expect(await hintOf(one(db, MEMBER, "select public.admin_member_coins($1, 1000) as r", [MEMBER]))).toBe('not_admin');
    expect(await hintOf(one(db, MEMBER, "select public.admin_member_ban($1) as r", [OTHER]))).toBe('not_admin');
    expect(await one<boolean>(db, MEMBER, 'select public.am_i_admin() as r')).toBe(false);
    expect(await one<boolean>(db, ADMIN, 'select public.am_i_admin() as r')).toBe(true);
  });

  it('members cannot read the log or the ban list directly', async () => {
    expect(await hintOf(one(db, ADMIN, 'select count(*) as r from public.admin_actions'))).not.toBe('ok');
    expect(await hintOf(one(db, ADMIN, 'select count(*) as r from public.member_bans'))).not.toBe('ok');
  });

  it('adding coins changes the balance and is written to the log', async () => {
    expect(Number(await one<string>(db, ADMIN, 'select public.admin_member_coins($1, 5000, $2) as r', [MEMBER, 'هدية']))).toBe(5000);
    expect(await coins(db, MEMBER)).toBe(5000);
    const log = (await db.query<{ action: string; amount: number }>(
      "select action, (details->>'amount')::int as amount from public.admin_actions where target_id = $1", [MEMBER])).rows;
    expect(log).toEqual([{ action: 'coins', amount: 5000 }]);
  });

  it('removing coins can never take the balance below zero', async () => {
    expect(await hintOf(one(db, ADMIN, 'select public.admin_member_coins($1, -6000) as r', [MEMBER]))).toBe('negative_balance');
    expect(Number(await one<string>(db, ADMIN, 'select public.admin_member_coins($1, -5000) as r', [MEMBER]))).toBe(0);
  });

  it('search finds a member by public ID, special ID, name or email', async () => {
    const id = await pid(db, MEMBER);
    const find = async (q: string) =>
      (await asUser(db, ADMIN, () => db.query<{ auth_id: string }>('select auth_id from public.admin_members($1)', [q]))).rows.map((r) => r.auth_id);
    expect(await find(String(id))).toEqual([MEMBER]);
    expect(await find('member2@')).toEqual([MEMBER]);
    await one(db, ADMIN, "select public.admin_member_special_id($1, '777') as r", [MEMBER]);
    expect(await find('777')).toEqual([MEMBER]);
    expect(await find('عضو 3')).toEqual([OTHER]);
  });

  it('a special ID must be digits and cannot clash with another member', async () => {
    expect(await hintOf(one(db, ADMIN, "select public.admin_member_special_id($1, '07') as r", [OTHER]))).toBe('bad_special_id');
    expect(await hintOf(one(db, ADMIN, "select public.admin_member_special_id($1, '777') as r", [OTHER]))).toBe('special_id_taken');
    expect(await hintOf(one(db, ADMIN, 'select public.admin_member_special_id($1, $2::text) as r', [OTHER, String(await pid(db, MEMBER))]))).toBe('special_id_taken');
    await one(db, ADMIN, "select public.admin_member_special_id($1, '') as r", [MEMBER]);
    expect((await db.query<{ s: string | null }>('select special_id as s from public.profiles where auth_id = $1', [MEMBER])).rows[0]!.s).toBeNull();
  });

  it('VIP given for 30 days shows on the profile and revoking ends it', async () => {
    await one(db, ADMIN, "select public.admin_member_vip($1, 3, 30) as r", [MEMBER]);
    const row = (await db.query<{ v: number; d: number }>(
      "select vip_level as v, round(extract(epoch from vip_expires_at - now()) / 86400) as d from public.profiles where auth_id = $1", [MEMBER])).rows[0]!;
    expect(row.v).toBe(3);
    expect(Number(row.d)).toBe(30);
    expect(await one<number>(db, ADMIN, 'select public.admin_member_vip_revoke($1) as r', [MEMBER])).toBe(1);
    expect((await db.query<{ v: number }>('select public.vip_level_of($1) as v', [MEMBER])).rows[0]!.v).toBe(0);
  });

  it('an admin cannot remove their own admin role but can make a moderator', async () => {
    expect(await hintOf(one(db, ADMIN, "select public.admin_member_role($1, 'admin', false) as r", [ADMIN]))).toBe('self');
    await one(db, ADMIN, "select public.admin_member_role($1, 'moderator', true) as r", [OTHER]);
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.user_roles where user_id = $1 and role = 'moderator'", [OTHER])).rows[0]!.n).toBe(1);
    await one(db, ADMIN, "select public.admin_member_role($1, 'moderator', false) as r", [OTHER]);
  });

  it('a ban blocks sign-in, closes their live room and takes them out of rooms', async () => {
    await one(db, MEMBER, "select public.start_party('روم العضو', null, 'audio', 10, 'default', '', null) as r");
    const otherRoom = await one<string>(db, OTHER, "select public.start_party('روم تاني', null, 'audio', 10, 'default', '', null) as r");
    await one(db, MEMBER, 'select public.enter_room($1) as r', [otherRoom]);

    expect(await one<boolean>(db, ADMIN, "select public.admin_member_ban($1, 7, 'سب') as r", [MEMBER])).toBe(true);
    const until = (await db.query<{ d: number }>(
      'select round(extract(epoch from banned_until - now()) / 86400) as d from auth.users where id = $1', [MEMBER])).rows[0]!.d;
    expect(Number(until)).toBe(7);
    expect((await db.query<{ l: boolean }>('select is_live as l from public.rooms where owner_id = $1', [MEMBER])).rows[0]!.l).toBe(false);
    expect((await db.query<{ n: number }>('select count(*)::int as n from public.room_members where auth_id = $1', [MEMBER])).rows[0]!.n).toBe(0);
    expect(await one<string>(db, MEMBER, 'select reason as r from public.my_ban()')).toBe('سب');
  });

  it('a forever ban has no end date and unbanning lets the member back', async () => {
    await one(db, ADMIN, 'select public.admin_member_ban($1, null) as r', [MEMBER]);
    expect(await one<string | null>(db, MEMBER, 'select until as r from public.my_ban()')).toBeNull();
    await one(db, ADMIN, 'select public.admin_member_unban($1) as r', [MEMBER]);
    expect(await one<string | undefined>(db, MEMBER, 'select reason as r from public.my_ban()')).toBeUndefined();
    expect((await db.query<{ b: string | null }>('select banned_until as b from auth.users where id = $1', [MEMBER])).rows[0]!.b).toBeNull();
  });

  it('top management and yourself cannot be banned', async () => {
    expect(await hintOf(one(db, ADMIN, 'select public.admin_member_ban($1) as r', [ADMIN]))).toBe('self');
    expect(await hintOf(one(db, ADMIN, 'select public.admin_member_ban($1) as r', [ADMIN2]))).toBe('target_admin');
  });

  it('closing a room from the panel takes it offline', async () => {
    const room = (await db.query<{ id: string }>('select id from public.rooms where owner_id = $1', [OTHER])).rows[0]!.id;
    await one(db, ADMIN, 'select public.admin_close_room($1) as r', [room]);
    expect((await db.query<{ l: boolean }>('select is_live as l from public.rooms where id = $1', [room])).rows[0]!.l).toBe(false);
  });

  it('gift prices and VIP prices change from the panel', async () => {
    await one(db, ADMIN, "select public.admin_update_gift('rose', 'وردة', 5, 1, true) as r");
    expect(Number((await db.query<{ p: string }>("select price as p from public.room_gift_catalog where key = 'rose'")).rows[0]!.p)).toBe(5);
    expect(await hintOf(one(db, ADMIN, "select public.admin_update_gift('rose', 'وردة', 0, 1, true) as r"))).toBe('bad_price');
    await one(db, ADMIN, 'select public.admin_update_vip_tier(1, 10000, 30, null) as r');
    expect(Number((await db.query<{ p: string }>('select price_coins as p from public.vip_tiers where level = 1')).rows[0]!.p)).toBe(10000);
  });

  it('the dashboard counts members and the log lists actions', async () => {
    const d = await one<{ members: number; days: unknown[] }>(db, ADMIN, 'select public.admin_dashboard() as r');
    expect(d.members).toBe(4);
    expect(d.days).toHaveLength(14);
    const n = (await asUser(db, ADMIN, () => db.query('select * from public.admin_actions_log(200)'))).rows.length;
    expect(n).toBeGreaterThan(5);
  });

  it('the panel reviews an agency request and can take a host out', async () => {
    const app = await one<string>(db, OTHER, "select public.apply_for_agency('وكالة الإدارة', 'الاسم الكامل', '+201001234567', 'مصر') as r");
    expect(await one<number>(db, ADMIN, 'select public.admin_review_application($1, true) as r', [app])).toBe(200);
    const agency = (await db.query<{ id: string }>('select id from public.agencies where code = 200')).rows[0]!.id;
    expect(await hintOf(one(db, ADMIN, 'select public.admin_remove_agency_host($1, $2) as r', [agency, OTHER]))).toBe('is_agent');
    await db.query('insert into public.agency_members(agency_id, host_id) values ($1, $2)', [agency, MEMBER]);
    await one(db, ADMIN, 'select public.admin_remove_agency_host($1, $2) as r', [agency, MEMBER]);
    expect((await db.query<{ n: number }>('select count(*)::int as n from public.agency_members where host_id = $1 and left_at is null', [MEMBER])).rows[0]!.n).toBe(0);
  });
});
