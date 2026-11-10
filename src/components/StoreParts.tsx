import { Clock, Play, Sparkles, User } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import coinIcon from "@/assets/coin.webp";
import { HeadwearFrame } from "@/components/HeadwearFrame";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { STORE_CATEGORIES, STORE_KINDS, type StoreCategory, type StoreKind } from "@/lib/store";

/** Headwear / ride tabs with the underline under the chosen one. */
export function KindTabs({ value, onChange }: { value: StoreKind; onChange: (k: StoreKind) => void }) {
  return (
    <div role="tablist" aria-label="نوع المنتج" className="flex gap-6 px-5">
      {STORE_KINDS.map((k) => (
        <button key={k.key} type="button" role="tab" aria-selected={value === k.key} onClick={() => onChange(k.key)}
          className={`relative pb-3 font-display text-lg font-extrabold transition ${value === k.key ? "text-on-media" : "text-on-media/50"}`}>
          {k.label}
          {value === k.key && <span className="absolute inset-x-1/4 bottom-0 h-1 rounded-full bg-primary" />}
        </button>
      ))}
    </div>
  );
}

/** simple / romantic / luxury / theme pills. */
export function CategoryPills({ value, onChange }: { value: StoreCategory; onChange: (c: StoreCategory) => void }) {
  return (
    <div role="tablist" aria-label="القسم" className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-4">
      {STORE_CATEGORIES.map((c) => (
        <button key={c.key} type="button" role="tab" aria-selected={value === c.key} onClick={() => onChange(c.key)}
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-5 py-2 text-sm font-bold transition ${value === c.key ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
          {value === c.key && <Sparkles className="size-4" />}
          {c.label}
        </button>
      ))}
    </div>
  );
}

/** One square item tile: picture, optional video button, name and a line under it (price or days). */
export function ItemTile({ art, name, selected, onSelect, onPlay, badge, footer }: {
  art: string; name: string; selected: boolean; onSelect: () => void; onPlay?: (() => void) | undefined;
  badge?: ReactNode; footer: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="relative">
        <button type="button" onClick={onSelect} aria-pressed={selected} aria-label={name}
          className={`grid aspect-square w-full place-items-center overflow-hidden rounded-2xl bg-card p-2 transition active:scale-[0.97] ${selected ? "ring-2 ring-primary" : "ring-1 ring-border"}`}>
          <img src={art} alt="" loading="lazy" draggable={false} className="size-full select-none object-contain" />
        </button>
        {badge}
        {onPlay && (
          <button type="button" onClick={onPlay} aria-label={`تشغيل فيديو ${name}`}
            className="absolute bottom-1.5 end-1.5 grid size-7 place-items-center rounded-full bg-overlay text-on-media">
            <Play className="size-3.5 fill-current" />
          </button>
        )}
      </div>
      <p dir="auto" className="mt-1.5 truncate text-center text-sm font-semibold">{name}</p>
      <div className="mt-0.5 flex items-center justify-center gap-1 text-sm font-bold tabular-nums">{footer}</div>
    </div>
  );
}

export function Price({ value }: { value: number }) {
  return <><img src={coinIcon} alt="كوينز" className="size-4 object-contain" />{value.toLocaleString("en")}</>;
}

/** "13 يوم" ribbon on the top corner of a backpack tile. */
export function DaysRibbon({ days }: { days: number }) {
  return (
    <span className="absolute -top-1 end-0 inline-flex items-center gap-1 rounded-s-full rounded-e-md bg-secondary px-2 py-0.5 text-[11px] font-bold text-secondary-foreground shadow-soft">
      <Clock className="size-3" /> {days} يوم
    </span>
  );
}

/** The member's picture in a big circle, wearing the given frame. */
export function FramePreview({ avatar, art, name }: { avatar: string | null | undefined; art: string | null | undefined; name: string }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [avatar]);
  return (
    <div className="grid place-items-center py-8">
      <HeadwearFrame art={art}>
        <span className="grid size-24 place-items-center overflow-hidden rounded-full bg-secondary text-muted-foreground ring-2 ring-on-media/70">
          {avatar && !broken
            ? <img src={avatar} alt={`صورة ${name}`} onError={() => setBroken(true)} className="size-full object-cover" draggable={false} />
            : <User className="size-10" aria-hidden />}
        </span>
      </HeadwearFrame>
    </div>
  );
}

export function VideoPreview({ url, title, onClose }: { url: string | null; title: string; onClose: () => void }) {
  return (
    <Dialog open={!!url} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm overflow-hidden p-0">
        <DialogTitle className="px-4 pt-4 text-base">{title}</DialogTitle>
        {url && <video src={url} controls autoPlay playsInline className="max-h-[70vh] w-full bg-muted" />}
      </DialogContent>
    </Dialog>
  );
}
