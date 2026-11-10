import type { Badge } from '@/lib/badges';

/**
 * Level badge picture with the level number written on its plate.
 * Pass `height` (px) to give every badge the same height so different badge shapes line up;
 * otherwise it scales with its width.
 */
export function LevelBadge({ badge, level, locked = false, className = '', height }: { badge: Badge; level: number; locked?: boolean; className?: string; height?: number }) {
  const fixed = height !== undefined;
  return (
    <div
      dir="ltr"
      className={`relative ${fixed ? 'inline-block shrink-0' : '[container-type:inline-size]'} ${className}`}
      style={fixed ? { height } : undefined}
      aria-label={`المستوى ${level}`}
      role="img"
    >
      <img src={badge.url} alt="" draggable={false} className={`block select-none ${fixed ? 'h-full w-auto' : 'w-full'} ${locked ? 'opacity-50 grayscale' : ''}`} />
      <span
        className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap font-sans font-semibold leading-none tabular-nums text-on-media [text-shadow:0_1px_1px_rgb(0_0_0/0.6)]"
        style={{ left: `${badge.textX}%`, top: `${badge.textY}%`, fontSize: fixed ? Math.round(height * 0.34) : '12cqw' }}
      >
        {level}
      </span>
    </div>
  );
}
