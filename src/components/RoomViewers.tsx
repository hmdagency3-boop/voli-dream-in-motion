import { Link } from "@tanstack/react-router";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { VipBadge, VipFrame } from "@/components/VipBadge";
import { activeVipLevel } from "@/lib/vip";
import { shownId } from "@/lib/special-id";
import type { RoomPerson } from "@/lib/rooms";

/* voli's own small icons, drawn to match the gold room identity. */
function CrownIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 10H5L3 8z" fill="currentColor" />
      <circle cx="12" cy="4" r="1.6" fill="currentColor" />
      <path d="M5 20h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
function MicIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
      <path d="M6 11a6 6 0 0012 0M12 17v4" />
    </svg>
  );
}
function EyeIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" fill="currentColor" />
    </svg>
  );
}
function GemIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M6 3h12l4 6-10 12L2 9l4-6z" fill="currentColor" />
      <path d="M2 9h20M9 3l3 18 3-18" stroke="var(--background)" strokeOpacity=".35" strokeWidth="1.2" fill="none" />
    </svg>
  );
}

function Face({ p }: { p: RoomPerson }) {
  return p.avatar_url ? (
    <img src={p.avatar_url} alt="" className="size-12 rounded-full object-cover" />
  ) : (
    <span className="grid size-12 place-items-center rounded-full bg-muted text-lg font-bold">{p.display_name.slice(0, 1)}</span>
  );
}

function Row({ p, owner, onMic, me, vip, onPick }: { p: RoomPerson; owner: boolean; onMic: boolean; me: boolean; vip: number; onPick: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        className={`relative flex w-full items-center gap-3 overflow-hidden rounded-2xl p-2.5 text-start transition active:scale-[.98] ${vip ? "viewer-vip" : "hover:bg-muted"}`}
      >
        <VipFrame level={vip}><Face p={p} /></VipFrame>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className={`truncate font-bold ${vip ? "text-rank-gold" : ""}`}>{p.display_name}</span>
            {me && <span className="rounded-full bg-primary/15 px-1.5 text-[10px] font-bold text-primary">أنت</span>}
          </span>
          <span className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span dir="ltr" className="tabular-nums">ID:{shownId(p)}</span>
            {owner && <span className="inline-flex items-center gap-0.5 rounded-full bg-rank-gold/15 px-1.5 py-0.5 font-bold text-rank-gold"><CrownIcon className="size-3" />صاحب الروم</span>}
            {onMic && <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/15 px-1.5 py-0.5 font-bold text-primary"><MicIcon className="size-3" />على المايك</span>}
          </span>
        </span>
        <VipBadge level={vip} />
      </button>
    </li>
  );
}

export function RoomViewers({ open, onOpenChange, members, people, ownerId, seated, me, onPick }: {
  open: boolean; onOpenChange: (o: boolean) => void; members: string[]; people: Record<string, RoomPerson>;
  ownerId?: string | undefined; seated: Set<string>; me?: string | undefined; onPick: (p: RoomPerson) => void;
}) {
  const list = members.map((id) => people[id]).filter(Boolean) as RoomPerson[];
  const rank = (p: RoomPerson) => (p.auth_id === ownerId ? 1000 : 0) + activeVipLevel(p) * 10 + (seated.has(p.auth_id) ? 1 : 0);
  list.sort((a, b) => rank(b) - rank(a));
  const vips = list.filter((p) => activeVipLevel(p) > 0);
  const crowd = list.filter((p) => activeVipLevel(p) === 0);
  const myVip = activeVipLevel(people[me ?? ""]);

  const row = (p: RoomPerson) => (
    <Row key={p.auth_id} p={p} owner={p.auth_id === ownerId} onMic={seated.has(p.auth_id)} me={p.auth_id === me} vip={activeVipLevel(p)} onPick={() => onPick(p)} />
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto flex max-h-[75dvh] max-w-md flex-col gap-0 rounded-t-3xl p-0">
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-muted-foreground/30" />
        <div className="flex items-center justify-center gap-2 px-4 pb-3 pt-3">
          <EyeIcon className="size-5 text-rank-gold" />
          <SheetTitle className="text-lg">المتواجدين الآن</SheetTitle>
          <span className="rounded-full bg-muted px-2 text-sm font-bold tabular-nums">{list.length}</span>
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-6">
          <div className="flex items-center justify-between px-1 py-2">
            <h3 className="flex items-center gap-1.5 text-sm font-bold text-muted-foreground"><GemIcon className="size-4 text-rank-gold" />كبار الشخصيات ({vips.length})</h3>
            {!myVip && (
              <Link to="/vip" onClick={() => onOpenChange(false)} className="viewer-cta inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold">
                <CrownIcon className="size-3.5" />اشترك VIP
              </Link>
            )}
          </div>
          {vips.length ? <ul className="grid gap-2">{vips.map(row)}</ul> : <p className="px-1 pb-2 text-xs text-muted-foreground">مفيش كبار شخصيات في الروم دلوقتي</p>}
          <h3 className="mt-4 flex items-center gap-1.5 px-1 py-2 text-sm font-bold text-muted-foreground"><EyeIcon className="size-4" />الجمهور ({crowd.length})</h3>
          {crowd.length ? <ul className="grid gap-1">{crowd.map(row)}</ul> : <p className="px-1 text-xs text-muted-foreground">لا يوجد</p>}
        </div>
      </SheetContent>
    </Sheet>
  );
}
