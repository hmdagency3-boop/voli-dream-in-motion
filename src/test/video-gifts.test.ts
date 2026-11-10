// @vitest-environment node
import { readFileSync } from 'node:fs';
import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { supabaseLike, addUser, asUser } from './supabase-like';
import { nextGiftShows } from '@/lib/gifts';

const files = ['sql/voli-starter.sql', 'supabase/001_levels.sql', 'supabase/002_special_id.sql', 'supabase/003_vip.sql',
  'supabase/004_rooms.sql', 'supabase/005_room_coins.sql', 'supabase/006_room_gifts.sql', 'supabase/007_room_ranking.sql',
  'supabase/008_agencies.sql', 'supabase/009_admin.sql', 'supabase/019_video_gifts.sql'].map((f) => readFileSync(f, 'utf8'));
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ADMIN = uuid(1), SENDER = uuid(2), FAN = uuid(3), OUTSIDER = uuid(4);
const VIDEO = 'https://res.cloudinary.com/zsxxjkqg/video/upload/v1700000000/voli/gifts/lion.mp4';

const one = async <T,>(db: PGlite, who: string, sql: string, params: unknown[] = []) =>
  (await asUser(db, who, () => db.query<{ r: T }>(sql, params))).rows[0]?.r as T;
const hintOf = async (p: Promise<unknown>) => { try { await p; return 'ok'; } catch (e) { return (e as { hint?: string }).hint ?? String(e); } };
const pid = async (db: PGlite, who: string) =>
  (await db.query<{ p: number }>('select public_id as p from public.profiles where auth_id = $1', [who])).rows[0]!.p;
const send = (db: PGlite, who: string, room: string, gift: string, qty: number, to: string[]) =>
  one<number>(db, who, 'select public.send_room_gift($1, $2, $3, $4::uuid[])::int as r', [room, gift, qty, `{${to.join(',')}}`]);
const shows = (db: PGlite, who: string, room: string, after: number | null = null) =>
  asUser(db, who, () => db.query<{ id: number; sender_id: string; gift_key: string; video_url: string; quantity: number; recipients: number }>(
    'select id::int as id, sender_id, gift_key, gift_name, video_url, quantity, recipients from public.room_gift_shows_since($1, $2)', [room, after])).then((r) => r.rows);

describe('video gifts', () => {
  let db: PGlite;
  let room: string;
  beforeAll(async () => {
    db = await supabaseLike();
    await db.exec('alter table auth.users add column email text; alter table auth.users add column banned_until timestamptz;');
    for (const f of files) await db.exec(f);
    await db.exec(files.at(-1)!); // safe to run again
    for (let i = 1; i <= 4; i++) await addUser(db, uuid(i), `عضو ${i}`);
    await db.query("select public.admin_set_role($1, 'admin')", [await pid(db, ADMIN)]);
    await db.query('select public.admin_add_coins($1, 1000000)', [await pid(db, SENDER)]);
    room = await one<string>(db, ADMIN, "select public.start_party('روم', null, 'audio', 10, 'default', 'أهلاً', null) as r");
    await one(db, SENDER, 'select public.enter_room($1) as r', [room]);
    await one(db, FAN, 'select public.enter_room($1) as r', [room]);
  }, 30000);
  afterAll(async () => { await db.close(); });

  it('only management can set a gift video, and only a Voli Cloudinary video link', async () => {
    expect(await hintOf(one(db, SENDER, 'select public.admin_set_gift_video($1, $2) as r', ['lion', VIDEO]))).toBe('not_admin');
    expect(await hintOf(one(db, ADMIN, 'select public.admin_set_gift_video($1, $2) as r', ['lion', 'https://evil.example.com/x.mp4']))).toBe('bad_video');
    expect(await hintOf(one(db, ADMIN, 'select public.admin_set_gift_video($1, $2) as r', ['lion', 'https://res.cloudinary.com/zsxxjkqg/image/upload/v1/x.png']))).toBe('bad_video');
    expect(await hintOf(one(db, ADMIN, 'select public.admin_set_gift_video($1, $2) as r', ['nope', VIDEO]))).toBe('not_found');
    expect(await hintOf(one(db, ADMIN, 'select public.admin_set_gift_video($1, $2) as r', ['lion', VIDEO]))).toBe('ok');
    const list = await asUser(db, ADMIN, () => db.query<{ video_url: string | null }>("select video_url from public.admin_gifts() where key = 'lion'"));
    expect(list.rows[0]!.video_url).toBe(VIDEO);
  });

  it('members read the video link in the gift list but cannot change it', async () => {
    const r = await asUser(db, FAN, () => db.query<{ video_url: string }>("select video_url from public.room_gift_catalog where key = 'lion'"));
    expect(r.rows[0]!.video_url).toBe(VIDEO);
    await expect(asUser(db, FAN, () => db.query("update public.room_gift_catalog set video_url = null where key = 'lion'"))).rejects.toThrow();
  });

  it('a video gift sent to two people shows once to everyone inside the room', async () => {
    await send(db, SENDER, room, 'lion', 2, [ADMIN, FAN]);
    for (const who of [ADMIN, SENDER, FAN]) {
      const rows = await shows(db, who, room);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ sender_id: SENDER, gift_key: 'lion', gift_name: 'الأسد الذهبي', video_url: VIDEO, quantity: 2, recipients: 2 });
    }
  });

  it('gifts without a video add nothing to play', async () => {
    const before = (await shows(db, FAN, room)).length;
    await send(db, SENDER, room, 'rose', 1, [FAN]);
    expect(await shows(db, FAN, room)).toHaveLength(before);
  });

  it('people outside the room see nothing, and nobody reads the table directly', async () => {
    expect(await shows(db, OUTSIDER, room)).toHaveLength(0);
    expect(await hintOf(one(db, FAN, 'select count(*) as r from public.room_gift_shows'))).not.toBe('ok');
  });

  it('reading after the last seen one returns only newer videos', async () => {
    const [first] = await shows(db, FAN, room);
    expect(await shows(db, FAN, room, first!.id)).toHaveLength(0);
    await send(db, SENDER, room, 'lion', 1, [FAN]);
    expect(await shows(db, FAN, room, first!.id)).toHaveLength(1);
  });

  it('removing the video brings the gift back to picture only', async () => {
    expect(await hintOf(one(db, ADMIN, 'select public.admin_set_gift_video($1, $2) as r', ['lion', null]))).toBe('ok');
    const before = (await shows(db, FAN, room)).length;
    await send(db, SENDER, room, 'lion', 1, [FAN]);
    expect(await shows(db, FAN, room)).toHaveLength(before);
  });
});

describe('which video gifts play', () => {
  const row = (id: number) => ({ id, sender_id: 'a', gift_key: 'lion', gift_name: 'الأسد الذهبي', video_url: VIDEO, quantity: 1, recipients: 1 });
  it('on entering the room, videos sent earlier do not play', () => {
    expect(nextGiftShows(null, [row(4), row(5)])).toEqual({ cursor: 5, play: [] });
    expect(nextGiftShows(null, [])).toEqual({ cursor: 0, play: [] });
  });
  it('after that, each new video plays once, in order', () => {
    const r = nextGiftShows(5, [row(6), row(7)]);
    expect(r.cursor).toBe(7);
    expect(r.play.map((x) => x.id)).toEqual([6, 7]);
    expect(nextGiftShows(7, [row(7)]).play).toEqual([]);
  });
});
