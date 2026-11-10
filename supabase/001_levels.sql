-- Update 001: charisma and wealth levels. Run AFTER sql/voli-starter.sql. Safe to run more than once.
-- Two separate level systems, 100 levels each:
--   1) Charisma (الكاريزما) = total diamonds received from gifts.
--   2) Wealth   (الثروة)    = total coins spent supporting others.
begin;

-- ---------- Points columns on profiles ----------
-- Clients can read these but never change them (no update grant on these columns).
-- 1) Charisma points (الكاريزما)
alter table public.profiles add column if not exists charisma_points bigint not null default 0;
-- 2) Wealth points (الثروة)
alter table public.profiles add column if not exists wealth_points bigint not null default 0;

-- ---------- Level table (shared by both systems, separated by "kind") ----------
-- Total points needed to reach each level (1..100). Placeholder numbers: edit rows freely,
-- a re-run never overwrites existing rows.
create table if not exists public.level_thresholds (
  kind text not null check (kind in ('charisma', 'wealth')),
  level integer not null check (level between 1 and 100),
  required bigint not null check (required > 0),
  primary key (kind, level)
);

-- ---------- 1) Charisma levels (الكاريزما): 100 levels ----------
insert into public.level_thresholds(kind, level, required)
  select 'charisma', n, 1000::bigint * n * n from generate_series(1, 100) n
  on conflict (kind, level) do nothing;

-- ---------- 2) Wealth levels (الثروة): 100 levels ----------
insert into public.level_thresholds(kind, level, required)
  select 'wealth', n, 1000::bigint * n * n from generate_series(1, 100) n
  on conflict (kind, level) do nothing;

-- ---------- Access: members can read both level lists, nobody can edit them from the app ----------
revoke all on public.level_thresholds from public, anon, authenticated;
grant select on public.level_thresholds to authenticated;
grant all on public.level_thresholds to service_role;
alter table public.level_thresholds enable row level security;
drop policy if exists level_thresholds_read on public.level_thresholds;
create policy level_thresholds_read on public.level_thresholds for select to authenticated using (true);

commit;
