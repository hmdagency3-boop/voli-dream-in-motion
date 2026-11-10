-- voli update 008: agencies (نظام الوكالات).
-- Run AFTER supabase/007_room_ranking.sql. Safe to run again.
--
-- Who is who:
--   الوكيل (agent)  -> owns one agency. Applies in the app with a few details; the management approves
--                      and the agency gets the next code automatically (200, 201, 202 …).
--   المضيف (host)   -> a member who joined an agency. A host searches the agency code, sends a join
--                      request, and the agent accepts or rejects it. One agency at a time.
-- A host's income (diamonds = value of gifts received, from public.room_coins) counts for the agency
-- only while the host is an active member: gifts before joining or after leaving never count.
-- The agent is a host of their own agency too, so their own gifts count.
--
-- Admin (SQL Editor):
--   select * from public.agency_applications where status = 'pending';          -- waiting requests
--   select public.admin_review_agency_application('<application id>', true);    -- approve -> returns the code
--   select public.admin_review_agency_application('<application id>', false, 'السبب');  -- reject
--   update public.agencies set commission_percent = 10 where code = 200;          -- agency share (%)
-- Members with the admin role (public.admin_set_role, 003_vip.sql) can also review inside the app.
-- The agency share is empty until it is set: the app policy will decide it.

-- ---------- 1) Agencies ----------
create sequence if not exists public.agency_code_seq start with 200 minvalue 200;
revoke all on sequence public.agency_code_seq from public, anon, authenticated;

create table if not exists public.agencies (
  id uuid primary key default gen_random_uuid(),
  code integer unique not null check (code >= 200),
  owner_id uuid unique not null references public.profiles(auth_id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 40),
  commission_percent numeric(5,2) check (commission_percent is null or commission_percent between 0 and 100),
  created_at timestamptz not null default clock_timestamp()
);
revoke all on public.agencies from public, anon, authenticated;
grant select on public.agencies to authenticated;
grant all on public.agencies to service_role;
alter table public.agencies enable row level security;
drop policy if exists agencies_read on public.agencies;
create policy agencies_read on public.agencies for select to authenticated using (true);

-- ---------- 2) Requests to open an agency ----------
create table if not exists public.agency_applications (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid not null references public.profiles(auth_id) on delete cascade,
  agency_name text not null check (char_length(btrim(agency_name)) between 2 and 40),
  full_name text not null check (char_length(btrim(full_name)) between 2 and 60),
  phone text not null check (phone ~ '^\+?[0-9]{7,15}$'),
  country text not null check (char_length(btrim(country)) between 2 and 40),
  note text check (note is null or char_length(note) <= 300),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reject_reason text check (reject_reason is null or char_length(reject_reason) <= 200),
  agency_id uuid references public.agencies(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  reviewed_at timestamptz,
  reviewed_by uuid
);
create unique index if not exists agency_applications_one_pending on public.agency_applications(applicant_id) where status = 'pending';
revoke all on public.agency_applications from public, anon, authenticated;
grant select on public.agency_applications to authenticated;
grant all on public.agency_applications to service_role;
alter table public.agency_applications enable row level security;
drop policy if exists agency_applications_read_own on public.agency_applications;
create policy agency_applications_read_own on public.agency_applications for select to authenticated using (applicant_id = auth.uid());

-- ---------- 3) Hosts inside an agency (one row per stay, kept after leaving) ----------
create table if not exists public.agency_members (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  host_id uuid not null references public.profiles(auth_id) on delete cascade,
  joined_at timestamptz not null default clock_timestamp(),
  left_at timestamptz,
  left_reason text check (left_reason is null or left_reason in ('removed', 'left'))
);
create unique index if not exists agency_members_one_active on public.agency_members(host_id) where left_at is null;
create index if not exists agency_members_agency_idx on public.agency_members(agency_id);

-- Is this member the agent of that agency?
create or replace function public.is_agency_owner(p_agency uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.agencies where id = p_agency and owner_id = p_user)
$$;
revoke all on function public.is_agency_owner(uuid, uuid) from public, anon;
grant execute on function public.is_agency_owner(uuid, uuid) to authenticated;

revoke all on public.agency_members from public, anon, authenticated;
grant select on public.agency_members to authenticated;
grant all on public.agency_members to service_role;
alter table public.agency_members enable row level security;
drop policy if exists agency_members_read on public.agency_members;
create policy agency_members_read on public.agency_members for select to authenticated
  using (host_id = auth.uid() or public.is_agency_owner(agency_id, auth.uid()));

-- ---------- 4) Requests from hosts to join ----------
create table if not exists public.agency_join_requests (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  host_id uuid not null references public.profiles(auth_id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'cancelled')),
  created_at timestamptz not null default clock_timestamp(),
  decided_at timestamptz
);
create unique index if not exists agency_join_requests_one_pending on public.agency_join_requests(host_id) where status = 'pending';
create index if not exists agency_join_requests_agency_idx on public.agency_join_requests(agency_id, created_at);
revoke all on public.agency_join_requests from public, anon, authenticated;
grant select on public.agency_join_requests to authenticated;
grant all on public.agency_join_requests to service_role;
alter table public.agency_join_requests enable row level security;
drop policy if exists agency_join_requests_read on public.agency_join_requests;
create policy agency_join_requests_read on public.agency_join_requests for select to authenticated
  using (host_id = auth.uid() or public.is_agency_owner(agency_id, auth.uid()));

-- Every change below goes through these functions. Errors carry a hint:
--   not_signed_in, bad_input, already_agent, in_agency, pending_exists, no_agency,
--   not_owner, not_pending, is_agent, not_admin, not_found, bad_range

-- ---------- 5) Apply to open an agency ----------
create or replace function public.apply_for_agency(p_agency_name text, p_full_name text, p_phone text, p_country text, p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); new_id uuid;
begin
  if me is null then raise exception 'Not signed in' using errcode = 'P0001', hint = 'not_signed_in'; end if;
  if exists (select 1 from public.agencies where owner_id = me) then
    raise exception 'Already an agent' using errcode = 'P0001', hint = 'already_agent';
  end if;
  if exists (select 1 from public.agency_members where host_id = me and left_at is null) then
    raise exception 'Already inside an agency' using errcode = 'P0001', hint = 'in_agency';
  end if;
  if exists (select 1 from public.agency_applications where applicant_id = me and status = 'pending') then
    raise exception 'A request is already waiting' using errcode = 'P0001', hint = 'pending_exists';
  end if;
  begin
    insert into public.agency_applications(applicant_id, agency_name, full_name, phone, country, note)
    values (me, btrim(p_agency_name), btrim(p_full_name), regexp_replace(coalesce(p_phone, ''), '[\s-]', '', 'g'),
            btrim(p_country), nullif(btrim(coalesce(p_note, '')), ''))
    returning id into new_id;
  exception
    when check_violation or not_null_violation then raise exception 'Bad details' using errcode = 'P0001', hint = 'bad_input';
    when unique_violation then raise exception 'A request is already waiting' using errcode = 'P0001', hint = 'pending_exists';
  end;
  return new_id;
end;
$$;
revoke all on function public.apply_for_agency(text, text, text, text, text) from public, anon;
grant execute on function public.apply_for_agency(text, text, text, text, text) to authenticated;

-- ---------- 6) Review a request (management) ----------
-- Shared by the in-app review (admins) and the SQL Editor command. Not callable from the app directly.
create or replace function public.agency_review(p_id uuid, p_approve boolean, p_reason text, p_reviewer uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare app public.agency_applications; new_agency uuid; new_code integer;
begin
  select * into app from public.agency_applications where id = p_id for update;
  if not found then raise exception 'No such request' using errcode = 'P0001', hint = 'not_found'; end if;
  if app.status <> 'pending' then raise exception 'Already reviewed' using errcode = 'P0001', hint = 'not_pending'; end if;

  if not coalesce(p_approve, false) then
    update public.agency_applications
      set status = 'rejected', reject_reason = nullif(left(btrim(coalesce(p_reason, '')), 200), ''),
          reviewed_at = clock_timestamp(), reviewed_by = p_reviewer
      where id = p_id;
    return null;
  end if;

  if exists (select 1 from public.agencies where owner_id = app.applicant_id) then
    raise exception 'Already an agent' using errcode = 'P0001', hint = 'already_agent';
  end if;
  if exists (select 1 from public.agency_members where host_id = app.applicant_id and left_at is null) then
    raise exception 'The applicant joined another agency' using errcode = 'P0001', hint = 'in_agency';
  end if;

  new_code := nextval('public.agency_code_seq');
  insert into public.agencies(code, owner_id, name) values (new_code, app.applicant_id, app.agency_name)
    returning id into new_agency;
  -- The agent is the first host of their own agency.
  insert into public.agency_members(agency_id, host_id) values (new_agency, app.applicant_id);
  -- Join requests the new agent sent elsewhere are no longer needed.
  update public.agency_join_requests set status = 'cancelled', decided_at = clock_timestamp()
    where host_id = app.applicant_id and status = 'pending';
  update public.agency_applications
    set status = 'approved', agency_id = new_agency, reviewed_at = clock_timestamp(), reviewed_by = p_reviewer
    where id = p_id;
  return new_code;
end;
$$;
revoke all on function public.agency_review(uuid, boolean, text, uuid) from public, anon, authenticated;

-- In the app: only members with the admin role.
create or replace function public.review_agency_application(p_id uuid, p_approve boolean, p_reason text default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if me is null or not public.has_role(me, 'admin') then
    raise exception 'Management only' using errcode = 'P0001', hint = 'not_admin';
  end if;
  return public.agency_review(p_id, p_approve, p_reason, me);
end;
$$;
revoke all on function public.review_agency_application(uuid, boolean, text) from public, anon;
grant execute on function public.review_agency_application(uuid, boolean, text) to authenticated;

-- In the SQL Editor only.
create or replace function public.admin_review_agency_application(p_id uuid, p_approve boolean, p_reason text default null)
returns integer language sql security definer set search_path = '' as $$
  select public.agency_review(p_id, p_approve, p_reason, null)
$$;
revoke all on function public.admin_review_agency_application(uuid, boolean, text) from public, anon, authenticated;

-- The waiting (or past) requests, for admins in the app.
create or replace function public.admin_agency_applications(p_status text default 'pending')
returns table(id uuid, applicant_id uuid, agency_name text, full_name text, phone text, country text, note text,
              status text, reject_reason text, created_at timestamptz, code integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'admin') then
    raise exception 'Management only' using errcode = 'P0001', hint = 'not_admin';
  end if;
  return query
    select a.id, a.applicant_id, a.agency_name, a.full_name, a.phone, a.country, a.note, a.status, a.reject_reason,
           a.created_at, g.code
    from public.agency_applications a left join public.agencies g on g.id = a.agency_id
    where a.status = p_status
    order by a.created_at desc
    limit 200;
end;
$$;
revoke all on function public.admin_agency_applications(text) from public, anon;
grant execute on function public.admin_agency_applications(text) to authenticated;

-- ---------- 7) Find an agency by its code ----------
create or replace function public.find_agency(p_code integer)
returns table(id uuid, code integer, name text, owner_id uuid, members bigint)
language sql stable security definer set search_path = '' as $$
  select g.id, g.code, g.name, g.owner_id,
         (select count(*) from public.agency_members m where m.agency_id = g.id and m.left_at is null)
  from public.agencies g
  where g.code = p_code and auth.uid() is not null
$$;
revoke all on function public.find_agency(integer) from public, anon;
grant execute on function public.find_agency(integer) to authenticated;

-- ---------- 8) Host asks to join; agent decides ----------
create or replace function public.request_join_agency(p_agency uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); new_id uuid;
begin
  if me is null then raise exception 'Not signed in' using errcode = 'P0001', hint = 'not_signed_in'; end if;
  if not exists (select 1 from public.agencies where id = p_agency) then
    raise exception 'No such agency' using errcode = 'P0001', hint = 'no_agency';
  end if;
  if exists (select 1 from public.agencies where owner_id = me) then
    raise exception 'Agents cannot join another agency' using errcode = 'P0001', hint = 'already_agent';
  end if;
  if exists (select 1 from public.agency_members where host_id = me and left_at is null) then
    raise exception 'Already inside an agency' using errcode = 'P0001', hint = 'in_agency';
  end if;
  if exists (select 1 from public.agency_join_requests where host_id = me and status = 'pending') then
    raise exception 'A request is already waiting' using errcode = 'P0001', hint = 'pending_exists';
  end if;
  begin
    insert into public.agency_join_requests(agency_id, host_id) values (p_agency, me) returning id into new_id;
  exception when unique_violation then
    raise exception 'A request is already waiting' using errcode = 'P0001', hint = 'pending_exists';
  end;
  return new_id;
end;
$$;
revoke all on function public.request_join_agency(uuid) from public, anon;
grant execute on function public.request_join_agency(uuid) to authenticated;

create or replace function public.cancel_join_request(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.agency_join_requests set status = 'cancelled', decided_at = clock_timestamp()
    where id = p_id and host_id = auth.uid() and status = 'pending';
  if not found then raise exception 'Nothing to cancel' using errcode = 'P0001', hint = 'not_pending'; end if;
end;
$$;
revoke all on function public.cancel_join_request(uuid) from public, anon;
grant execute on function public.cancel_join_request(uuid) to authenticated;

create or replace function public.decide_join_request(p_id uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); req public.agency_join_requests;
begin
  select * into req from public.agency_join_requests where id = p_id for update;
  if not found or me is null or not public.is_agency_owner(req.agency_id, me) then
    raise exception 'Only the agent decides' using errcode = 'P0001', hint = 'not_owner';
  end if;
  if req.status <> 'pending' then raise exception 'Already decided' using errcode = 'P0001', hint = 'not_pending'; end if;

  if coalesce(p_accept, false) then
    if exists (select 1 from public.agencies where owner_id = req.host_id)
       or exists (select 1 from public.agency_members where host_id = req.host_id and left_at is null) then
      update public.agency_join_requests set status = 'cancelled', decided_at = clock_timestamp() where id = p_id;
      raise exception 'The host is already inside an agency' using errcode = 'P0001', hint = 'in_agency';
    end if;
    insert into public.agency_members(agency_id, host_id) values (req.agency_id, req.host_id);
    update public.agency_join_requests set status = 'accepted', decided_at = clock_timestamp() where id = p_id;
  else
    update public.agency_join_requests set status = 'rejected', decided_at = clock_timestamp() where id = p_id;
  end if;
end;
$$;
revoke all on function public.decide_join_request(uuid, boolean) from public, anon;
grant execute on function public.decide_join_request(uuid, boolean) to authenticated;

-- The agent removes a host. Their income stops counting for the agency from this moment.
create or replace function public.remove_agency_member(p_host uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); mine uuid;
begin
  select id into mine from public.agencies where owner_id = me;
  if me is null or mine is null then raise exception 'Only the agent removes' using errcode = 'P0001', hint = 'not_owner'; end if;
  if p_host = me then raise exception 'The agent stays in the agency' using errcode = 'P0001', hint = 'is_agent'; end if;
  update public.agency_members set left_at = clock_timestamp(), left_reason = 'removed'
    where agency_id = mine and host_id = p_host and left_at is null;
  if not found then raise exception 'Not a member' using errcode = 'P0001', hint = 'not_found'; end if;
end;
$$;
revoke all on function public.remove_agency_member(uuid) from public, anon;
grant execute on function public.remove_agency_member(uuid) to authenticated;

-- ---------- 9) Income (diamonds) ----------
-- Gift value a host received inside one membership stay, between two moments.
create or replace function public.agency_stay_income(p_host uuid, p_joined timestamptz, p_left timestamptz,
  p_from timestamptz, p_to timestamptz) returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(c.amount), 0)::bigint
  from public.room_coins c
  where c.recipient_id = p_host and c.gift_key is not null
    and c.created_at >= greatest(p_joined, p_from)
    and c.created_at < least(coalesce(p_left, 'infinity'::timestamptz), p_to)
$$;
revoke all on function public.agency_stay_income(uuid, timestamptz, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;

-- Start of a Cairo calendar day as a moment.
create or replace function public.cairo_day_start(p_day date) returns timestamptz
language sql immutable set search_path = '' as $$ select (p_day::timestamp at time zone 'Africa/Cairo') $$;
revoke all on function public.cairo_day_start(date) from public, anon, authenticated;

-- The agent: every host's income from p_from to p_to (Cairo days, both included, up to 62 days).
-- Hosts who left during the period still show what they made before leaving.
create or replace function public.agency_members_income(p_from date, p_to date)
returns table(host_id uuid, diamonds bigint, active boolean)
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := auth.uid(); mine uuid; t_from timestamptz; t_to timestamptz;
begin
  select id into mine from public.agencies where owner_id = me;
  if me is null or mine is null then raise exception 'Only the agent' using errcode = 'P0001', hint = 'not_owner'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 62 then
    raise exception 'Bad dates' using errcode = 'P0001', hint = 'bad_range';
  end if;
  t_from := public.cairo_day_start(p_from);
  t_to := public.cairo_day_start(p_to + 1);
  return query
    select m.host_id,
           sum(public.agency_stay_income(m.host_id, m.joined_at, m.left_at, t_from, t_to))::bigint,
           bool_or(m.left_at is null)
    from public.agency_members m
    where m.agency_id = mine and m.joined_at < t_to and coalesce(m.left_at, 'infinity'::timestamptz) > t_from
    group by m.host_id
    order by 2 desc, 1;
end;
$$;
revoke all on function public.agency_members_income(date, date) from public, anon;
grant execute on function public.agency_members_income(date, date) to authenticated;

-- The agent's front card: this week, last week (weeks start on Monday, Cairo time), share and size.
create or replace function public.agency_summary()
returns table(agency_id uuid, code integer, name text, commission_percent numeric, this_week bigint, last_week bigint,
              members bigint, pending_requests bigint)
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := auth.uid(); g public.agencies; wk timestamptz;
begin
  select * into g from public.agencies where owner_id = me;
  if me is null or g.id is null then raise exception 'Only the agent' using errcode = 'P0001', hint = 'not_owner'; end if;
  wk := date_trunc('week', now() at time zone 'Africa/Cairo') at time zone 'Africa/Cairo';
  return query select g.id, g.code, g.name, g.commission_percent,
    (select coalesce(sum(public.agency_stay_income(m.host_id, m.joined_at, m.left_at, wk, 'infinity')), 0)::bigint
       from public.agency_members m where m.agency_id = g.id),
    (select coalesce(sum(public.agency_stay_income(m.host_id, m.joined_at, m.left_at, wk - interval '7 days', wk)), 0)::bigint
       from public.agency_members m where m.agency_id = g.id),
    (select count(*) from public.agency_members m where m.agency_id = g.id and m.left_at is null),
    (select count(*) from public.agency_join_requests r where r.agency_id = g.id and r.status = 'pending');
end;
$$;
revoke all on function public.agency_summary() from public, anon;
grant execute on function public.agency_summary() to authenticated;

-- A host's own income per Cairo day, counted only while they were inside an agency.
create or replace function public.my_agency_income(p_from date, p_to date)
returns table(day date, diamonds bigint)
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Not signed in' using errcode = 'P0001', hint = 'not_signed_in'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 62 then
    raise exception 'Bad dates' using errcode = 'P0001', hint = 'bad_range';
  end if;
  return query
    select (c.created_at at time zone 'Africa/Cairo')::date, sum(c.amount)::bigint
    from public.room_coins c
    where c.recipient_id = me and c.gift_key is not null
      and c.created_at >= public.cairo_day_start(p_from) and c.created_at < public.cairo_day_start(p_to + 1)
      and exists (select 1 from public.agency_members m where m.host_id = me
                  and c.created_at >= m.joined_at and c.created_at < coalesce(m.left_at, 'infinity'::timestamptz))
    group by 1
    order by 1 desc;
end;
$$;
revoke all on function public.my_agency_income(date, date) from public, anon;
grant execute on function public.my_agency_income(date, date) to authenticated;
