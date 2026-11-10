// @vitest-environment node
import { readFileSync } from 'node:fs';
import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { supabaseLike, addUser, asUser } from './supabase-like';

const files = ['sql/voli-starter.sql', 'supabase/001_levels.sql', 'supabase/002_special_id.sql', 'supabase/003_vip.sql']
  .map((f) => readFileSync(f, 'utf8'));
const upTo002 = files.slice(0, 3);

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

async function setup(count: number, sql = files) {
  const db = await supabaseLike();
  for (const f of sql) await db.exec(f);
  for (let i = 1; i <= count; i++) await addUser(db, uuid(i), `عضو ${i}`);
  return db;
}
async function publicId(db: PGlite, n: number) {
  return (await db.query<{ public_id: number }>('select public_id from public.profiles where auth_id = $1', [uuid(n)])).rows[0]!.public_id;
}
async function vip(db: PGlite, n: number) {
  return (await db.query<{ vip_level: number; vip_expires_at: Date | null; coins: number }>(
    'select vip_level, vip_expires_at, coins::int from public.profiles where auth_id = $1', [uuid(n)])).rows[0]!;
}
const grant = async (db: PGlite, n: number, level: number, days: number | null = null) =>
  db.query('select public.admin_grant_vip($1, $2, $3)', [await publicId(db, n), level, days]);
const setRole = async (db: PGlite, n: number, role: 'admin' | 'moderator') =>
  db.query('select public.admin_set_role($1, $2)', [await publicId(db, n), role]);

describe('VIP tiers', () => {
  let db: PGlite;
  beforeAll(async () => { db = await setup(1); }, 30000);
  afterAll(async () => { await db.close(); });

  it('has exactly the 8 dragon tiers, readable by members', async () => {
    const rows = await asUser(db, uuid(1), () => db.query<{ level: number; name_ar: string }>('select level, name_ar from public.vip_tiers order by level'));
    expect(rows.rows.map((r) => r.name_ar)).toEqual([
      'تنين البرونز', 'تنين الفضة', 'تنين الذهب', 'تنين الأرجوان الكوني',
      'تنين الياقوت الأحمر', 'تنين الزمرد الأخضر', 'تنين الماس الملكي', 'التنين الأسطوري الكوني',
    ]);
  });

  it('unlocks each feature at the tier the user listed', async () => {
    const { rows } = await db.query<Record<string, unknown>>('select * from public.vip_tiers order by level');
    const from = (col: string) => rows.findIndex((r) => r[col] === true) + 1;
    expect(from('chat_badge')).toBe(1);
    expect(from('name_color')).toBe(1);
    expect(from('hide_location')).toBe(2);
    expect(from('friends_bonus')).toBe(3);
    expect(from('invisible_mode')).toBe(5);
    expect(from('super_moderation')).toBe(6);
    expect(from('monthly_salary')).toBe(6);
    expect(from('join_banner')).toBe(7);
    expect(from('private_support')).toBe(7);
    expect(from('system_broadcast')).toBe(8);
    expect(rows.map((r) => r['chat_bubble'])).toEqual([null, 'custom', 'custom', 'neon', 'neon', 'neon', 'neon', 'neon']);
    expect(rows.map((r) => r['id_card'])).toEqual([null, null, 'special', 'special', 'gold', 'gold', 'diamond', 'legendary']);
    expect(rows.map((r) => r['immunity'])).toEqual(['none', 'none', 'none', 'moderators', 'moderators', 'moderators', 'moderators', 'absolute']);
    expect(rows.map((r) => r['entrance'] !== null)).toEqual([true, true, true, true, true, true, true, true]);
    expect(rows[0]!['entrance']).toBe('bronze_dragon_bar');
    expect(rows[1]!['entrance']).toBe('silver_dragon_bar');
    expect(rows[7]!['entrance_fullscreen']).toBe(true);
    expect(rows[7]!['entrance_sound']).toBe(true);
  });

  it('nothing is for sale and no salary is paid until amounts are set', async () => {
    const { rows } = await db.query<{ n: number }>('select count(*)::int n from public.vip_tiers where price_coins is not null or monthly_salary_coins is not null');
    expect(rows[0]!.n).toBe(0);
  });
});

describe('Getting VIP', () => {
  let db: PGlite;
  beforeAll(async () => { db = await setup(2); }, 30000);
  afterAll(async () => { await db.close(); });

  it('the admin grants a permanent or timed tier; the highest active one counts', async () => {
    await grant(db, 1, 3, 30);
    let v = await vip(db, 1);
    expect(v.vip_level).toBe(3);
    expect(v.vip_expires_at!.getTime() - Date.now()).toBeGreaterThan(29 * 86400e3);
    await grant(db, 1, 6);
    v = await vip(db, 1);
    expect(v.vip_level).toBe(6);
    expect(v.vip_expires_at).toBeNull();
  });

  it('revoking ends every active grant', async () => {
    await db.query('select public.admin_revoke_vip($1)', [await publicId(db, 1)]);
    expect((await vip(db, 1)).vip_level).toBe(0);
  });

  it('expired grants stop counting once refreshed', async () => {
    await db.query(`insert into public.vip_grants(auth_id, level, source, starts_at, expires_at) values ($1, 4, 'gift', now() - interval '2 days', now() - interval '1 day')`, [uuid(2)]);
    await db.query('select public.refresh_all_vips()');
    expect((await vip(db, 2)).vip_level).toBe(0);
  });

  it('members cannot give themselves VIP or coins', async () => {
    const me = uuid(2);
    const id = await publicId(db, 2);
    await asUser(db, me, async () => {
      await expect(db.query('select public.admin_grant_vip($1, 8)', [id])).rejects.toThrow();
      await expect(db.query('select public.admin_add_coins($1, 1000)', [id])).rejects.toThrow();
      await expect(db.query(`insert into public.vip_grants(auth_id, level, source) values ($1, 8, 'admin')`, [me])).rejects.toThrow();
      await expect(db.query('update public.profiles set vip_level = 8 where auth_id = $1', [me])).rejects.toThrow();
      await expect(db.query('update public.profiles set coins = 999999 where auth_id = $1', [me])).rejects.toThrow();
    });
    expect((await vip(db, 2)).vip_level).toBe(0);
  });
});

describe('Buying VIP with coins', () => {
  let db: PGlite;
  beforeAll(async () => { db = await setup(1); }, 30000);
  afterAll(async () => { await db.close(); });
  const buy = (level: number) => asUser(db, uuid(1), () => db.query('select public.buy_vip($1)', [level]));

  it('refuses a tier with no price yet', async () => {
    await db.query('select public.admin_add_coins($1, 100000)', [await publicId(db, 1)]);
    await expect(buy(1)).rejects.toThrow(/not for sale/);
  });

  it('takes the price, gives the tier for its duration, and a repeat purchase adds the days', async () => {
    await db.query('update public.vip_tiers set price_coins = 10000, duration_days = 30 where level = 2');
    await buy(2);
    let v = await vip(db, 1);
    expect(v.coins).toBe(90000);
    expect(v.vip_level).toBe(2);
    const days = (d: Date) => (d.getTime() - Date.now()) / 86400e3;
    expect(days(v.vip_expires_at!)).toBeGreaterThan(29.9);
    await buy(2);
    v = await vip(db, 1);
    expect(v.coins).toBe(80000);
    expect(days(v.vip_expires_at!)).toBeGreaterThan(59.9);
  });

  it('refuses when coins are not enough and keeps the balance', async () => {
    await db.query('update public.vip_tiers set price_coins = 500000 where level = 8');
    await expect(buy(8)).rejects.toThrow(/Not enough coins/);
    expect((await vip(db, 1)).coins).toBe(80000);
  });
});

describe('VIP settings', () => {
  let db: PGlite;
  beforeAll(async () => { db = await setup(1); }, 30000);
  afterAll(async () => { await db.close(); });
  const set = (col: string, on: boolean) => asUser(db, uuid(1), () => db.query(`update public.profiles set ${col} = $1 where auth_id = $2`, [on, uuid(1)]));
  const check = async (fn: string) => (await db.query<{ v: boolean }>(`select public.${fn}($1) v`, [uuid(1)])).rows[0]!.v;

  it('hiding location needs VIP 2', async () => {
    await grant(db, 1, 1);
    await expect(set('hide_location', true)).rejects.toThrow();
    await grant(db, 1, 2);
    await set('hide_location', true);
    expect(await check('location_hidden')).toBe(true);
  });

  it('invisible mode needs VIP 5 and stops working when VIP ends', async () => {
    await grant(db, 1, 4);
    await expect(set('vip_invisible', true)).rejects.toThrow();
    await grant(db, 1, 5);
    await set('vip_invisible', true);
    expect(await check('is_invisible')).toBe(true);
    await db.query('select public.admin_revoke_vip($1)', [await publicId(db, 1)]);
    expect(await check('is_invisible')).toBe(false);
    expect(await check('location_hidden')).toBe(false);
  });
});

describe('Room mute / kick rules', () => {
  // 1 admin, 2 moderator, 3 VIP3, 4 VIP4, 5 VIP5, 6 VIP6, 7 VIP7, 8 VIP8, 9 member, 10 moderator with VIP7
  let db: PGlite;
  beforeAll(async () => {
    db = await setup(10);
    await setRole(db, 1, 'admin');
    await setRole(db, 2, 'moderator');
    for (const n of [3, 4, 5, 6, 7, 8]) await grant(db, n, n);
    await setRole(db, 10, 'moderator'); await grant(db, 10, 7);
  }, 60000);
  afterAll(async () => { await db.close(); });
  const can = async (a: number, t: number) =>
    (await db.query<{ v: boolean }>('select public.can_mute_or_kick($1, $2) v', [uuid(a), uuid(t)])).rows[0]!.v;

  it('normal moderators can act on members up to VIP 3 but not on VIP 4+', async () => {
    expect(await can(2, 9)).toBe(true);
    expect(await can(2, 3)).toBe(true);
    expect(await can(2, 4)).toBe(false);
    expect(await can(2, 7)).toBe(false);
  });
  it('moderators cannot act on other moderators', async () => {
    expect(await can(2, 10)).toBe(false);
  });
  it('VIP 6+ can act on moderators and lower tiers only', async () => {
    expect(await can(6, 2)).toBe(true);
    expect(await can(6, 5)).toBe(true);
    expect(await can(6, 9)).toBe(true);
    expect(await can(6, 7)).toBe(false);
    expect(await can(7, 10)).toBe(false);
  });
  it('VIP 5 and below without a role cannot act on anyone', async () => {
    expect(await can(5, 9)).toBe(false);
  });
  it('VIP 8 can only be acted on by top management', async () => {
    expect(await can(7, 8)).toBe(false);
    expect(await can(2, 8)).toBe(false);
    expect(await can(1, 8)).toBe(true);
  });
  it('nobody can act on top management', async () => {
    expect(await can(8, 1)).toBe(false);
    expect(await can(2, 1)).toBe(false);
  });
});

describe('Room entry and salary', () => {
  let db: PGlite;
  beforeAll(async () => { db = await setup(2); await grant(db, 1, 8); await grant(db, 2, 5); }, 30000);
  afterAll(async () => { await db.close(); });
  const entry = async (n: number) =>
    (await db.query<{ e: Record<string, unknown> }>('select public.vip_room_entry($1) e', [uuid(n)])).rows[0]!.e;

  it('VIP 8 enters full screen with sound and an app-wide broadcast', async () => {
    expect(await entry(1)).toMatchObject({ level: 8, entrance: 'legendary_dragon', fullscreen: true, sound: true, system_broadcast: true });
  });
  it('an invisible member enters with no entrance', async () => {
    await asUser(db, uuid(2), () => db.query('update public.profiles set vip_invisible = true where auth_id = $1', [uuid(2)]));
    expect(await entry(2)).toMatchObject({ invisible: true, entrance: null });
  });
  it('pays the monthly salary to VIP 6+ once a month, only after an amount is set', async () => {
    expect((await db.query<{ n: number }>('select public.pay_vip_salaries() n')).rows[0]!.n).toBe(0);
    await db.query('update public.vip_tiers set monthly_salary_coins = 5000 where level = 8');
    expect((await db.query<{ n: number }>('select public.pay_vip_salaries() n')).rows[0]!.n).toBe(1);
    expect((await db.query<{ n: number }>('select public.pay_vip_salaries() n')).rows[0]!.n).toBe(0);
    expect((await vip(db, 1)).coins).toBe(5000);
    expect((await vip(db, 2)).coins).toBe(0);
  });
});

describe('Upgrading from the old 0–100 VIP scale', () => {
  it('maps old levels to the 8 tiers once and keeps them on re-runs', async () => {
    const db = await setup(2, upTo002);
    try {
      await db.query('update public.profiles set vip_level = 50, special_id = $2 where auth_id = $1', [uuid(1), '777']);
      await db.query('update public.profiles set vip_level = 100 where auth_id = $1', [uuid(2)]);
      await db.exec(files[3]!);
      expect((await vip(db, 1)).vip_level).toBe(4);
      expect((await vip(db, 2)).vip_level).toBe(8);
      for (const f of files) await db.exec(f);
      expect((await vip(db, 1)).vip_level).toBe(4);
      expect((await vip(db, 2)).vip_level).toBe(8);
      await expect(db.query('update public.profiles set vip_level = 9 where auth_id = $1', [uuid(1)])).rejects.toThrow();
      const settings = await asUser(db, uuid(1), () => db.query('update public.profiles set bio = $1 where auth_id = $2', ['hi', uuid(1)]));
      expect(settings.affectedRows).toBe(1);
    } finally { await db.close(); }
  }, 60000);
});
