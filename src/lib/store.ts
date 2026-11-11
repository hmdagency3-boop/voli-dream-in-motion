import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * Store and backpack, on the management panel's database update (supabase/023_store.sql, same file as the
 * panel's sql/023_store.sql). Prices, coins and ownership are checked in the database; the kinds and
 * styles below mirror its check constraints and must change together with the SQL.
 */
export type StoreKind = 'frame' | 'ride';
export type StoreCategory = 'simple' | 'romantic' | 'luxury' | 'theme';

export const STORE_KINDS: { key: StoreKind; label: string }[] = [
  { key: 'frame', label: 'الإطارات' },
  { key: 'ride', label: 'المركبات' },
];
export const STORE_CATEGORIES: { key: StoreCategory; label: string }[] = [
  { key: 'simple', label: 'بسيط' },
  { key: 'romantic', label: 'رومانسي' },
  { key: 'luxury', label: 'فخم' },
  { key: 'theme', label: 'ثيم' },
];

/** category = the database's style, duration_days = its days. id is the item's UUID. */
export type StoreItem = {
  id: string; kind: StoreKind; category: StoreCategory; name: string; price: number; duration_days: number;
  art_url: string; video_url: string | null;
};
export type BackpackItem = Omit<StoreItem, 'price' | 'duration_days'> & { expires_at: string; equipped: boolean };
export type WornItem = { item_id: string; name: string; art_url: string; video_url: string | null };
export type Worn = Partial<Record<StoreKind, WornItem>>;

/** Whole days left, rounded up (an item ending later today still shows 1 day). */
export const daysLeft = (expiresAt: string, now = Date.now()) =>
  Math.max(1, Math.ceil((new Date(expiresAt).getTime() - now) / 86_400_000));

/** True when update 023 has not been run yet. */
export const storeMissing = (e: unknown) => {
  const code = (e as { code?: string } | null)?.code;
  return code === '42P01' || code === 'PGRST205' || code === 'PGRST202' || code === '42883';
};

type ItemRow = { id: string; kind: StoreKind; style: StoreCategory; name: string; price: number | string; days: number; art_url: string; video_url: string | null };
type Joined = Pick<ItemRow, 'name' | 'style' | 'art_url' | 'video_url'>;
/** PostgREST returns the joined item as an object (or a one-row list on some setups). */
const joined = (x: Joined | Joined[] | null | undefined) => (Array.isArray(x) ? x[0] : x) ?? null;

/** Items on sale, in shelf order. */
export async function getStoreItems(): Promise<StoreItem[]> {
  const { data, error } = await supabase.from('store_items')
    .select('id, kind, style, name, price, days, art_url, video_url')
    .eq('active', true).order('sort').order('created_at');
  if (error) throw error;
  return ((data ?? []) as ItemRow[]).map((r) => ({
    id: String(r.id), kind: r.kind, category: r.style, name: r.name, price: Number(r.price), duration_days: Number(r.days),
    art_url: r.art_url, video_url: r.video_url ?? null,
  }));
}

/** Buys one item (coins are taken in the database); returns when it ends. */
export async function buyStoreItem(id: string): Promise<string> {
  const { data, error } = await supabase.rpc('store_buy', { p_item: id });
  if (error) throw error;
  return data as string;
}

export async function equipItem(id: string, on: boolean): Promise<void> {
  const { error } = await supabase.rpc('store_equip', { p_item: id, p_on: on });
  if (error) throw error;
}

/** The signed-in member's items that have not ended, newest end first. */
export async function getBackpack(): Promise<BackpackItem[]> {
  const { data: auth } = await supabase.auth.getSession();
  const me = auth.session?.user.id;
  if (!me) return [];
  const { data, error } = await supabase.from('member_items')
    .select('item_id, kind, expires_at, equipped, store_items(name, style, art_url, video_url)')
    .eq('auth_id', me).gt('expires_at', new Date().toISOString()).order('expires_at', { ascending: false });
  if (error) throw error;
  type Row = { item_id: string; kind: StoreKind; expires_at: string; equipped: boolean; store_items: Joined | Joined[] | null };
  return ((data ?? []) as unknown as Row[]).flatMap((r) => {
    const it = joined(r.store_items);
    return it ? [{
      id: String(r.item_id), kind: r.kind, category: it.style, name: it.name, art_url: it.art_url, video_url: it.video_url ?? null,
      expires_at: r.expires_at, equipped: !!r.equipped,
    }] : [];
  });
}

/** What these members wear now, by auth ID. Empty when update 023 is not run yet. */
export async function getWorn(ids: string[]): Promise<Record<string, Worn>> {
  const unique = [...new Set(ids.filter(Boolean))].slice(0, 100);
  if (!unique.length) return {};
  const { data, error } = await supabase.from('member_items')
    .select('auth_id, item_id, kind, store_items(name, style, art_url, video_url)')
    .in('auth_id', unique).eq('equipped', true).gt('expires_at', new Date().toISOString());
  if (error) return {};
  const out: Record<string, Worn> = Object.fromEntries(unique.map((id) => [id, {}]));
  type Row = { auth_id: string; item_id: string; kind: StoreKind; store_items: Joined | Joined[] | null };
  for (const r of (data ?? []) as unknown as Row[]) {
    const it = joined(r.store_items);
    if (it) (out[r.auth_id] ??= {})[r.kind] = { item_id: String(r.item_id), name: it.name, art_url: it.art_url, video_url: it.video_url ?? null };
  }
  return out;
}

/** Worn items for a changing list of members; refreshes when the list changes. */
export function useWorn(ids: (string | null | undefined)[], version = 0): Record<string, Worn> {
  const key = [...new Set(ids.filter((x): x is string => !!x))].sort().join(',');
  const [worn, setWorn] = useState<Record<string, Worn>>({});
  useEffect(() => {
    if (!key) return;
    let active = true;
    getWorn(key.split(',')).then((w) => { if (active) setWorn((prev) => ({ ...prev, ...w })); });
    return () => { active = false; };
  }, [key, version]);
  return worn;
}

export const storeErrorMessage = (e: unknown) => {
  if (storeMissing(e)) return 'المتجر لسه مش جاهز في قاعدة البيانات';
  const hint = (e as { hint?: string } | null)?.hint;
  return ({
    not_enough_coins: 'رصيدك من الكوينز مش كفاية',
    not_for_sale: 'المنتج ده مش معروض للبيع دلوقتي',
    not_owned: 'المنتج ده مش في حقيبتك أو أيامه خلصت',
    not_signed_in: 'سجّل الدخول الأول',
  } as Record<string, string>)[hint ?? ''] ?? 'العملية ماتمتش، حاول تاني';
};
