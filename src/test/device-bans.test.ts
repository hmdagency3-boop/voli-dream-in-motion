// @vitest-environment node
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { supabaseLike, addUser, asUser } from './supabase-like';

const sql = readFileSync('supabase/015_device_bans.sql', 'utf8');
const old = readFileSync('src/test/fixtures/device-bans-v1.sql', 'utf8');
const A = '00000000-0000-4000-8000-000000000001';
const B = '00000000-0000-4000-8000-000000000002';
const C = '00000000-0000-4000-8000-000000000003';
type Notice = { banned: boolean; kind: string; reason: string; ban_code: number };
let db: PGlite;
afterEach(async () => { if (db) await db.close(); });

async function setup(upgrade = false) {
  db = await supabaseLike();
  await db.exec(`
    create table public.profiles(auth_id uuid primary key references auth.users(id), public_id bigint unique);
    grant select on public.profiles to authenticated;
    grant all on public.profiles to service_role;
    alter table public.profiles enable row level security;
    create table public.member_bans(auth_id uuid primary key references public.profiles(auth_id), until timestamptz, reason text, banned_by uuid, created_at timestamptz default now());
    revoke all on public.member_bans from public, anon, authenticated;
    grant all on public.member_bans to service_role;
    alter table public.member_bans enable row level security;
    create function public.admin_guard() returns uuid language plpgsql as $$begin raise exception 'Management only'; end$$;
    create function public.my_ban() returns table(until timestamptz, reason text) language sql as $$select b.until, b.reason from public.member_bans b where b.auth_id = auth.uid()$$;
  `);
  for (const [id, pid] of [[A, 1234567], [B, 2345678], [C, 3456789]] as const) {
    await addUser(db, id, 'عضو');
    await db.query('insert into public.profiles values ($1,$2)', [id, pid]);
  }
  if (upgrade) await db.exec(old);
  await db.exec(sql);
}

async function visit(who: string, device: string, ip = '10.0.0.1') {
  return (await asUser(db, who, () => db.query<Notice>(
    "select * from public.device_check_in($1,$2,'EG','','','','','','')", [device, ip]))).rows;
}

describe('device-linked account bans', () => {
  it('allocates ban codes starting at 200 for devices, networks and member bans', async () => {
    await setup();
    await db.exec("insert into public.device_bans(kind, device_id, reason) values ('device','shared-phone','إساءة'); select public.ban_ip('41.33.12.7'); insert into public.member_bans(auth_id) values ('" + C + "');");
    const codes = (await db.query<{ ban_code: number }>('select ban_code from public.device_bans union all select ban_code from public.member_bans order by ban_code')).rows;
    expect(codes.map((r) => Number(r.ban_code))).toEqual([200, 201, 202]);
  }, 20000);

  it('blocks every linked account on another device with the original code and reason, not unrelated accounts', async () => {
    await setup();
    await visit(A, 'shared-phone');
    await visit(B, 'shared-phone');
    await db.exec("reset request.jwt.claim.sub; select public.ban_member_devices(1234567, false, 'إساءة متكررة')");
    for (const who of [A, B]) {
      const rows = await visit(who, 'different-phone', '192.0.2.5');
      expect(rows).toEqual([{ banned: true, kind: 'account', reason: 'إساءة متكررة', until: null, ban_code: 200 }]);
      const mine = (await asUser(db, who, () => db.query<{ ban_code: number; reason: string }>('select ban_code, reason from public.my_ban()'))).rows;
      expect(mine).toEqual([{ ban_code: 200, reason: 'إساءة متكررة' }]);
      await db.exec("reset request.jwt.claim.sub");
      expect((await db.query<{ banned: boolean }>('select public.is_banned($1) as banned', [who])).rows[0]?.banned).toBe(true);
    }
    expect(await visit(C, 'unrelated-phone', '198.51.100.5')).toEqual([]);
  }, 20000);

  it('links a new account checking in on an already banned device', async () => {
    await setup();
    await db.exec("insert into public.device_bans(kind, device_id, reason) values ('device','shared-phone','إساءة')");
    expect((await visit(B, 'shared-phone'))[0]?.ban_code).toBe(200);
    expect((await visit(B, 'other-phone', '192.0.2.5'))[0]?.kind).toBe('account');
  }, 20000);

  it('expiry and deletion release inherited bans without leaving copied bans', async () => {
    await setup();
    await visit(A, 'shared-phone');
    await db.exec("insert into public.device_bans(kind,device_id,until) values ('device','shared-phone', now() - interval '1 day')");
    expect(await visit(A, 'other-phone', '192.0.2.5')).toEqual([]);
    await db.exec("reset request.jwt.claim.sub; select public.ban_member_devices(1234567, false, 'حظر جديد');");
    expect((await visit(A, 'other-phone', '192.0.2.5'))[0]?.banned).toBe(true);
    await db.exec("delete from public.device_bans; reset request.jwt.claim.sub");
    expect(await visit(A, 'fresh-phone', '198.51.100.5')).toEqual([]);
    expect((await asUser(db, A, () => db.query('select * from public.my_ban()'))).rows).toEqual([]);
  }, 20000);

  it('reruns preserve codes and upgrade the old RPC/schema without losing historical links', async () => {
    await setup(true);
    await db.query('insert into public.device_visits(auth_id, device_id) values ($1,$2)', [B, 'old-phone']);
    await db.exec(sql);
    expect((await visit(B, 'new-phone', '192.0.2.5'))[0]).toMatchObject({ kind: 'account', ban_code: 200, reason: 'حظر سابق' });
    await db.exec("reset request.jwt.claim.sub; select public.ban_network('41.33.12.0/24', 'شبكة')");
    expect((await visit(C, 'new-phone', '41.33.12.8'))[0]?.ban_code).toBe(201);
  }, 20000);

  it('members cannot read links or bans, query another account ban, or create bans', async () => {
    await setup();
    for (const query of ['select * from public.device_visits', 'select * from public.device_bans', 'select * from public.member_bans', `select * from public.account_device_ban('${B}')`, "select public.ban_ip('41.33.12.7')"]) {
      await expect(asUser(db, A, () => db.query(query))).rejects.toThrow();
    }
  }, 20000);
});