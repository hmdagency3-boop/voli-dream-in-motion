import { describe, expect, it } from 'vitest';
import { badgeTier, wealthBadge } from '@/lib/badges';

describe('level badges', () => {
  it('level 0 has no badge yet', () => {
    expect(badgeTier(0)).toBeNull();
  });
  it('badge 1 covers levels 1 to 9', () => {
    expect(badgeTier(1)).toBe(1);
    expect(badgeTier(9)).toBe(1);
  });
  it('each next badge covers ten levels', () => {
    expect(badgeTier(10)).toBe(2);
    expect(badgeTier(19)).toBe(2);
    expect(badgeTier(20)).toBe(3);
    expect(badgeTier(55)).toBe(6);
    expect(badgeTier(90)).toBe(10);
    expect(badgeTier(99)).toBe(10);
  });
  it('badge 11 is for level 100 and above', () => {
    expect(badgeTier(100)).toBe(11);
    expect(badgeTier(150)).toBe(11);
  });
  it('picks the matching wealth picture', () => {
    expect(wealthBadge(45).tier).toBe(5);
    expect(wealthBadge(100).url).toContain('wealth-11');
  });
});

describe('charisma badges', () => {
  it('uses the same level ranges with charisma pictures', async () => {
    const { charismaBadge } = await import('@/lib/badges');
    expect(charismaBadge(9).url).toContain('charisma-1');
    expect(charismaBadge(10).url).toContain('charisma-2');
    expect(charismaBadge(100).url).toContain('charisma-11');
  });
});
