import { supabase } from '@/lib/supabase';
import { getPeople, type RoomPerson } from '@/lib/rooms';

export type RankBoard = 'support' | 'received';
export type RankPeriod = 'day' | 'week' | 'month';
export type RankEntry = { person: RoomPerson; score: number };

/** One ranking board for a room (supabase/007_room_ranking.sql), highest first.
 *  Returns null when the ranking update has not been run in the database yet. */
export async function getRoomRanking(roomId: string, board: RankBoard, period: RankPeriod): Promise<RankEntry[] | null> {
  const { data, error } = await supabase.rpc('room_ranking', { p_room: roomId, p_board: board, p_period: period });
  if (error) {
    if (error.code === 'PGRST202' || error.code === '42883') return null;
    throw error;
  }
  const rows = ((data ?? []) as { auth_id: string | null; score: number }[]).filter((r) => r.auth_id);
  const people = await getPeople({ ids: rows.map((r) => r.auth_id!) });
  const byId = new Map(people.map((p) => [p.auth_id, p]));
  return rows
    .map((r) => ({ person: byId.get(r.auth_id!), score: Number(r.score) || 0 }))
    .filter((e): e is RankEntry => !!e.person && e.score > 0);
}
