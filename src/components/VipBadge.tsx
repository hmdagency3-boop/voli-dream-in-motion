import type { ReactNode } from "react";
import { Crown } from "lucide-react";
import { vipTier } from "@/lib/vip";
import { vipBadgeArt } from "@/lib/vip-art";
import { cn } from "@/lib/utils";

const badgeSizes = {
  compact: "h-6 w-11",
  tab: "h-20 w-28",
  showcase: "h-48 w-72 max-w-full vip-badge-showcase",
};

/** Chat badge "Dragon V1…V8": the tier's picture, or a drawn placeholder until it arrives. */
export function VipBadge({ level, size = "compact", className = "" }: { level: number; size?: keyof typeof badgeSizes; className?: string }) {
  const tier = vipTier(level);
  if (!tier) return null;
  const art = vipBadgeArt(tier.level);
  if (art) {
    return (
      <img
        src={art}
        alt={`VIP ${tier.level} — ${tier.nameAr}`}
        title={tier.nameAr}
        draggable={false}
        className={cn("inline-block shrink-0 object-contain", tier.text, badgeSizes[size], className)}
      />
    );
  }
  return (
    <span
      dir="ltr"
      role="img"
      aria-label={`VIP ${tier.level} — ${tier.nameAr}`}
      title={tier.nameAr}
      className={cn("inline-flex shrink-0 items-center justify-center gap-1 rounded-full px-1.5 font-extrabold leading-none text-vip-on", size === "compact" ? "text-[10px]" : size === "tab" ? "text-xl" : "text-4xl", tier.bg, badgeSizes[size], className)}
    >
      <Crown className={size === "compact" ? "size-2.5" : size === "tab" ? "size-6" : "size-10"} aria-hidden="true" />V{tier.level}
    </span>
  );
}

/** Profile frame for a VIP tier (coloured ring placeholder until the dragon frame pictures arrive). */
export function VipFrame({ level, children, className = "" }: { level: number; children: ReactNode; className?: string }) {
  const tier = vipTier(level);
  if (!tier) return <>{children}</>;
  return (
    <span
      className={`relative inline-grid shrink-0 rounded-full ring-4 ${tier.ring} ${className}`}
      style={tier.level >= 3 ? { boxShadow: `0 0 ${8 + tier.level * 2}px ${tier.color}` } : undefined}
      title={tier.nameAr}
    >
      {children}
    </span>
  );
}
