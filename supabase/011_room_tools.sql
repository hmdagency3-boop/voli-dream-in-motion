-- Voli 011: room tools. Run after 004_rooms.sql (and existing updates). Re-runnable.
create table if not exists public.room_admins (
 room_id uuid references public.rooms(id) on delete cascade not null,
 auth_id uuid references public.profiles(auth_id) on delete cascade not null,
 primary key(room_id, auth_id)
);
revoke all on public.room_admins from public, anon, authenticated;
grant all on public.room_admins to service_role;
alter table public.room_admins enable row level security;
create table if not exists public.room_seat_controls (
 room_id uuid references public.rooms(id) on delete cascade not null,
 seat_no int check(seat_no between 1 and 20) not null,
 locked boolean not null default false,
 muted boolean not null default false,
 primary key(room_id, seat_no)
);
revoke all on public.room_seat_controls from public, anon, authenticated;
grant all on public.room_seat_controls to service_role;
alter table public.room_seat_controls enable row level security;
create table if not exists public.room_tool_settings (
 room_id uuid primary key references public.rooms(id) on delete cascade,
 chat_enabled boolean not null default true,
 show_charisma boolean not null default true
);
revoke all on public.room_tool_settings from public, anon, authenticated;
grant all on public.room_tool_settings to service_role;
alter table public.room_tool_settings enable row level security;
create table if not exists public.room_seat_invites (
 room_id uuid references public.rooms(id) on delete cascade not null,
 auth_id uuid references public.profiles(auth_id) on delete cascade not null,
 seat_no int check(seat_no between 1 and 20) not null,
 invited_by uuid references public.profiles(auth_id) on delete cascade not null,
 expires_at timestamptz not null default now() + interval '2 minutes',
 primary key(room_id, auth_id)
);
revoke all on public.room_seat_invites from public, anon, authenticated;
grant all on public.room_seat_invites to service_role;
alter table public.room_seat_invites enable row level security;
create table if not exists public.room_blacklist (
 room_id uuid references public.rooms(id) on delete cascade not null,
 auth_id uuid references public.profiles(auth_id) on delete cascade not null,
 primary key(room_id, auth_id)
);
revoke all on public.room_blacklist from public, anon, authenticated;
grant all on public.room_blacklist to service_role;
alter table public.room_blacklist enable row level security;
create table if not exists public.room_impressions (
 room_id uuid references public.rooms(id) on delete cascade not null,
 auth_id uuid references public.profiles(auth_id) on delete cascade not null,
 body text not null check(char_length(body) between 1 and 300),
 updated_at timestamptz not null default now(),
 primary key(room_id, auth_id)
);
revoke all on public.room_impressions from public, anon, authenticated;
grant all on public.room_impressions to service_role;
alter table public.room_impressions enable row level security;

create or replace function public.is_room_manager(p_room uuid, p_user uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.rooms where id=p_room and owner_id=p_user)
 or exists(select 1 from public.room_admins where room_id=p_room and auth_id=p_user)
$$;
revoke all on function public.is_room_manager(uuid,uuid) from public, anon, authenticated;

create or replace function public.room_tools_state(p_room uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare me uuid:=auth.uid(); manager boolean; result jsonb;
begin
 if not public.in_room(p_room,me) then raise exception 'not_in_room'; end if;
 manager:=public.is_room_manager(p_room,me);
 select jsonb_build_object(
 'admins',coalesce((select jsonb_agg(auth_id) from public.room_admins where room_id=p_room),'[]'::jsonb),
 'controls',coalesce((select jsonb_agg(jsonb_build_object('seat_no',seat_no,'locked',locked,'muted',muted)) from public.room_seat_controls where room_id=p_room),'[]'::jsonb),
 'chat_enabled',coalesce((select chat_enabled from public.room_tool_settings where room_id=p_room),true),
 'show_charisma',coalesce((select show_charisma from public.room_tool_settings where room_id=p_room),true),
 'invite',(select jsonb_build_object('seat_no',seat_no,'invited_by',invited_by) from public.room_seat_invites where room_id=p_room and auth_id=me and expires_at>now()),
 'blacklist',case when manager then coalesce((select jsonb_agg(auth_id) from public.room_blacklist where room_id=p_room),'[]'::jsonb) else '[]'::jsonb end,
 'impressions',coalesce((select jsonb_agg(jsonb_build_object('auth_id',auth_id,'body',body)) from public.room_impressions where room_id=p_room),'[]'::jsonb)
 ) into result;
 return result;
end $$;
revoke all on function public.room_tools_state(uuid) from public,anon;
grant execute on function public.room_tools_state(uuid) to authenticated;

create or replace function public.manage_room(p_room uuid,p_action text,p_data jsonb default '{}'::jsonb) returns text
language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); r public.rooms; target uuid; n int; flag boolean; s text; manager boolean;
begin
 select * into r from public.rooms where id=p_room for update;
 if not found or not r.is_live then return 'not_live'; end if;
 if not public.in_room(p_room,me) then return 'not_in_room'; end if;
 manager:=public.is_room_manager(p_room,me);
 target:=nullif(p_data->>'target','')::uuid;
 n:=coalesce((p_data->>'seat')::int,0); flag:=coalesce((p_data->>'enabled')::boolean,false);
 if p_action='impression' then
  s:=btrim(coalesce(p_data->>'body','')); if char_length(s) not between 1 and 300 then return 'invalid'; end if;
  insert into public.room_impressions values(p_room,me,s,now()) on conflict(room_id,auth_id) do update set body=excluded.body,updated_at=now();
  return 'ok';
 end if;
 if p_action='decline_invite' then delete from public.room_seat_invites where room_id=p_room and auth_id=me; return 'ok'; end if;
 if p_action='accept_invite' then
  select seat_no into n from public.room_seat_invites where room_id=p_room and auth_id=me and expires_at>now();
  if n is null then return 'expired'; end if;
  s:=public.take_seat(p_room,n);
  if s='ok' then delete from public.room_seat_invites where room_id=p_room and auth_id=me; end if;
  return s;
 end if;
 if not manager then return 'not_allowed'; end if;
 if p_action='admin' then
  if me<>r.owner_id or target is null or target=r.owner_id then return 'not_allowed'; end if;
  if flag then
   if not public.in_room(p_room,target) then return 'not_in_room'; end if;
   insert into public.room_admins values(p_room,target) on conflict do nothing;
  else delete from public.room_admins where room_id=p_room and auth_id=target; end if;
 elsif p_action in ('seat_lock','seat_mute','invite','remove_seat') then
  if n<1 or n>r.seat_count then return 'no_seat'; end if;
  select auth_id into target from public.room_seats where room_id=p_room and seat_no=n;
  if target is not null and target<>me and (target=r.owner_id or public.has_role(target,'admin') or (me<>r.owner_id and public.is_room_manager(p_room,target))) then return 'not_allowed'; end if;
  if p_action='remove_seat' then delete from public.room_seats where room_id=p_room and seat_no=n;
  elsif p_action='invite' then
   target:=nullif(p_data->>'target','')::uuid;
   if not public.in_room(p_room,target) then return 'not_in_room'; end if;
   if exists(select 1 from public.room_seats where room_id=p_room and seat_no=n) then return 'taken'; end if;
   if exists(select 1 from public.room_seat_controls where room_id=p_room and seat_no=n and locked) then return 'locked'; end if;
   insert into public.room_seat_invites values(p_room,target,n,me,now()+interval '2 minutes') on conflict(room_id,auth_id) do update set seat_no=n,invited_by=me,expires_at=excluded.expires_at;
  else
   insert into public.room_seat_controls(room_id,seat_no) values(p_room,n) on conflict do nothing;
   if p_action='seat_lock' then update public.room_seat_controls set locked=flag where room_id=p_room and seat_no=n;
   else update public.room_seat_controls set muted=flag where room_id=p_room and seat_no=n; end if;
  end if;
 elsif p_action in ('blacklist','unblacklist') then
  if target is null or target=me or target=r.owner_id or public.has_role(target,'admin') or (me<>r.owner_id and public.is_room_manager(p_room,target)) then return 'not_allowed'; end if;
  if p_action='blacklist' then
   insert into public.room_blacklist values(p_room,target) on conflict do nothing;
   delete from public.room_seats where room_id=p_room and auth_id=target;
   delete from public.room_members where room_id=p_room and auth_id=target;
  else delete from public.room_blacklist where room_id=p_room and auth_id=target; end if;
 elsif p_action in ('chat','charisma') then
  insert into public.room_tool_settings(room_id) values(p_room) on conflict do nothing;
  if p_action='chat' then update public.room_tool_settings set chat_enabled=flag where room_id=p_room;
  else update public.room_tool_settings set show_charisma=flag where room_id=p_room; end if;
 elsif p_action='settings' then
  -- Only the owner may change the room identity, seats, theme or password.
  if me<>r.owner_id then return 'not_allowed'; end if;
  update public.rooms set name=coalesce(p_data->>'name',name),cover_url=case when p_data ? 'cover_url' then nullif(p_data->>'cover_url','') else cover_url end,
   seat_count=coalesce((p_data->>'seat_count')::smallint,seat_count),theme=coalesce(p_data->>'theme',theme),announcement=coalesce(p_data->>'announcement',announcement) where id=p_room;
  delete from public.room_seats where room_id=p_room and seat_no>(select seat_count from public.rooms where id=p_room);
  delete from public.room_seat_controls where room_id=p_room and seat_no>(select seat_count from public.rooms where id=p_room);
  if p_data ? 'password' then
   s:=p_data->>'password';
   if s='' then delete from public.room_secrets where room_id=p_room; update public.rooms set locked=false where id=p_room;
   elsif s ~ '^[0-9]{4,8}$' then
    s:=md5(random()::text||clock_timestamp()::text);
    insert into public.room_secrets values(p_room,s,public.room_hash(s,p_data->>'password')) on conflict(room_id) do update set salt=excluded.salt,hash=excluded.hash;
    update public.rooms set locked=true where id=p_room;
   else raise exception 'bad_password'; end if;
  end if;
 elsif p_action='announcement' then update public.rooms set announcement=coalesce(p_data->>'body','') where id=p_room;
 else return 'invalid'; end if;
 return 'ok';
end $$;
revoke all on function public.manage_room(uuid,text,jsonb) from public,anon;
grant execute on function public.manage_room(uuid,text,jsonb) to authenticated;

create or replace function public.take_seat(p_room uuid,p_seat int) returns text
language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); n int;
begin
 select seat_count into n from public.rooms where id=p_room and is_live for update;
 if not public.in_room(p_room,me) then return 'not_in_room'; end if;
 if n is null or p_seat<1 or p_seat>n then return 'no_seat'; end if;
 if exists(select 1 from public.room_seat_controls where room_id=p_room and seat_no=p_seat and locked) then return 'locked'; end if;
 if exists(select 1 from public.room_seats where room_id=p_room and seat_no=p_seat) then
  return case when exists(select 1 from public.room_seats where room_id=p_room and seat_no=p_seat and auth_id=me) then 'ok' else 'taken' end;
 end if;
 delete from public.room_seats where room_id=p_room and auth_id=me;
 insert into public.room_seats(room_id,seat_no,auth_id) values(p_room,p_seat,me);
 return 'ok';
end $$;
revoke all on function public.take_seat(uuid,int) from public,anon;
grant execute on function public.take_seat(uuid,int) to authenticated;

-- Extend existing entry/message/kick functions without duplicating the original room rules.
do $$ begin
 if to_regprocedure('public.enter_room_before_tools(uuid,text)') is null then alter function public.enter_room(uuid,text) rename to enter_room_before_tools; end if;
 if to_regprocedure('public.send_room_message_before_tools(uuid,text)') is null then alter function public.send_room_message(uuid,text) rename to send_room_message_before_tools; end if;
 if to_regprocedure('public.kick_from_room_before_tools(uuid,uuid)') is null then alter function public.kick_from_room(uuid,uuid) rename to kick_from_room_before_tools; end if;
end $$;
revoke all on function public.enter_room_before_tools(uuid,text),public.send_room_message_before_tools(uuid,text),public.kick_from_room_before_tools(uuid,uuid) from public,anon,authenticated;
create or replace function public.enter_room(p_room uuid,p_password text default null) returns text
language plpgsql security definer set search_path='' as $$ begin
 if exists(select 1 from public.room_blacklist where room_id=p_room and auth_id=auth.uid()) then return 'kicked'; end if;
 return public.enter_room_before_tools(p_room,p_password);
end $$;
create or replace function public.send_room_message(p_room uuid,p_body text) returns text
language plpgsql security definer set search_path='' as $$ begin
 if not public.in_room(p_room,auth.uid()) then return 'not_in_room'; end if;
 if exists(select 1 from public.room_tool_settings where room_id=p_room and not chat_enabled) then return 'chat_disabled'; end if;
 return public.send_room_message_before_tools(p_room,p_body);
end $$;
create or replace function public.kick_from_room(p_room uuid,p_target uuid) returns text
language plpgsql security definer set search_path='' as $$ declare me uuid:=auth.uid(); owner uuid; begin
 if not public.in_room(p_room,me) then return 'not_in_room'; end if;
 select owner_id into owner from public.rooms where id=p_room;
 if p_target=me or p_target=owner or public.has_role(p_target,'admin') then return 'not_allowed'; end if;
 if me<>owner and public.is_room_manager(p_room,p_target) then return 'not_allowed'; end if;
 if public.is_room_manager(p_room,me) then
  delete from public.room_seats where room_id=p_room and auth_id=p_target;
  delete from public.room_members where room_id=p_room and auth_id=p_target;
  insert into public.room_kicks values(p_room,p_target,now()+interval '10 minutes') on conflict(room_id,auth_id) do update set until=excluded.until;
  return 'ok';
 end if;
 return public.kick_from_room_before_tools(p_room,p_target);
end $$;
revoke all on function public.enter_room(uuid,text),public.send_room_message(uuid,text),public.kick_from_room(uuid,uuid) from public,anon;
grant execute on function public.enter_room(uuid,text),public.send_room_message(uuid,text),public.kick_from_room(uuid,uuid) to authenticated;

create or replace function public.room_tools_cleanup() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if old.is_live and not new.is_live then
  delete from public.room_seat_invites where room_id=new.id;
  delete from public.room_seat_controls where room_id=new.id;
 end if;
 return new;
end $$;
drop trigger if exists room_tools_cleanup on public.rooms;
create trigger room_tools_cleanup after update on public.rooms for each row execute function public.room_tools_cleanup();
