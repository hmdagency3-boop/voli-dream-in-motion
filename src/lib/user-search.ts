import { supabase } from '@/lib/supabase';
import type { Profile } from '@/hooks/use-account';

const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
const persianDigits = '۰۱۲۳۴۵۶۷۸۹';

/**
 * Turns what the member typed into an ID to look up: digits only (Arabic digits allowed),
 * an optional "ID:" prefix and spaces are ignored. Returns null when it can't be an ID.
 */
export function parseIdQuery(raw: string): string | null {
  const latin = raw
    .replace(/[٠-٩]/g, (d) => String(arabicDigits.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String(persianDigits.indexOf(d)))
    .replace(/^\s*id\s*:?/i, '')
    .replace(/\s+/g, '');
  return /^\d{1,10}$/.test(latin) ? latin : null;
}

/** Filter matching a member's normal ID (7 digits) or their special ID (no leading zero). */
export function idSearchFilter(id: string, withSpecialId = true): string | null {
  const parts: string[] = [];
  if (/^[1-9]\d{6}$/.test(id)) parts.push(`public_id.eq.${id}`);
  if (withSpecialId && /^[1-9]\d{0,9}$/.test(id)) parts.push(`special_id.eq.${id}`);
  return parts.length ? parts.join(',') : null;
}

export type FoundUser = Pick<Profile, 'public_id' | 'display_name' | 'avatar_url' | 'special_id' | 'vip_level'>;

/** Looks up members by normal ID or special ID. Works on older databases without special IDs. */
export async function searchUsersById(id: string): Promise<FoundUser[]> {
  const full = idSearchFilter(id, true);
  if (full) {
    const res = await supabase.from('profiles').select('public_id, display_name, avatar_url, special_id, vip_level').or(full).limit(5);
    if (!res.error) return (res.data ?? []) as FoundUser[];
  }
  const basic = idSearchFilter(id, false);
  if (!basic) return [];
  const res = await supabase.from('profiles').select('public_id, display_name, avatar_url').or(basic).limit(5);
  if (res.error) throw res.error;
  return (res.data ?? []) as FoundUser[];
}
