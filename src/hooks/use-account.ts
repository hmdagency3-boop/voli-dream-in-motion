import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

export type Profile = {
  public_id: number; display_name: string; avatar_url: string | null;
  charisma_points?: number; wealth_points?: number;
  /** Admin-assigned special ID, shown instead of public_id when set. */
  special_id?: string | null;
  /** VIP tier 0–8 and when it ends (null = never). Use activeVipLevel() to read it. */
  vip_level?: number; vip_expires_at?: string | null;
  coins?: number; hide_location?: boolean; vip_invisible?: boolean;
};

/** Current session plus the signed-in user's public profile row (if the schema exists). */
export function useAccount() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ready, setReady] = useState(false);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') setSession(next);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;
  useEffect(() => {
    if (!userId) { setProfile(null); return; }
    let active = true;
    (async () => {
      // Older databases may miss the VIP, special-ID or level columns: fall back step by step.
      const selects = [
        'public_id, display_name, avatar_url, charisma_points, wealth_points, special_id, vip_level, vip_expires_at, coins, hide_location, vip_invisible',
        'public_id, display_name, avatar_url, charisma_points, wealth_points, special_id, vip_level',
        'public_id, display_name, avatar_url, charisma_points, wealth_points',
        'public_id, display_name, avatar_url',
      ];
      let res = await supabase.from('profiles').select(selects[0]!).eq('auth_id', userId).maybeSingle();
      for (const cols of selects.slice(1)) {
        if (!res.error) break;
        res = await supabase.from('profiles').select(cols).eq('auth_id', userId).maybeSingle();
      }
      if (active) setProfile((res.data as Profile | null) ?? null);
    })();
    return () => { active = false; };
  }, [userId, version]);

  return { session, profile, ready, reload };
}
