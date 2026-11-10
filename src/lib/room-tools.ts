import { supabase } from '@/lib/supabase';
export type SeatControl = { seat_no: number; locked: boolean; muted: boolean };
export type RoomToolsState = {
  admins: string[]; controls: SeatControl[]; chat_enabled: boolean; show_charisma: boolean;
  invite: { seat_no: number; invited_by: string } | null; blacklist: string[];
  impressions: { auth_id: string; body: string }[];
};
export const emptyRoomTools: RoomToolsState = { admins: [], controls: [], chat_enabled: true, show_charisma: true, invite: null, blacklist: [], impressions: [] };
export async function getRoomTools(roomId: string): Promise<RoomToolsState> {
  const { data, error } = await supabase.rpc('room_tools_state', { p_room: roomId });
  if (error) throw error;
  return data as RoomToolsState;
}
export async function manageRoom(roomId: string, action: string, data: Record<string, unknown> = {}) {
  const result = await supabase.rpc('manage_room', { p_room: roomId, p_action: action, p_data: data });
  if (result.error) throw result.error;
  if (result.data !== 'ok') throw new Error(String(result.data));
}
