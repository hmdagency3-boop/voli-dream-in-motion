-- Fixture: first published version of sql/voli-starter.sql, used to test upgrading an existing project.
-- voli starter schema: run once in your external project's SQL Editor.
-- Auth UUID identifies ownership; private.account_uids.uid is a separate internal sequence.
begin;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create table private.account_uids (
  auth_id uuid primary key references auth.users(id) on delete cascade,
  uid bigint generated always as identity unique not null
);
revoke all on private.account_uids from public, anon, authenticated;
grant all on private.account_uids to service_role;
grant usage, select on all sequences in schema private to service_role;
alter table private.account_uids enable row level security;

create table public.profiles (
  auth_id uuid primary key references auth.users(id) on delete cascade,
  public_id integer unique not null check (public_id between 1000000 and 9999999),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 60),
  avatar_url text,
  created_at timestamptz not null default now()
);
grant select on public.profiles to authenticated;
grant update (display_name, avatar_url) on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy profiles_read on public.profiles for select to authenticated using (true);
create policy profiles_edit_own on public.profiles for update to authenticated using (auth.uid() = auth_id) with check (auth.uid() = auth_id);

create function private.create_account() returns trigger
language plpgsql security definer set search_path = '' as $$
declare candidate integer; attempts integer := 0;
begin
  insert into private.account_uids(auth_id) values(new.id);
  loop
    attempts := attempts + 1;
    if attempts > 100 then raise exception 'Public ID allocation unavailable'; end if;
    candidate := 1000000 + floor(random() * 9000000)::integer;
    begin
      insert into public.profiles(auth_id, public_id, display_name)
      values (new.id, candidate, coalesce(nullif(btrim(new.raw_user_meta_data->>'display_name'), ''), 'مستخدم'));
      exit;
    exception when unique_violation then
      -- Retry only a public-ID collision; all other constraints must fail.
      if exists (select 1 from public.profiles where auth_id = new.id) then raise; end if;
    end;
  end loop;
  return new;
end;
$$;
revoke all on function private.create_account() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.create_account();

create table public.follows (
  follower_id uuid not null references public.profiles(auth_id) on delete cascade,
  following_id uuid not null references public.profiles(auth_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);
grant select, insert, delete on public.follows to authenticated;
grant all on public.follows to service_role;
alter table public.follows enable row level security;
create policy follows_read on public.follows for select to authenticated using (true);
create policy follows_add on public.follows for insert to authenticated with check (auth.uid() = follower_id);
create policy follows_remove on public.follows for delete to authenticated using (auth.uid() = follower_id);
create index follows_following_idx on public.follows(following_id);

-- Metadata only: this table does not supply a live-video streaming service.
create table public.streams (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles(auth_id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  category text not null check (category in ('غناء', 'ألعاب', 'دردشة', 'DJ', 'كوميديا', 'رقص')),
  status text not null default 'draft' check (status in ('draft', 'live', 'ended')),
  cover_url text,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.streams to authenticated;
grant all on public.streams to service_role;
alter table public.streams enable row level security;
create policy streams_read on public.streams for select to authenticated using (status = 'live' or auth.uid() = host_id);
create policy streams_create on public.streams for insert to authenticated with check (auth.uid() = host_id);
create policy streams_edit on public.streams for update to authenticated using (auth.uid() = host_id) with check (auth.uid() = host_id);
create policy streams_remove on public.streams for delete to authenticated using (auth.uid() = host_id);
create index streams_host_idx on public.streams(host_id);
create index streams_live_idx on public.streams(category) where status = 'live';

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(auth_id) on delete cascade,
  recipient_id uuid not null references public.profiles(auth_id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  check (sender_id <> recipient_id)
);
grant select on public.messages to authenticated;
grant insert (sender_id, recipient_id, body) on public.messages to authenticated;
grant update (read_at) on public.messages to authenticated;
grant all on public.messages to service_role;
alter table public.messages enable row level security;
create policy messages_read on public.messages for select to authenticated using (auth.uid() in (sender_id, recipient_id));
create policy messages_send on public.messages for insert to authenticated with check (auth.uid() = sender_id and read_at is null);
create policy messages_mark_read on public.messages for update to authenticated using (auth.uid() = recipient_id) with check (auth.uid() = recipient_id);
create index messages_sender_idx on public.messages(sender_id, created_at desc);
create index messages_recipient_idx on public.messages(recipient_id, created_at desc);
commit;
