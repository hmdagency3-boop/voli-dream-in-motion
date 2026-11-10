import silver from '@/assets/special-id/silver.webp';
import gold from '@/assets/special-id/gold.webp';
import purple from '@/assets/special-id/purple.webp';
import red from '@/assets/special-id/red.webp';
import { vipTier } from '@/lib/vip';

export type SpecialIdFrame = { name: 'silver' | 'gold' | 'purple' | 'red'; url: string };

const frames: Record<SpecialIdFrame['name'], SpecialIdFrame> = {
  silver: { name: 'silver', url: silver },
  gold: { name: 'gold', url: gold },
  purple: { name: 'purple', url: purple },
  red: { name: 'red', url: red },
};

/** Lowest VIP tier whose perks include a special ID card (the admin can grant one at any tier). */
export const SPECIAL_ID_MIN_VIP = 3;

/**
 * Frame for a special ID by VIP tier's ID card: VIP 3–4 special card (silver), VIP 5–6 gold card,
 * VIP 7 diamond card, VIP 8 legendary card. Diamond and legendary use the purple and red frames
 * until their own pictures arrive. An admin-granted special ID below VIP 3 uses the silver frame.
 */
export function specialIdFrame(vipLevel: number): SpecialIdFrame {
  switch (vipTier(vipLevel)?.idCard) {
    case 'legendary': return frames.red;
    case 'diamond': return frames.purple;
    case 'gold': return frames.gold;
    default: return frames.silver;
  }
}

/** The ID people see: the special ID when the user has one, otherwise the normal public ID. */
export function shownId(profile: { public_id: number; special_id?: string | null }): string {
  return profile.special_id ? profile.special_id : String(profile.public_id);
}
