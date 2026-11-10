import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * Store and backpack (supabase/023_store.sql). Prices, coins and ownership are checked in the database;
 * the kinds and categories below mirror its check constraints and must change together with the SQL.
 */
export type StoreKind = 'headwear' | 'ride';
export type StoreCategory = 'simple' | 'romantic' | 'luxury' | 'theme';

export const STORE_KINDS: { key: StoreKind; label: string }[] = [
  { key: 'headwear', label: 'الإطارات' },
  { key: 'ride', label: 'المركبات' },
];
export const STORE_CATEGORIES: { key: StoreCategory; label: string }[] = [
  { key: 'simple', label: 'بسيط' },
  { key: 'romantic', label: 'رومانسي' },
  { key: 'luxury', label: 'فخم' },
  { key: 'theme', label: 'ثيم' },
];

export type StoreItem = {
  id: number; kind: StoreKind; category: StoreCategory; name: string; price: number; duration_days: number;
  art_url: string; video_url: string | null;
};
export type BackpackItem = Omit<StoreItem, 'price' | 'duration_days'> & { expires_at: string; equipped: boolean };
export type WornItem = { item_id: number; name: string; art_url: string; video_url: string | null };
export type Worn = Partial<Record<StoreKind, WornItem>>;

/** Whole days left, rounded up (an item ending later today still shows 1 day). */
export const daysLeft = (expiresAt: string, now = Date.now()) =>
  Math.max(1, Math.ceil((new Date(expiresAt).getTime() - now) / 86_400_000));

/** True when update 023 has not been run yet. */
export const storeMissing = (e: unknown) => {
  const code = (e as { code?: string } | null)?.code;
  return code === '42P01' || code === 'PGRST205' || code === 'PGRST202' || code === '42883';
};

/** Items on sale, in shelf order. */
export async function getStoreItems(): Promise<StoreItem[]> {
  const { data, error } = await supabase.from('store_items')
    .select('id, kind, category, name, price, duration_days, art_url, video_url')
    .order('sort').order('id');
  if (error) throw error;
  return ((data ?? []) as StoreItem[]).map((r) => ({ ...r, id: Number(r.id), price: Number(r.price) }));
}

/** Buys one item; returns when it ends. */
export async function buyStoreItem(id: number): Promise<string> {
  const { data, error } = await supabase.rpc('buy_store_item', { p_item: id });
  if (error) throw error;
  return data as string;
}

export async function getBackpack(): Promise<BackpackItem[]> {
  const { data, error } = await supabase.rpc('my_backpack');
  if (error) throw error;
  return ((data ?? []) as BackpackItem[]).map((r) => ({ ...r, id: Number((r as { item_id?: number }).item_id) }));
}

export async function equipItem(id: number, on: boolean): Promise<void> {
  const { error } = await supabase.rpc('equip_store_item', { p_item: id, p_on: on });
  if (error) throw error;
}

/** What these members wear now, by auth ID. Empty when update 023 is not run yet. */
export async function getWorn(ids: string[]): Promise<Record<string, Worn>> {
  const unique = [...new Set(ids.filter(Boolean))].slice(0, 100);
  if (!unique.length) return {};
  const { data, error } = await supabase.rpc('worn_items', { p_ids: unique });
  if (error) return {};
  const out: Record<string, Worn> = Object.fromEntries(unique.map((id) => [id, {}]));
  for (const r of (data ?? []) as (WornItem & { auth_id: string; kind: StoreKind })[]) {
    (out[r.auth_id] ??= {})[r.kind] = { item_id: Number(r.item_id), name: r.name, art_url: r.art_url, video_url: r.video_url ?? null };
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
    not_owned: 'المنتج ده مش في حقيبتك',
  } as Record<string, string>)[hint ?? ''] ?? 'العملية ماتمتش، حاول تاني';
};
