import type { ReactNode } from "react";
import type { ProfileCardArt } from "@/lib/vip-art";
import { cn } from "@/lib/utils";

/**
 * The popped-up profile card for a VIP tier: the tier's picture is the whole card and the
 * member's details sit inside the picture's empty inner window (insets live in vip-art),
 * so the artwork's frame, crest and dragons stay intact at every screen size.
 * The window itself is see-through in the picture, so the room shows behind the details.
 */
export function VipProfileCard({ art, avatar, name, subCard, className }: {
  art: ProfileCardArt;
  avatar: ReactNode;
  name: string;
  subCard?: ReactNode;
  className?: string;
}) {
  const { left, right, top, bottom } = art.canvas;
  return (
    <div className={cn("relative w-full", className)} style={{ aspectRatio: String(art.aspect) }}>
      <img src={art.url} alt="" className="absolute inset-0 size-full object-contain" />
      <div
        className="absolute flex flex-col items-center text-center"
        style={{ left: `${left}%`, right: `${right}%`, top: `${top}%`, bottom: `${bottom}%` }}
      >
        <div className="aspect-square w-[42%] shrink-0 overflow-hidden rounded-full shadow-[0_0_16px_-4px] shadow-rank-gold/60 ring-2 ring-rank-gold/70">
          {avatar}
        </div>
        <div className="mt-2 w-full min-w-0">
          <div className="truncate font-display text-lg font-extrabold text-on-media [text-shadow:0_1px_3px_oklch(0.1_0.03_50/0.95)]">
            {name}
          </div>
        </div>
        {subCard ? (
          <div className="mt-auto w-full px-[6%] pb-[3%]">
            <div className="rounded-2xl bg-overlay/70 px-3 py-2.5 backdrop-blur-[2px]">{subCard}</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
