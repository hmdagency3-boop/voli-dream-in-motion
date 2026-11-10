import { PGlite } from '@electric-sql/pglite';

/** Minimal Supabase stand-in, including its default grants of every new public table to app roles. */
export async function supabaseLike() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth;
    create table auth.users(id uuid primary key, raw_user_meta_data jsonb, created_at timestamptz not null default clock_timestamp());
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
    grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;`);
  return db;
}

export const addUser = (db: PGlite, id: string, name: string) =>
  db.query(`insert into auth.users(id, raw_user_meta_data) values ($1, jsonb_build_object('display_name', $2::text))`, [id, name]);

export async function asUser<T>(db: PGlite, id: string, run: () => Promise<T>) {
  await db.exec(`set role authenticated; set request.jwt.claim.sub = '${id}'`);
  try { return await run(); } finally { await db.exec('reset role'); }
}
