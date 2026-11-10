import { supabase } from '@/lib/supabase';
import themeDefaultArt from '@/assets/rooms/theme-default.webp';

/** Choices the room setup page offers; must match the checks in supabase/004_rooms.sql. */
export const SEAT_COUNTS = [5, 10, 15, 20] as const;
export type SeatCount = (typeof SEAT_COUNTS)[number];
export const ROOM_THEMES = [
  { key: 'default', label: 'المبدئي', className: 'bg-room-default bg-cover bg-center', image: themeDefaultArt as string | undefined },
  { key: 'night', label: 'ليل', className: 'bg-room-night', image: undefined as string | undefined },
  { key: 'violet', label: 'بنفسجي', className: 'bg-room-violet', image: undefined as string | undefined },
  { key: 'gold', label: 'ذهبي', className: 'bg-room-gold', image: undefined as string | undefined },
] as const;
export type RoomTheme = (typeof ROOM_THEMES)[number]['key'];
export const roomTheme = (key: string | undefined) => ROOM_THEMES.find((t) => t.key === key) ?? ROOM_THEMES[0];
/** Inline background for a theme that has its own picture (kept over the gradient fallback). */
export const roomThemeStyle = (key: string | undefined) => {
  const img = roomTheme(key).image;
  return img ? { backgroundImage: `url(${img})` } : undefined;
};

export const ANNOUNCEMENT_MAX = 300;
export const ROOM_NAME_MAX = 40;
/** Room password: 4–8 digits. */
export const isRoomPassword = (v: string) => /^[0-9]{4,8}$/.test(v);
/** How often the room page refreshes and says "still here" (the database forgets members after 60 s). */
export const ROOM_POLL_MS = 3000;
export const ROOM_HEARTBEAT_MS = 20000;

export type Room = {
  id: string; owner_id: string; name: string; cover_url: string | null; mode: 'audio' | 'video';
  seat_count: SeatCount; theme: RoomTheme; announcement: string; locked: boolean; is_live: boolean;
};
export type RoomPerson = {
  auth_id: string; public_id: number; display_name: string; avatar_url: string | null;
  charisma_points?: number; special_id?: string | null; vip_level?: number; vip_expires_at?: string | null;
};
export type Seat = { seat_no: number; auth_id: string };
export type RoomMessage = { id: string; sender_id: string; body: string; created_at: string };

const ROOM_COLS = 'id, owner_id, name, cover_url, mode, seat_count, theme, announcement, locked, is_live';

export async function getMyRoom(me: string): Promise<Room | null> {
  const { data, error } = await supabase.from('rooms').select(ROOM_COLS).eq('owner_id', me).maybeSingle();
  if (error) throw error;
  return (data as Room | null) ?? null;
}

/** Owner profile + room, looked up by the owner's public ID. */
export async function getRoomByOwnerPublicId(publicId: number): Promise<{ owner: RoomPerson; room: Room | null } | null> {
  const owner = (await getPeople({ public_id: publicId }))[0];
  if (!owner) return null;
  const { data, error } = await supabase.from('rooms').select(ROOM_COLS).eq('owner_id', owner.auth_id).maybeSingle();
  if (error) throw error;
  return { owner, room: (data as Room | null) ?? null };
}

export async function getLiveRooms(): Promise<(Room & { owner: RoomPerson | undefined; online: number })[]> {
  const { data, error } = await supabase.from('rooms').select(ROOM_COLS).eq('is_live', true).order('updated_at', { ascending: false }).limit(50);
  if (error) throw error;
  const rooms = (data ?? []) as Room[];
  if (!rooms.length) return [];
  const owners = await getPeople({ ids: rooms.map((r) => r.owner_id) });
  const since = new Date(Date.now() - 60_000).toISOString();
  const { data: members } = await supabase.from('room_members').select('room_id').in('room_id', rooms.map((r) => r.id)).gt('last_seen', since);
  return rooms.map((r) => ({
    ...r,
    owner: owners.find((o) => o.auth_id === r.owner_id),
    online: (members ?? []).filter((m) => m.room_id === r.id).length,
  }));
}

/** Profiles by auth IDs or one public ID; falls back when VIP / special ID columns are missing. */
export async function getPeople(by: { ids: string[] } | { public_id: number }): Promise<RoomPerson[]> {
  if ('ids' in by && by.ids.length === 0) return [];
  const run = (cols: string) => {
    const q = supabase.from('profiles').select(cols);
    return 'ids' in by ? q.in('auth_id', by.ids) : q.eq('public_id', by.public_id);
  };
  let res = await run('auth_id, public_id, display_name, avatar_url, special_id, vip_level, vip_expires_at, charisma_points');
  if (res.error) res = await run('auth_id, public_id, display_name, avatar_url');
  if (res.error) throw res.error;
  return (res.data ?? []) as unknown as RoomPerson[];
}

export type StartParty = {
  name: string; coverUrl: string | null; mode: 'audio' | 'video'; seatCount: SeatCount; theme: RoomTheme;
  announcement: string; /** null keeps the lock, '' removes it, digits set it. */ password: string | null;
};
export async function startParty(s: StartParty): Promise<string> {
  const { data, error } = await supabase.rpc('start_party', {
    p_name: s.name, p_cover_url: s.coverUrl ?? '', p_mode: s.mode, p_seat_count: s.seatCount,
    p_theme: s.theme, p_announcement: s.announcement, p_password: s.password,
  });
  if (error) throw error;
  return data as string;
}

export type EnterResult = 'ok' | 'not_found' | 'not_live' | 'wrong_password' | 'kicked';
export async function enterRoom(roomId: string, password?: string): Promise<EnterResult> {
  const { data, error } = await supabase.rpc('enter_room', { p_room: roomId, p_password: password ?? null });
  if (error) throw error;
  return data as EnterResult;
}

export async function getRoomState(roomId: string) {
  const since = new Date(Date.now() - 60_000).toISOString();
  const [members, seats, messages, room, coins] = await Promise.all([
    supabase.from('room_members').select('auth_id').eq('room_id', roomId).gt('last_seen', since),
    supabase.from('room_seats').select('seat_no, auth_id').eq('room_id', roomId),
    supabase.from('room_messages').select('id, sender_id, body, created_at').eq('room_id', roomId).order('created_at', { ascending: true }).limit(200),
    supabase.from('rooms').select(ROOM_COLS).eq('id', roomId).maybeSingle(),
    // Coins thrown in this room (005_room_coins.sql). Missing function = no coins yet, never a broken page.
    supabase.rpc('room_coins_total', { p_room: roomId }),
  ]);
  return {
    members: ((members.data ?? []) as { auth_id: string }[]).map((m) => m.auth_id),
    seats: (seats.data ?? []) as Seat[],
    messages: (messages.data ?? []) as RoomMessage[],
    room: (room.data as Room | null) ?? null,
    coins: Number(coins.data ?? 0) || 0,
  };
}

const call = async (fn: string, args: Record<string, unknown>) => {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return data as string | null;
};
export const takeSeat = (roomId: string, seat: number) => call('take_seat', { p_room: roomId, p_seat: seat });
export const leaveSeat = (roomId: string) => call('leave_seat', { p_room: roomId });
export const leaveRoom = (roomId: string) => call('leave_room', { p_room: roomId });
export const endParty = () => call('end_party', {});
export const sendRoomMessage = (roomId: string, body: string) => call('send_room_message', { p_room: roomId, p_body: body });
export const kickFromRoom = (roomId: string, target: string) => call('kick_from_room', { p_room: roomId, p_target: target });

/** Coins a member may throw in one go (005_room_coins.sql). */
export const COIN_AMOUNTS = [10, 50, 100, 500] as const;

/** Throws coins into the room out of the member's own balance. Returns the room's new total. */
export async function throwRoomCoins(roomId: string, amount: number): Promise<number> {
  const { data, error } = await supabase.rpc('throw_room_coins', { p_room: roomId, p_amount: amount });
  if (error) throw error;
  return Number(data ?? 0) || 0;
}

/** Uploads a room cover to Cloudinary (voli/rooms) and returns its public address. */
export async function uploadRoomCover(_me: string, file: File): Promise<string> {
  const { uploadToCloudinary } = await import('@/lib/cloudinary');
  return uploadToCloudinary(file, 'voli/rooms');
}

/** Uploads a new profile picture to Cloudinary (voli/avatars) and saves it on the member's profile. */
export async function updateMyAvatar(me: string, file: File): Promise<string> {
  const { uploadToCloudinary } = await import('@/lib/cloudinary');
  const url = await uploadToCloudinary(file, 'voli/avatars');
  const { error } = await supabase.from('profiles').update({ avatar_url: url }).eq('auth_id', me);
  if (error) throw error;
  return url;
}
