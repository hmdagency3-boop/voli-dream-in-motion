-- Previous installed device-ban schema and RPC return shape.
create table public.device_visits (
  id bigserial primary key, auth_id uuid references auth.users(id) on delete set null,
  device_id text not null, ip inet, country text, user_agent text, platform text,
  model text, brand text, os_version text, connection text,
  created_at timestamptz not null default now()
);
revoke all on public.device_visits from anon, authenticated;
grant all on public.device_visits to service_role;
alter table public.device_visits enable row level security;
create table public.device_bans (
  id bigserial primary key, kind text not null check (kind in ('ip','network','device')),
  net cidr, device_id text, reason text, until timestamptz, created_by uuid,
  created_at timestamptz not null default now(),
  check ((kind = 'device') = (device_id is not null)),
  check ((kind <> 'device') = (net is not null))
);
revoke all on public.device_bans from anon, authenticated;
grant all on public.device_bans to service_role;
alter table public.device_bans enable row level security;
create function public.device_check_in(text,text,text,text,text,text,text,text,text)
returns table(banned boolean, kind text, until timestamptz, reason text)
language sql as $$ select true, b.kind, b.until, b.reason from public.device_bans b where false $$;
insert into public.device_bans(kind, device_id, reason) values ('device', 'old-phone', 'حظر سابق');