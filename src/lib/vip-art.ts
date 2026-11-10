import vip1Badge from '@/assets/vip/vip-1-badge.webp';
import vip1Entrance from '@/assets/vip/vip-1-entrance.webp';
import vip2Entrance from '@/assets/vip/vip-2-entrance.webp';
import vip1ChatBubble from '@/assets/vip/vip-1-chat-bubble.webp';
import vip2Badge from '@/assets/vip/vip-2-badge.webp';
import vip2ChatBubble from '@/assets/vip/vip-2-chat-bubble.webp';
import vip3Badge from '@/assets/vip/vip-3-badge.webp';
import vip3Entrance from '@/assets/vip/vip-3-entrance.webp';
import vip3ChatBubble from '@/assets/vip/vip-3-chat-bubble.webp';
import vip4Badge from '@/assets/vip/vip-4-badge.webp';
import vip4Entrance from '@/assets/vip/vip-4-entrance.webp';
import vip4ChatBubble from '@/assets/vip/vip-4-chat-bubble.webp';
import vip5Badge from '@/assets/vip/vip-5-badge.webp';
import vip5Entrance from '@/assets/vip/vip-5-entrance.webp';
import vip5ChatBubble from '@/assets/vip/vip-5-chat-bubble.webp';
import vip6Badge from '@/assets/vip/vip-6-badge.webp';
import vip6Entrance from '@/assets/vip/vip-6-entrance.webp';
import vip6ChatBubble from '@/assets/vip/vip-6-chat-bubble.webp';
import vip7Badge from '@/assets/vip/vip-7-badge.webp';
import vip7Entrance from '@/assets/vip/vip-7-entrance.webp';
import vip7ChatBubble from '@/assets/vip/vip-7-chat-bubble.webp';
import vip8Badge from '@/assets/vip/vip-8-badge.webp';
import vip8Entrance from '@/assets/vip/vip-8-entrance.webp';
import vip8ChatBubble from '@/assets/vip/vip-8-chat-bubble.webp';
import vip1ProfileCard from '@/assets/vip/vip-1-profile-card.webp';
import { vipTier } from '@/lib/vip';

/**
 * Pictures the user sent for each VIP tier. A tier without its own badge keeps the drawn placeholder;
 * entrance bars are keyed like vip_tiers.entrance, so a tier shows a bar only once its picture exists.
 */
export type EntranceArt = {
  url: string;
  /** Empty plate where the member's name is written, in % of the picture. */
  name: { left: number; right: number; top: number; bottom: number };
  /** Text size multiplier for pictures whose plate is small compared to the picture's width. */
  textScale?: number;
};

const BADGES: Partial<Record<number, string>> = {
  1: vip1Badge,
  2: vip2Badge,
  3: vip3Badge,
  4: vip4Badge,
  5: vip5Badge,
  6: vip6Badge,
  7: vip7Badge,
  8: vip8Badge,
};

const ENTRANCES: Record<string, EntranceArt> = {
  bronze_dragon_bar: { url: vip1Entrance, name: { left: 39, right: 23, top: 42, bottom: 25 } },
  silver_dragon_bar: { url: vip2Entrance, name: { left: 39, right: 23, top: 42, bottom: 25 } },
  gold_dragon: { url: vip3Entrance, name: { left: 42, right: 24, top: 38, bottom: 30 } },
  purple_flying_dragon: { url: vip4Entrance, name: { left: 37, right: 17, top: 49.5, bottom: 30.5 }, textScale: 0.7 },
  red_fire_dragon: { url: vip5Entrance, name: { left: 43, right: 23, top: 42, bottom: 36 }, textScale: 0.8 },
  emerald_giant_dragon: { url: vip6Entrance, name: { left: 50, right: 8, top: 52, bottom: 26 }, textScale: 0.75 },
  diamond_flying_dragon: { url: vip7Entrance, name: { left: 44, right: 9, top: 54, bottom: 27 }, textScale: 0.8 },
  legendary_dragon: { url: vip8Entrance, name: { left: 47, right: 20, top: 47, bottom: 40 }, textScale: 0.7 },
};

export function vipBadgeArt(level: number): string | null {
  return BADGES[level] ?? null;
}

export function vipEntranceArt(level: number): EntranceArt | null {
  const key = vipTier(level)?.entrance;
  return (key && ENTRANCES[key]) || null;
}

/** Stretchable room-chat bubble: picture + 9-slice cut lines (px of the picture) and shown border size (px). */
export type ChatBubbleArt = {
  url: string;
  slice: { top: number; right: number; bottom: number; left: number };
  border: { top: number; right: number; bottom: number; left: number };
};

const CHAT_BUBBLES: Partial<Record<number, Omit<ChatBubbleArt, 'border'>>> = {
  1: {
    url: vip1ChatBubble,
    slice: { top: 80, right: 57, bottom: 100, left: 180 },
  },
  2: {
    url: vip2ChatBubble,
    slice: { top: 80, right: 60, bottom: 102, left: 180 },
  },
  3: {
    url: vip3ChatBubble,
    slice: { top: 80, right: 130, bottom: 110, left: 130 },
  },
  4: {
    url: vip4ChatBubble,
    slice: { top: 80, right: 150, bottom: 95, left: 150 },
  },
  5: {
    url: vip5ChatBubble,
    slice: { top: 80, right: 200, bottom: 95, left: 200 },
  },
  6: {
    url: vip6ChatBubble,
    slice: { top: 80, right: 200, bottom: 95, left: 200 },
  },
  7: {
    url: vip7ChatBubble,
    slice: { top: 110, right: 240, bottom: 130, left: 240 },
  },
  8: {
    url: vip8ChatBubble,
    slice: { top: 90, right: 220, bottom: 120, left: 220 },
  },
};

/**
 * Every side is shown at the same scale as its cut, so the dragon ends and wings keep their
 * shape; only the middle slice stretches when a message gets wider.
 */
const BUBBLE_SCALE = 0.15;

export function vipChatBubbleArt(level: number): ChatBubbleArt | null {
  const art = CHAT_BUBBLES[level];
  if (!art) return null;
  const k = (n: number) => Math.round(n * BUBBLE_SCALE * 10) / 10;
  const { top, right, bottom, left } = art.slice;
  return { ...art, border: { top: k(top), right: k(right), bottom: k(bottom), left: k(left) } };
}

/**
 * Popped-up profile card: the tier's picture IS the card, and the member's details
 * sit inside the picture's empty inner window. Insets are % of the picture, measured
 * off the artwork, so a new tier only needs its own picture plus one line here.
 */
export type ProfileCardArt = {
  url: string;
  /** width / height of the picture, so the card keeps its shape at any size. */
  aspect: number;
  /** The empty inner window, as % inset from each edge of the picture. */
  canvas: { left: number; right: number; top: number; bottom: number };
};

const PROFILE_CARDS: Partial<Record<number, ProfileCardArt>> = {
  1: { url: vip1ProfileCard, aspect: 851 / 991, canvas: { left: 18.5, right: 18.5, top: 23, bottom: 16 } },
};

export function vipProfileCardArt(level: number): ProfileCardArt | null {
  return PROFILE_CARDS[level] ?? null;
}
