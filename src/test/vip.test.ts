import { describe, expect, it } from 'vitest';
import { activeVipLevel, VIP_TIERS, vipTier } from '@/lib/vip';

describe('VIP tiers shown in the app', () => {
  it('has the 8 dragon tiers in order', () => {
    expect(VIP_TIERS.map((t) => t.nameEn)).toEqual([
      'Bronze Hatchling Dragon', 'Silver Wyvern Dragon', 'Golden Flame Dragon', 'Cosmic Void Dragon',
      'Crimson Ruby Dragon', 'Emerald Serpent Dragon', 'Royal Diamond Dragon', 'Supreme Emperor Dragon - Ultimate King',
    ]);
  });
  it('custom chat bubble from VIP 2, neon bubble from VIP 4', () => {
    expect(VIP_TIERS.map((t) => t.chatBubble)).toEqual([null, 'custom', 'custom', 'neon', 'neon', 'neon', 'neon', 'neon']);
  });
  it('hiding location from VIP 2, invisible mode from VIP 5', () => {
    expect(VIP_TIERS.findIndex((t) => t.hideLocation) + 1).toBe(2);
    expect(VIP_TIERS.findIndex((t) => t.invisibleMode) + 1).toBe(5);
  });
  it('VIP 1 has the bronze dragon entrance bar, and VIP 2 has its own silver dragon bar', () => {
    expect(VIP_TIERS.map((t) => t.entrance)).toEqual([
      'bronze_dragon_bar', 'silver_dragon_bar', 'gold_dragon', 'purple_flying_dragon',
      'red_fire_dragon', 'emerald_giant_dragon', 'diamond_flying_dragon', 'legendary_dragon',
    ]);
  });
  it('unknown levels have no tier', () => {
    expect(vipTier(0)).toBeNull();
    expect(vipTier(9)).toBeNull();
  });
});

describe('active VIP', () => {
  const now = Date.parse('2026-11-06T12:00:00Z');
  it('a permanent tier stays active', () => {
    expect(activeVipLevel({ vip_level: 5, vip_expires_at: null }, now)).toBe(5);
  });
  it('a tier still running is active, an ended one is not', () => {
    expect(activeVipLevel({ vip_level: 3, vip_expires_at: '2026-12-01T00:00:00Z' }, now)).toBe(3);
    expect(activeVipLevel({ vip_level: 3, vip_expires_at: '2026-11-01T00:00:00Z' }, now)).toBe(0);
  });
  it('old 0–100 values that were never moved to the tiers are ignored', () => {
    expect(activeVipLevel({ vip_level: 50 }, now)).toBe(0);
  });
});
