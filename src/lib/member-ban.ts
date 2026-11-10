import { supabase } from '@/lib/supabase';

export type MyBan = { until: string | null; reason: string | null; ban_code?: number | null };

/** Read the current member's ban without loading any management interface. */
export async function getMyBan(): Promise<MyBan | null> {
  const { data, error } = await supabase.rpc('my_ban');
  if (error) return null;
  return (data as MyBan[] | null)?.[0] ?? null;
}
