import { specialIdFrame } from '@/lib/special-id';

/** Special ID written on its VIP frame. Scales with its width. */
export function SpecialIdBadge({ id, vipLevel, className = '' }: { id: string; vipLevel: number; className?: string }) {
  const frame = specialIdFrame(vipLevel);
  return (
    <span dir="ltr" role="img" aria-label={`ايدي مميز ${id}`} className={`relative inline-block [container-type:inline-size] ${className}`}>
      <img src={frame.url} alt="" draggable={false} className="block w-full select-none" />
      <span
        className="absolute inset-0 flex items-center justify-center whitespace-nowrap font-sans font-bold leading-none tabular-nums text-on-media [text-shadow:0_1px_2px_rgb(0_0_0/0.7)]"
        style={{ fontSize: id.length > 8 ? '11cqw' : '13cqw' }}
      >
        ID:{id}
      </span>
    </span>
  );
}
