// @vitest-environment node
import { readFileSync } from 'node:fs';
import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { supabaseLike, addUser, asUser } from './supabase-like';
import { checkName } from '@/lib/profile-info';

const files = ['sql/voli-starter.sql', 'supabase/001_levels.sql', 'supabase/002_special_id.sql', 'supabase/003_vip.sql', 'supabase/020_gender_country.sql', 'supabase/021_profile_extras.sql']
  .map((f) => readFileSync(f, 'utf8'));
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ME = uuid(1), OTHER = uuid(2);
const pic = (n: number) => `https://res.cloudinary.com/zsxxjkqg/image/upload/v1/voli/album/p${n}.jpg`;
type Info = { gender: string | null; birthday: string | null; album: string[] };

const info = async (db: PGlite, who: string, target: string) =>
  (await asUser(db, who, () => db.query<{ r: Info }>('select public.profile_info($1) as r', [target]))).rows[0]!.r;
const album = (db: PGlite, who: string, urls: string[]) => asUser(db, who, () => db.query('select public.set_my_album($1)', [urls]));
const birthday = (db: PGlite, who: string, d: string | null) => asUser(db, who, () => db.query('select public.set_my_birthday($1)', [d]));

describe('birthday and album on profiles', () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await supabaseLike();
    for (const f of files) await db.exec(f);
    await addUser(db, ME, 'أنا');
    await addUser(db, OTHER, 'غيري');
  }, 30000);
  afterAll(async () => { await db.close(); });

  it('the album holds at most 5 pictures and everyone sees it', async () => {
    await album(db, ME, [1, 2, 3, 4, 5].map(pic));
    expect((await info(db, OTHER, ME)).album).toHaveLength(5);
    await expect(album(db, ME, [1, 2, 3, 4, 5, 6].map(pic))).rejects.toThrow(/Album is full/);
  });

  it('only pictures uploaded to the app are accepted in the album', async () => {
    await expect(album(db, ME, ['https://evil.example/x.jpg'])).rejects.toThrow(/Bad picture/);
  });

  it('the birthday is seen by the member only', async () => {
    await birthday(db, ME, '1994-08-03');
    expect((await info(db, ME, ME)).birthday).toBe('1994-08-03');
    expect((await info(db, OTHER, ME)).birthday).toBeNull();
  });

  it('a birthday in the future is refused', async () => {
    await expect(birthday(db, ME, '2999-01-01')).rejects.toThrow(/Bad birthday/);
  });

  it('saving the birthday keeps gender and album', async () => {
    await asUser(db, ME, () => db.query("select public.set_my_profile_info('female', 'SA')"));
    await birthday(db, ME, '1995-01-01');
    const r = await info(db, ME, ME);
    expect(r.gender).toBe('female');
    expect(r.album).toHaveLength(5);
  });

  it('runs again without errors and keeps saved values', async () => {
    await db.exec(files[5]!);
    expect((await info(db, ME, ME)).birthday).toBe('1995-01-01');
  });

  it('a name must be 1 to 60 letters', () => {
    expect(checkName('   ').ok).toBe(false);
    expect(checkName('x'.repeat(61)).ok).toBe(false);
    expect(checkName('  يوسف ')).toEqual({ ok: true, value: 'يوسف' });
  });
});
