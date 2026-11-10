import type { ReactNode } from "react";

/**
 * A store frame (headwear) drawn around a round profile picture. The frame picture is square with an
 * empty middle; it is drawn larger than the picture so its ring sits outside it, and never blocks taps.
 */
export function HeadwearFrame({ art, children, className = "" }: { art?: string | null | undefined; children: ReactNode; className?: string }) {
  if (!art) return <>{children}</>;
  return (
    <span className={`relative inline-grid shrink-0 ${className}`}>
      {children}
      <img src={art} alt="" aria-hidden draggable={false}
        className="pointer-events-none absolute left-1/2 top-1/2 z-10 aspect-square w-[150%] max-w-none -translate-x-1/2 -translate-y-1/2 select-none object-contain" />
    </span>
  );
}
