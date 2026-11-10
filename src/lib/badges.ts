import w1 from '@/assets/badges/wealth-1.webp';
import w2 from '@/assets/badges/wealth-2.webp';
import w3 from '@/assets/badges/wealth-3.webp';
import w4 from '@/assets/badges/wealth-4.webp';
import w5 from '@/assets/badges/wealth-5.webp';
import w6 from '@/assets/badges/wealth-6.webp';
import w7 from '@/assets/badges/wealth-7.webp';
import w8 from '@/assets/badges/wealth-8.webp';
import w9 from '@/assets/badges/wealth-9.webp';
import w10 from '@/assets/badges/wealth-10.webp';
import w11 from '@/assets/badges/wealth-11.webp';
import c1 from '@/assets/badges/charisma-1.webp';
import c2 from '@/assets/badges/charisma-2.webp';
import c3 from '@/assets/badges/charisma-3.webp';
import c4 from '@/assets/badges/charisma-4.webp';
import c5 from '@/assets/badges/charisma-5.webp';
import c6 from '@/assets/badges/charisma-6.webp';
import c7 from '@/assets/badges/charisma-7.webp';
import c8 from '@/assets/badges/charisma-8.webp';
import c9 from '@/assets/badges/charisma-9.webp';
import c10 from '@/assets/badges/charisma-10.webp';
import c11 from '@/assets/badges/charisma-11.webp';

/** One badge picture; textX/textY = center of the empty plate where the level number is written (% of image). */
export type Badge = { tier: number; url: string; textX: number; textY: number };

const wealth: Badge[] = [
  { tier: 1, url: w1, textX: 72, textY: 51 },
  { tier: 2, url: w2, textX: 66, textY: 50 },
  { tier: 3, url: w3, textX: 68, textY: 50 },
  { tier: 4, url: w4, textX: 66, textY: 50 },
  { tier: 5, url: w5, textX: 66, textY: 50 },
  { tier: 6, url: w6, textX: 66, textY: 50 },
  { tier: 7, url: w7, textX: 66, textY: 50 },
  { tier: 8, url: w8, textX: 66, textY: 50 },
  { tier: 9, url: w9, textX: 66, textY: 50 },
  { tier: 10, url: w10, textX: 68, textY: 50 },
  { tier: 11, url: w11, textX: 70, textY: 56 },
];

export const wealthBadges = wealth;

const charisma: Badge[] = [
  { tier: 1, url: c1, textX: 70, textY: 50 },
  { tier: 2, url: c2, textX: 72, textY: 54 },
  { tier: 3, url: c3, textX: 70, textY: 52 },
  { tier: 4, url: c4, textX: 73, textY: 49 },
  { tier: 5, url: c5, textX: 73, textY: 51 },
  { tier: 6, url: c6, textX: 73, textY: 50 },
  { tier: 7, url: c7, textX: 74, textY: 51 },
  { tier: 8, url: c8, textX: 73, textY: 50 },
  { tier: 9, url: c9, textX: 74, textY: 56 },
  { tier: 10, url: c10, textX: 74, textY: 50 },
  { tier: 11, url: c11, textX: 74, textY: 55 },
];

export const charismaBadges = charisma;


/** Level range text for a tier: "1 – 9", "10 – 19", … "100+". */
export function tierRange(tier: number) {
  if (tier >= 11) return '100+';
  return tier === 1 ? '1 – 9' : `${(tier - 1) * 10} – ${(tier - 1) * 10 + 9}`;
}

/** Badge tier for a level: 1–9 → 1, 10–19 → 2, … 90–99 → 10, 100+ → 11. Level 0 has no badge yet. */
export function badgeTier(level: number): number | null {
  if (level < 1) return null;
  return Math.min(11, Math.floor(level / 10) + 1);
}

/** Wealth badge picture for a level (level 0 shows the first badge, locked). */
export function wealthBadge(level: number): Badge {
  return wealth[(badgeTier(level) ?? 1) - 1] ?? wealth[0]!;
}

/** Charisma badge picture for a level (level 0 shows the first badge, locked). */
export function charismaBadge(level: number): Badge {
  return charisma[(badgeTier(level) ?? 1) - 1] ?? charisma[0]!;
}
