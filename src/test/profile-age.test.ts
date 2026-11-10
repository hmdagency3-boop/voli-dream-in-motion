// @vitest-environment node
import { readFileSync } from 'node:fs';
import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { supabaseLike, addUser, asUser } from './supabase-like';
import { ageFrom } from '@/lib/profile-info';

const files = ['sql/voli-starter.sql', 'supabase/001_levels.sql', 'supabase/002_special_id.sql', 'supabase/003_vip.sql',
  'supabase/020_gender_country.sql', 'supabase/021_profile_extras.sql', 'supabase/022_profile_age.sql']
  .map((f) => readFileSync(f, 'utf8'));
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ME = uuid(1), OTHER = uuid(2);
type Info = { birthday: string | null; age: number | null };

describe('age from the birthday', () => {
  it('counts whole years and goes up only on the birthday itself', () => {
    expect(ageFrom('1994-08-03', new Date(2026, 7, 2))).toBe(31);
    expect(ageFrom('1994-08-03', new Date(2026, 7, 3))).toBe(32);
  });

  it('gives no age for a future or broken date', () => {
    expect(ageFrom('2999-01-01', new Date(2026, 0, 1))).toBeNull();
    expect(ageFrom('nope')).toBeNull();
  });
});

describe('age on profiles (update 022)', () => {
  let db: PGlite;
  const info = async (who: string, target: string) =>
    (await asUser(db, who, () => db.query<{ r: Info }>('select public.profile_info($1) as r', [target]))).rows[0]!.r;

  beforeAll(async () => {
    db = await supabaseLike();
    for (const f of files) await db.exec(f);
    await addUser(db, ME, 'أنا');
    await addUser(db, OTHER, 'غيري');
  }, 30000);
  afterAll(async () => { await db.close(); });

  it('others see the age but not the birthday', async () => {
    await asUser(db, ME, () => db.query('select public.set_my_birthday($1)', ['1994-08-03']));
    const expected = ageFrom('1994-08-03');
    const r = await info(OTHER, ME);
    expect(r.age).toBe(expected);
    expect(r.birthday).toBeNull();
  });

  it('no birthday means no age', async () => {
    expect((await info(ME, OTHER)).age).toBeNull();
  });

  it('runs again without errors', async () => {
    await db.exec(files[6]!);
    expect((await info(OTHER, ME)).age).toBe(ageFrom('1994-08-03'));
  });
});
