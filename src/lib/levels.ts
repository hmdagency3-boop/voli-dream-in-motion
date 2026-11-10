export type LevelKind = 'charisma' | 'wealth';
export type Threshold = { level: number; required: number };

/** Current level, and progress toward the next one, from total points and per-level totals. */
export function levelProgress(points: number, thresholds: Threshold[]) {
  const sorted = [...thresholds].sort((a, b) => a.level - b.level);
  let level = 0, floor = 0;
  for (const t of sorted) {
    if (points >= t.required) { level = t.level; floor = t.required; } else break;
  }
  const next = sorted.find(t => t.level === level + 1);
  if (!next) return { level, next: null, remaining: 0, percent: 100 };
  const percent = Math.min(100, Math.max(0, ((points - floor) / (next.required - floor)) * 100));
  return { level, next: next.required, remaining: next.required - points, percent };
}
