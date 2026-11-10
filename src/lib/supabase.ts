import { createClient } from '@supabase/supabase-js';

// The user's own external project. The publishable key is public by design;
// all data access is enforced by RLS in sql/voli-starter.sql.
const SUPABASE_URL = 'https://eyewvtgszwrrzgfbrumr.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_ihbqq5bV6PGzxeyoGM02Jw_52nGsCn7';

const isBrowser = typeof window !== 'undefined';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: isBrowser,
    autoRefreshToken: isBrowser,
    detectSessionInUrl: isBrowser,
    storage: isBrowser ? window.localStorage : undefined,
  },
});
