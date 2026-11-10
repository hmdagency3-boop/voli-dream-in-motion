import { describe, expect, it } from 'vitest';
import { levelProgress } from '@/lib/levels';

const t = [{ level: 1, required: 1000 }, { level: 2, required: 4000 }, { level: 3, required: 9000 }];

describe('levels', () => {
  it('starts at level 0 with nothing received', () => {
    expect(levelProgress(0, t)).toMatchObject({ level: 0, next: 1000, remaining: 1000 });
  });
  it('levels up only once the full amount for that level is reached', () => {
    expect(levelProgress(999, t).level).toBe(0);
    expect(levelProgress(1000, t).level).toBe(1);
    expect(levelProgress(3999, t).level).toBe(1);
    expect(levelProgress(4000, t).level).toBe(2);
  });
  it('shows progress between levels', () => {
    expect(levelProgress(2500, t)).toMatchObject({ level: 1, remaining: 1500, percent: 50 });
  });
  it('stops at the top level', () => {
    expect(levelProgress(50000, t)).toMatchObject({ level: 3, next: null, percent: 100 });
  });
});
