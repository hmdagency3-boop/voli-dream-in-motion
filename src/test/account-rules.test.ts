// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { accountSchema } from '@/lib/account-validation';

const starter = readFileSync('sql/voli-starter.sql', 'utf8');
const levels = readFileSync('supabase/001_levels.sql', 'utf8');
const firstVersion = readFileSync('src/test/fixtures/voli-starter-v1.sql', 'utf8');
const first = '00000000-0000-4000-8000-000000000001';
const second = '00000000-0000-4000-8000-000000000002';
const third = '00000000-0000-4000-8000-000000000003';

import { supabaseLike, addUser, asUser } from './supabase-like';

describe('Account identity rules (fresh project)', () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await supabaseLike();
    await db.exec(starter);
    await addUser(db, first, 'الأول');
    await addUser(db, second, 'الثاني');
  }, 30000);
  afterAll(async () => { await db.close(); });

  it('generates unique random seven-digit public IDs', async () => {
    const { rows } = await db.query<{ public_id: number }>('select public_id from public.profiles');
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(String(row.public_id)).toMatch(/^\d{7}$/);
    expect(new Set(rows.map(r => r.public_id)).size).toBe(2);
    await expect(db.query('update public.profiles set public_id = 999999 where auth_id = $1', [first])).rejects.toThrow();
  });
  it('assigns sequential internal UIDs starting at 20000, separately from public profiles', async () => {
    const { rows } = await db.query<{ uid: number }>('select uid::integer from public.account_uids order by uid');
    expect(rows.map(r => r.uid)).toEqual([20000, 20001]);
    const columns = await db.query<{ column_name: string }>("select column_name from information_schema.columns where table_schema='public' and table_name='profiles'");
    expect(columns.rows.map(r => r.column_name)).not.toContain('uid');
  });
  it('denies app users and visitors any access to internal UIDs', async () => {
    await asUser(db, first, async () => {
      await expect(db.query('select uid from public.account_uids')).rejects.toThrow();
      await expect(db.query('delete from public.account_uids')).rejects.toThrow();
    });
    await db.exec('set role anon');
    try { await expect(db.query('select uid from public.account_uids')).rejects.toThrow(); }
    finally { await db.exec('reset role'); }
  });
  it('does not let app users call the account creation functions', async () => {
    await asUser(db, first, async () => {
      await expect(db.query(`select public.ensure_account($1, '{}'::jsonb)`, [third])).rejects.toThrow();
    });
  });
  it('requires only a display name, not a username handle', () => {
    expect(accountSchema.safeParse({ displayName: 'أحمد', email: 'a@example.com', password: 'validpass' }).success).toBe(true);
    expect(accountSchema.safeParse({ email: 'a@example.com', password: 'validpass' }).success).toBe(false);
  });
  it('prevents clients changing a public ID, even with default table grants', async () => {
    await asUser(db, first, async () => {
      await expect(db.query('update public.profiles set public_id = 7777777 where auth_id = $1', [first])).rejects.toThrow();
    });
  });
  it('lets users edit their own bio and refreshes updated_at', async () => {
    const before = (await db.query<{ updated_at: Date }>('select updated_at from public.profiles where auth_id = $1', [first])).rows[0]!.updated_at;
    await asUser(db, first, () => db.query(`update public.profiles set bio = 'مرحبا' where auth_id = $1`, [first]));
    const after = (await db.query<{ bio: string; updated_at: Date }>('select bio, updated_at from public.profiles where auth_id = $1', [first])).rows[0]!;
    expect(after.bio).toBe('مرحبا');
    expect(after.updated_at.getTime()).toBeGreaterThan(before.getTime());
  });
  it("blocks editing someone else's profile", async () => {
    const result = await asUser(db, first, () => db.query(`update public.profiles set bio = 'x' where auth_id = $1`, [second]));
    expect(result.affectedRows ?? 0).toBe(0);
  });
  it('keeps messages private to participants', async () => {
    await addUser(db, third, 'ثالث');
    await db.query('insert into public.messages(sender_id,recipient_id,body) values ($1,$2,$3)', [first, second, 'رسالة']);
    const rows = await asUser(db, third, async () => (await db.query('select * from public.messages')).rows);
    expect(rows).toHaveLength(0);
  });
});

describe('Running the setup file again', () => {
  it('succeeds twice and keeps existing accounts unchanged', async () => {
    const db = await supabaseLike();
    try {
      await db.exec(starter);
      await addUser(db, first, 'الأول');
      const before = (await db.query('select auth_id, public_id from public.profiles')).rows;
      await db.exec(starter);
      expect((await db.query('select auth_id, public_id from public.profiles')).rows).toEqual(before);
      await addUser(db, second, 'الثاني');
      const uids = await db.query<{ uid: number }>('select uid::integer from public.account_uids order by uid');
      expect(uids.rows.map(r => r.uid)).toEqual([20000, 20001]);
    } finally { await db.close(); }
  }, 30000);
});

describe('Upgrading a project set up with the first version', () => {
  it('adds bio and updated_at, moves old internal UIDs to 20000+ in order, and creates missing accounts', async () => {
    const db = await supabaseLike();
    try {
      await db.exec(firstVersion);
      await addUser(db, first, 'الأول');
      const oldPublicId = (await db.query<{ public_id: number }>('select public_id from public.profiles')).rows[0]!.public_id;
      // A user who signed up while the signup trigger was missing.
      await db.exec('drop trigger on_auth_user_created on auth.users');
      await addUser(db, second, 'الثاني');

      await db.exec(starter);

      const cols = (await db.query<{ column_name: string }>("select column_name from information_schema.columns where table_schema='public' and table_name='profiles'")).rows.map(r => r.column_name);
      expect(cols).toEqual(expect.arrayContaining(['bio', 'updated_at']));
      const uids = await db.query<{ auth_id: string; uid: number }>('select auth_id, uid::integer from public.account_uids order by uid');
      expect(uids.rows).toEqual([{ auth_id: first, uid: 20000 }, { auth_id: second, uid: 20001 }]);
      expect(await db.query('select to_regclass($1) as t', ['private.account_uids'])).toMatchObject({ rows: [{ t: null }] });
      const profiles = await db.query<{ auth_id: string; public_id: number }>('select auth_id, public_id from public.profiles order by auth_id');
      expect(profiles.rows[0]!.public_id).toBe(oldPublicId);
      expect(String(profiles.rows[1]!.public_id)).toMatch(/^\d{7}$/);

      await addUser(db, third, 'ثالث');
      expect((await db.query('select uid::integer from public.account_uids where auth_id = $1', [third])).rows).toEqual([{ uid: 20002 }]);
    } finally { await db.close(); }
  }, 30000);
});

describe('Levels', () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await supabaseLike();
    await db.exec(starter); await db.exec(levels);
    await addUser(db, first, 'الأول');
  }, 30000);
  afterAll(async () => { await db.close(); });

  it('has 100 charisma and 100 wealth levels readable by members', async () => {
    const rows = await asUser(db, first, () => db.query<{ kind: string; n: number }>(
      'select kind, count(*)::int n from public.level_thresholds group by kind order by kind'));
    expect(rows.rows).toEqual([{ kind: 'charisma', n: 100 }, { kind: 'wealth', n: 100 }]);
  });
  it('members cannot raise their own points or edit thresholds', async () => {
    await expect(asUser(db, first, () => db.query('update public.profiles set charisma_points = 999 where auth_id = $1', [first]))).rejects.toThrow();
    await expect(asUser(db, first, () => db.query('update public.profiles set wealth_points = 999 where auth_id = $1', [first]))).rejects.toThrow();
    await expect(asUser(db, first, () => db.query("update public.level_thresholds set required = 1 where kind = 'wealth'"))).rejects.toThrow();
  });
  it('re-running keeps edited thresholds', async () => {
    await db.query("update public.level_thresholds set required = 5 where kind = 'charisma' and level = 1");
    await db.exec(starter); await db.exec(levels);
    const { rows } = await db.query<{ required: number }>("select required::int from public.level_thresholds where kind = 'charisma' and level = 1");
    expect(rows[0]!.required).toBe(5);
  });
});

const specialIds = readFileSync('supabase/002_special_id.sql', 'utf8');

describe('Special ID (الايدي المميز)', () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await supabaseLike();
    await db.exec(starter); await db.exec(levels); await db.exec(specialIds);
    await addUser(db, first, 'الأول');
    await addUser(db, second, 'الثاني');
  }, 30000);
  afterAll(async () => { await db.close(); });

  it('the admin can give a member a special ID and VIP level, which members can read', async () => {
    await db.query(`update public.profiles set special_id = '777', vip_level = 50 where auth_id = $1`, [first]);
    const rows = await asUser(db, second, () => db.query<{ special_id: string; vip_level: number }>('select special_id, vip_level from public.profiles where auth_id = $1', [first]));
    expect(rows.rows).toEqual([{ special_id: '777', vip_level: 50 }]);
  });
  it('the admin can grant a special ID below VIP 10', async () => {
    await db.query(`update public.profiles set special_id = '88', vip_level = 0 where auth_id = $1`, [second]);
    expect((await db.query('select special_id from public.profiles where auth_id = $1', [second])).rows).toEqual([{ special_id: '88' }]);
  });
  it('members cannot set their own special ID or VIP level', async () => {
    await expect(asUser(db, second, () => db.query(`update public.profiles set special_id = '1' where auth_id = $1`, [second]))).rejects.toThrow();
    await expect(asUser(db, second, () => db.query('update public.profiles set vip_level = 100 where auth_id = $1', [second]))).rejects.toThrow();
  });
  it('two members cannot share a special ID', async () => {
    await expect(db.query(`update public.profiles set special_id = '777' where auth_id = $1`, [second])).rejects.toThrow();
  });
  it("a special ID cannot be another member's normal ID", async () => {
    const otherId = (await db.query<{ public_id: number }>('select public_id from public.profiles where auth_id = $1', [first])).rows[0]!.public_id;
    await expect(db.query('update public.profiles set special_id = $1 where auth_id = $2', [String(otherId), second])).rejects.toThrow();
  });
  it('rejects non-digit special IDs and VIP levels above 100', async () => {
    await expect(db.query(`update public.profiles set special_id = 'abc' where auth_id = $1`, [second])).rejects.toThrow();
    await expect(db.query(`update public.profiles set special_id = '0777' where auth_id = $1`, [second])).rejects.toThrow();
    await expect(db.query('update public.profiles set vip_level = 101 where auth_id = $1', [second])).rejects.toThrow();
  });
  it('members can still edit their bio, and re-running all files keeps special IDs', async () => {
    await asUser(db, second, () => db.query(`update public.profiles set bio = 'hi' where auth_id = $1`, [second]));
    await db.exec(starter); await db.exec(levels); await db.exec(specialIds);
    const rows = await db.query<{ special_id: string; vip_level: number }>('select special_id, vip_level from public.profiles where auth_id = $1', [first]);
    expect(rows.rows).toEqual([{ special_id: '777', vip_level: 50 }]);
    await addUser(db, third, 'ثالث');
    expect(String((await db.query<{ public_id: number }>('select public_id from public.profiles where auth_id = $1', [third])).rows[0]!.public_id)).toMatch(/^\d{7}$/);
  });
});
