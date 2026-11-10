import { vipEntranceArt } from "@/lib/vip-art";
import { vipTier } from "@/lib/vip";

/** Room entrance bar: the tier's picture flies in with the member's name on its plate. */
export function VipEntrance({ level, name, play = true, className = "" }: { level: number; name: string; play?: boolean; className?: string }) {
  const tier = vipTier(level);
  const art = vipEntranceArt(level);
  if (!tier || !art) return null;
  const box = art.name;
  const k = art.textScale ?? 1;
  return (
    <div
      role="img"
      aria-label={`دخولية ${tier.nameAr}: ${name}`}
      className={`relative w-full select-none ${play ? "animate-vip-entrance" : ""} ${className}`}
      style={{ containerType: "inline-size" }}
    >
      <img src={art.url} alt="" draggable={false} className={`block h-auto w-full ${play ? "animate-vip-glow" : ""}`} />
      {play && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 animate-vip-shine"
          style={{ maskImage: `url(${art.url})`, WebkitMaskImage: `url(${art.url})`, maskSize: "100% 100%", WebkitMaskSize: "100% 100%" }}
        />
      )}
      <span
        className="absolute flex items-center justify-center gap-[1.2cqw] overflow-hidden px-[1cqw] text-on-media"
        style={{ left: `${box.left}%`, right: `${box.right}%`, top: `${box.top}%`, bottom: `${box.bottom}%` }}
      >
        <bdi className="truncate font-display font-extrabold drop-shadow-[0_1px_2px_rgb(0_0_0/0.9)]" style={{ fontSize: `${4.6 * k}cqw` }}>{name}</bdi>
        <span className="shrink-0 font-semibold opacity-90 drop-shadow-[0_1px_2px_rgb(0_0_0/0.9)]" style={{ fontSize: `${3.4 * k}cqw` }}>دخل الروم</span>
      </span>
    </div>
  );
}
