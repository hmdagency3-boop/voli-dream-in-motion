// @vitest-environment node
import { readFileSync } from 'node:fs';
import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { supabaseLike, addUser, asUser } from './supabase-like';

const files = ['sql/voli-starter.sql', 'supabase/001_levels.sql', 'supabase/002_special_id.sql', 'supabase/003_vip.sql',
  'supabase/004_rooms.sql', 'supabase/005_room_coins.sql', 'supabase/006_room_gifts.sql', 'supabase/007_room_ranking.sql',
  'supabase/008_agencies.sql'].map((f) => readFileSync(f, 'utf8'));
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const AGENT = uuid(1), HOST = uuid(2), FAN = uuid(3), AGENT2 = uuid(4), ADMIN = uuid(5), OTHER = uuid(6);

const one = async <T,>(db: PGlite, who: string, sql: string, params: unknown[] = []) =>
  (await asUser(db, who, () => db.query<{ r: T }>(sql, params))).rows[0]?.r as T;
const hintOf = async (p: Promise<unknown>) => { try { await p; return 'ok'; } catch (e) { return (e as { hint?: string }).hint; } };
const apply = (db: PGlite, who: string, name: string) =>
  one<string>(db, who, "select public.apply_for_agency($1, 'الاسم الكامل', '+201001234567', 'مصر') as r", [name]);
const pid = async (db: PGlite, who: string) =>
  (await db.query<{ p: number }>('select public_id as p from public.profiles where auth_id = $1', [who])).rows[0]!.p;
const gift = (db: PGlite, room: string, to: string, value: number, when = 'now()') =>
  db.query(`insert into public.room_coins(room_id, sender_id, amount, recipient_id, gift_key, quantity, created_at)
            values ($1, $2, $3, $4, 'rose', 1, ${when})`, [room, FAN, value, to]);

describe('agencies', () => {
  let db: PGlite;
  let room: string;
  let agencyId: string;
  beforeAll(async () => {
    db = await supabaseLike();
    for (const f of files) await db.exec(f);
    for (let i = 1; i <= 6; i++) await addUser(db, uuid(i), `عضو ${i}`);
    await db.query("select public.admin_set_role($1, 'admin')", [await pid(db, ADMIN)]);
    room = await one<string>(db, FAN, "select public.start_party('روم', null, 'audio', 10, 'default', '', null) as r");
  }, 30000);
  afterAll(async () => { await db.close(); });

  it('the first approved agency gets code 200 and the next gets 201', async () => {
    const app1 = await apply(db, AGENT, 'وكالة النجوم');
    expect(await one<number>(db, ADMIN, 'select public.review_agency_application($1, true) as r', [app1])).toBe(200);
    const app2 = await apply(db, AGENT2, 'وكالة القمر');
    expect((await db.query<{ r: number }>('select public.admin_review_agency_application($1, true) as r', [app2])).rows[0]!.r).toBe(201);
    agencyId = (await db.query<{ id: string }>('select id from public.agencies where code = 200')).rows[0]!.id;
  });

  it('only the management can approve a request', async () => {
    const app = await apply(db, OTHER, 'وكالة');
    expect(await hintOf(one(db, OTHER, 'select public.review_agency_application($1, true) as r', [app]))).toBe('not_admin');
    expect(await hintOf(one(db, OTHER, 'select public.admin_review_agency_application($1, true) as r', [app]))).not.toBe('ok');
    await one(db, ADMIN, "select public.review_agency_application($1, false, 'ناقص بيانات') as r", [app]);
    expect(await one<string>(db, OTHER, 'select status as r from public.agency_applications where id = $1', [app])).toBe('rejected');
  });

  it('a member can have only one waiting request to open an agency', async () => {
    await apply(db, HOST, 'وكالة تجربة');
    expect(await hintOf(apply(db, HOST, 'وكالة تانية'))).toBe('pending_exists');
    const id = await one<string>(db, HOST, "select id as r from public.agency_applications where status = 'pending'");
    await one(db, ADMIN, 'select public.review_agency_application($1, false) as r', [id]);
  });

  it('the agent is the first member of their own agency', async () => {
    expect(await one<string>(db, AGENT, 'select host_id::text as r from public.agency_members where left_at is null')).toBe(AGENT);
  });

  it('a host searches the code, asks to join and the agent accepts', async () => {
    const found = await one<string>(db, HOST, 'select id as r from public.find_agency(200)');
    expect(found).toBe(agencyId);
    const req = await one<string>(db, HOST, 'select public.request_join_agency($1) as r', [found]);
    expect(await hintOf(one(db, HOST, 'select public.request_join_agency($1) as r', [found]))).toBe('pending_exists');
    expect(await hintOf(one(db, AGENT2, 'select public.decide_join_request($1, true) as r', [req]))).toBe('not_owner');
    await one(db, AGENT, 'select public.decide_join_request($1, true) as r', [req]);
    expect(await one<number>(db, HOST, 'select count(*)::int as r from public.agency_members where left_at is null')).toBe(1);
  });

  it('a host already inside an agency cannot join another one', async () => {
    const other = await one<string>(db, HOST, 'select id as r from public.find_agency(201)');
    expect(await hintOf(one(db, HOST, 'select public.request_join_agency($1) as r', [other]))).toBe('in_agency');
  });

  it('only gifts received while inside the agency count as its income', async () => {
    // Before joining (2 days ago) does not count; after joining does.
    await db.query("update public.agency_members set joined_at = now() - interval '1 day' where host_id = $1", [HOST]);
    await gift(db, room, HOST, 500, "now() - interval '2 days'");
    await gift(db, room, HOST, 120);
    await gift(db, room, AGENT, 30);
    const rows = await asUser(db, AGENT, () => db.query<{ host_id: string; diamonds: number }>(
      "select host_id, diamonds::int as diamonds from public.agency_members_income((now() - interval '5 days')::date, now()::date)"));
    expect(rows.rows).toEqual([{ host_id: HOST, diamonds: 120 }, { host_id: AGENT, diamonds: 30 }]);
    const mine = await asUser(db, HOST, () => db.query<{ diamonds: number }>(
      "select diamonds::int as diamonds from public.my_agency_income((now() - interval '5 days')::date, now()::date)"));
    expect(mine.rows.reduce((s, r) => s + r.diamonds, 0)).toBe(120);
  });

  it('the agent sees the weekly total and the agency share stays empty until set', async () => {
    const s = (await asUser(db, AGENT, () => db.query<{ this_week: number; members: number; commission_percent: string | null }>(
      'select this_week::int as this_week, members::int as members, commission_percent from public.agency_summary()'))).rows[0]!;
    expect(s.members).toBe(2);
    expect(s.commission_percent).toBeNull();
    expect(await hintOf(asUser(db, HOST, () => db.query('select * from public.agency_summary()')))).toBe('not_owner');
  });

  it('income stops counting after the agent removes a host', async () => {
    expect(await hintOf(one(db, AGENT, 'select public.remove_agency_member($1) as r', [AGENT]))).toBe('is_agent');
    await one(db, AGENT, 'select public.remove_agency_member($1) as r', [HOST]);
    await gift(db, room, HOST, 999, "now() + interval '1 second'");
    const rows = await asUser(db, AGENT, () => db.query<{ host_id: string; diamonds: number; active: boolean }>(
      "select host_id, diamonds::int as diamonds, active from public.agency_members_income((now() - interval '5 days')::date, (now() + interval '1 day')::date)"));
    expect(rows.rows.find((r) => r.host_id === HOST)).toEqual({ host_id: HOST, diamonds: 120, active: false });
  });

  it('people outside the agency cannot read its members or requests', async () => {
    expect(await one<number>(db, AGENT2, 'select count(*)::int as r from public.agency_members where agency_id = $1', [agencyId])).toBe(0);
    expect(await one<number>(db, FAN, 'select count(*)::int as r from public.agency_join_requests')).toBe(0);
    expect(await one<number>(db, FAN, 'select count(*)::int as r from public.agency_applications')).toBe(0);
    expect(await hintOf(asUser(db, FAN, () => db.query("insert into public.agencies(code, owner_id, name) values (999, $1, 'x')", [FAN])))).not.toBe('ok');
  });

  it('can be run again without changing codes', async () => {
    await db.exec(files[8]!);
    const app = await apply(db, FAN, 'وكالة بعد التحديث');
    expect(await one<number>(db, ADMIN, 'select public.review_agency_application($1, true) as r', [app])).toBe(202);
  });
});
