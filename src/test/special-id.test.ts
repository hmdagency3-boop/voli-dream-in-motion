import { describe, expect, it } from 'vitest';
import { shownId, specialIdFrame } from '@/lib/special-id';

describe('special ID card by VIP tier', () => {
  it('VIP 3–4 get the special ID card (silver frame)', () => {
    expect(specialIdFrame(3).name).toBe('silver');
    expect(specialIdFrame(4).name).toBe('silver');
  });
  it('admin-granted special ID below VIP 3 uses the silver frame', () => {
    expect(specialIdFrame(0).name).toBe('silver');
    expect(specialIdFrame(2).name).toBe('silver');
  });
  it('VIP 5–6 get the gold ID card', () => {
    expect(specialIdFrame(5).name).toBe('gold');
    expect(specialIdFrame(6).name).toBe('gold');
  });
  it('VIP 7 gets the diamond card and VIP 8 the legendary card, each on its own frame', () => {
    expect(specialIdFrame(7).name).toBe('purple');
    expect(specialIdFrame(8).name).toBe('red');
  });
});

describe('shown ID', () => {
  it('special ID replaces the normal ID', () => {
    expect(shownId({ public_id: 1234567, special_id: '777' })).toBe('777');
  });
  it('without a special ID the normal ID shows', () => {
    expect(shownId({ public_id: 1234567, special_id: null })).toBe('1234567');
  });
});
