-- voli update 015: member devices (IP, phone brand/model, network) + bans by IP, whole network, or device.
-- Run once in the SQL Editor AFTER supabase/009_admin.sql. Safe to run again.
--
-- The Voli app reports its device on every sign-in / app open:
--   select public.voli_report_device(p_device_id, p_brand, p_model, p_os, p_network, p_carrier);
-- Request-header IP takes priority; a client-reported IP is used only when it is unavailable.
-- Client IP is untrusted (not hardware/network attestation). Pass it as the seventh argument.
-- The function returns the matching ban (or null) so the app can block a banned phone, IP or network.
--   Network bans are an IP range (e.g. 185.12.0.0/16) or the carrier / ISP name the app reports.
begin;

create table if not exists public.member_devices (
  id uuid primary key default gen_random_uuid(),
  auth_id uuid not null,
  device_id text not null,
  ip inet,
  brand text, model text, os text,
  network text,   -- 'wifi' / 'cellular' / ...
  carrier text,   -- operator or ISP name
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  unique (auth_id, device_id)
);
create index if not exists member_devices_ip on public.member_devices(ip);
create index if not exists member_devices_device on public.member_devices(device_id);
grant all on public.member_devices to service_role;
alter table public.member_devices enable row level security;  -- no policies: only the functions below read it

create table if not exists public.device_bans (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('ip', 'network', 'device')),
  value text not null,
  reason text,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (kind, value)
);
grant all on public.device_bans to service_role;
alter table public.device_bans enable row level security;

-- Request IP (first x-forwarded-for hop), null when unknown.
create or replace function public.voli_request_ip() returns inet
language plpgsql stable security definer set search_path = '' as $$
declare h json; raw text;
begin
  begin h := current_setting('request.headers', true)::json; exception when others then return null; end;
  raw := btrim(split_part(coalesce(h->>'x-forwarded-for', h->>'x-real-ip', h->>'cf-connecting-ip', ''), ',', 1));
  begin return nullif(raw, '')::inet; exception when others then return null; end;
end; $$;
revoke all on function public.voli_request_ip() from public, anon, authenticated;

-- Matching ban for an IP / device / carrier, or null.
create or replace function public.voli_find_device_ban(p_ip inet, p_device text, p_carrier text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('kind', b.kind, 'value', b.value, 'reason', b.reason)
  from public.device_bans b
  where (b.kind = 'ip' and p_ip is not null and b.value = host(p_ip))
     or (b.kind = 'device' and b.value = p_device)
     or (b.kind = 'network' and (
           (b.value ~ '/' and p_ip is not null and p_ip <<= (b.value)::cidr)
        or (b.value !~ '/' and p_carrier is not null and lower(b.value) = lower(p_carrier))))
  limit 1;
$$;
revoke all on function public.voli_find_device_ban(inet, text, text) from public, anon, authenticated;

-- Called by the Voli app (signed-in member).
-- No defaults on this overload: a default seventh argument makes six-argument calls ambiguous.
create or replace function public.voli_report_device(p_device_id text, p_brand text, p_model text,
  p_os text, p_network text, p_carrier text, p_client_ip text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); ip inet := public.voli_request_ip(); d text := left(btrim(coalesce(p_device_id, '')), 200);
begin
  if me is null then raise exception 'Not signed in' using errcode = 'P0001', hint = 'not_signed_in'; end if;
  if d = '' then raise exception 'Missing device' using errcode = 'P0001', hint = 'bad_device'; end if;
  if ip is null then
    begin ip := nullif(btrim(p_client_ip), '')::inet;
    exception when invalid_text_representation then ip := null; end;
  end if;
  insert into public.member_devices(auth_id, device_id, ip, brand, model, os, network, carrier)
    values (me, d, ip, left(p_brand, 80), left(p_model, 80), left(p_os, 80), left(p_network, 40), left(p_carrier, 80))
  on conflict (auth_id, device_id) do update set ip = coalesce(excluded.ip, member_devices.ip),
    brand = coalesce(excluded.brand, member_devices.brand), model = coalesce(excluded.model, member_devices.model),
    os = coalesce(excluded.os, member_devices.os), network = coalesce(excluded.network, member_devices.network),
    carrier = coalesce(excluded.carrier, member_devices.carrier), last_seen = now();
  return public.voli_find_device_ban(ip, d, p_carrier);
end; $$;
revoke all on function public.voli_report_device(text, text, text, text, text, text, text) from public, anon;
grant execute on function public.voli_report_device(text, text, text, text, text, text, text) to authenticated;

-- Preserve the original signature and its defaults for existing SQL/RPC callers.
create or replace function public.voli_report_device(p_device_id text, p_brand text default null, p_model text default null,
  p_os text default null, p_network text default null, p_carrier text default null) returns jsonb
language sql security definer set search_path = '' as $$
  select public.voli_report_device(p_device_id, p_brand, p_model, p_os, p_network, p_carrier, null::text);
$$;
revoke all on function public.voli_report_device(text, text, text, text, text, text) from public, anon;
grant execute on function public.voli_report_device(text, text, text, text, text, text) to authenticated;

-- ---------- Panel functions ----------
create or replace function public.admin_list_devices(p_q text default null, p_limit integer default 50, p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare me uuid := public.admin_guard(); q text := nullif(btrim(coalesce(p_q, '')), ''); res jsonb;
begin
  with f as (
    select d.*, p.display_name, p.public_id,
      public.voli_find_device_ban(d.ip, d.device_id, d.carrier) as ban
    from public.member_devices d left join public.profiles p on p.auth_id = d.auth_id
    where q is null or host(d.ip) like q || '%' or d.device_id ilike '%' || q || '%' or d.model ilike '%' || q || '%'
       or d.brand ilike '%' || q || '%' or d.carrier ilike '%' || q || '%' or p.display_name ilike '%' || q || '%'
       or p.public_id::text = q
  )
  select jsonb_build_object('total', (select count(*) from f),
    'rows', coalesce((select jsonb_agg(to_jsonb(x) - 'ip' || jsonb_build_object('ip', host(x.ip)) order by x.last_seen desc)
      from (select * from f order by last_seen desc limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0)) x), '[]'))
  into res;
  return res;
end; $$;
revoke all on function public.admin_list_devices(text, integer, integer) from public, anon;
grant execute on function public.admin_list_devices(text, integer, integer) to authenticated;

create or replace function public.admin_list_device_bans() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := public.admin_guard();
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'kind', b.kind, 'value', b.value, 'reason', b.reason,
      'created_at', b.created_at, 'by_name', p.display_name) order by b.created_at desc)
    from public.device_bans b left join public.profiles p on p.auth_id = b.created_by), '[]');
end; $$;
revoke all on function public.admin_list_device_bans() from public, anon;
grant execute on function public.admin_list_device_bans() to authenticated;

create or replace function public.admin_device_ban(p_kind text, p_value text, p_reason text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.admin_guard(); v text := btrim(coalesce(p_value, '')); bid uuid;
begin
  if p_kind not in ('ip', 'network', 'device') then raise exception 'Bad kind' using errcode = 'P0001', hint = 'bad_kind'; end if;
  if v = '' then raise exception 'Missing value' using errcode = 'P0001', hint = 'bad_value'; end if;
  begin
    if p_kind = 'ip' then v := host(v::inet); end if;
    if p_kind = 'network' and v ~ '/' then v := (v::cidr)::text; end if;
  exception when others then raise exception 'Bad address' using errcode = 'P0001', hint = 'bad_address'; end;
  insert into public.device_bans(kind, value, reason, created_by)
    values (p_kind, v, nullif(left(btrim(coalesce(p_reason, '')), 200), ''), me)
  on conflict (kind, value) do update set reason = excluded.reason
  returning id into bid;
  perform public.admin_log(me, 'device_ban', null, jsonb_build_object('kind', p_kind, 'value', v));
  return bid;
end; $$;
revoke all on function public.admin_device_ban(text, text, text) from public, anon;
grant execute on function public.admin_device_ban(text, text, text) to authenticated;

create or replace function public.admin_device_unban(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.admin_guard(); b public.device_bans;
begin
  delete from public.device_bans where id = p_id returning * into b;
  if b.id is not null then
    perform public.admin_log(me, 'device_unban', null, jsonb_build_object('kind', b.kind, 'value', b.value));
  end if;
end; $$;
revoke all on function public.admin_device_unban(uuid) from public, anon;
grant execute on function public.admin_device_unban(uuid) to authenticated;

commit;
