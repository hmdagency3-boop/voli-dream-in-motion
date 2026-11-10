// @vitest-environment node
import { readFileSync } from 'node:fs';
import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { supabaseLike, addUser, asUser } from './supabase-like';
import { countryFlag, countryFlagUrl, countryOptions } from '@/lib/profile-info';

const files = ['sql/voli-starter.sql', 'supabase/001_levels.sql', 'supabase/002_special_id.sql', 'supabase/003_vip.sql', 'supabase/020_gender_country.sql']
  .map((f) => readFileSync(f, 'utf8'));
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ME = uuid(1), OTHER = uuid(2);
type Info = { gender: string | null; country: string | null; country_hidden: boolean };

const info = async (db: PGlite, who: string, target: string) =>
  (await asUser(db, who, () => db.query<{ r: Info }>('select public.profile_info($1) as r', [target]))).rows[0]!.r;
const save = (db: PGlite, who: string, gender: string | null, country: string | null) =>
  asUser(db, who, () => db.query('select public.set_my_profile_info($1, $2)', [gender, country]));

describe('gender and country on profiles', () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await supabaseLike();
    for (const f of files) await db.exec(f);
    await addUser(db, ME, 'أنا');
    await addUser(db, OTHER, 'غيري');
  }, 30000);
  afterAll(async () => { await db.close(); });

  it('a member saves their own gender and country and others see them', async () => {
    await save(db, ME, 'male', 'eg');
    expect(await info(db, ME, ME)).toEqual({ gender: 'male', country: 'EG', country_hidden: false });
    expect(await info(db, OTHER, ME)).toEqual({ gender: 'male', country: 'EG', country_hidden: false });
  });

  it('only male or female and a two-letter country are accepted', async () => {
    await expect(save(db, ME, 'other', 'EG')).rejects.toThrow(/Bad gender/);
    await expect(save(db, ME, 'female', 'Egypt')).rejects.toThrow(/Bad country/);
    expect((await info(db, ME, ME)).gender).toBe('male');
  });

  it('a member with hide location on (VIP 2+) keeps the country hidden from others only', async () => {
    const pid = (await db.query<{ public_id: number }>('select public_id from public.profiles where auth_id = $1', [ME])).rows[0]!.public_id;
    await db.query('select public.admin_grant_vip($1, 2)', [pid]);
    await asUser(db, ME, () => db.query('update public.profiles set hide_location = true where auth_id = $1', [ME]));
    expect(await info(db, OTHER, ME)).toEqual({ gender: 'male', country: null, country_hidden: true });
    expect((await info(db, ME, ME)).country).toBe('EG');
  });

  it('members can never read or write the table directly', async () => {
    await expect(asUser(db, OTHER, () => db.query('select * from public.member_info'))).rejects.toThrow();
    await expect(asUser(db, OTHER, () => db.query("update public.member_info set country = 'SA'"))).rejects.toThrow();
  });

  it('runs again without errors and keeps saved values', async () => {
    await db.exec(files[4]!);
    expect((await info(db, ME, ME)).country).toBe('EG');
  });

  it('the picker lists Arab countries first and builds flags', () => {
    const list = countryOptions();
    expect(list[0]!.code).toBe('EG');
    expect(new Set(list.map((c) => c.code)).size).toBe(list.length);
    expect(countryFlag('EG')).toBe('🇪🇬');
  });

  it('every country in the picker has a round flag picture', () => {
    const missing = countryOptions().filter((c) => !countryFlagUrl(c.code)).map((c) => c.code);
    expect(missing).toEqual([]);
  });
});
