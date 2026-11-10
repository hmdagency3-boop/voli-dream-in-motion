import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import crest from "@/assets/agency/crest.webp";
import dragonCrest from "@/assets/agency/dragon-crest.webp";
import goldFrame from "@/assets/agency/gold-frame.webp";
import goldPill from "@/assets/agency/gold-pill.webp";
import iconMembers from "@/assets/agency/icon-members.webp";
import iconOrders from "@/assets/agency/icon-orders.webp";
import iconMemberIncome from "@/assets/agency/icon-member-income.webp";
import iconIncomeDetails from "@/assets/agency/icon-income-details.webp";
import iconExitFees from "@/assets/agency/icon-exit-fees.webp";
import diamondIcon from "@/assets/diamond.webp";
import { useAccount } from "@/hooks/use-account";
import { getAgencyState, formatDiamonds, type AgencyState } from "@/lib/agency";
import { shownId } from "@/lib/special-id";
import type { RoomPerson } from "@/lib/rooms";

/** Loads where the signed-in member stands in the agency system. */
export function useAgencyState() {
  const { session } = useAccount();
  const me = session?.user.id;
  const [state, setState] = useState<AgencyState | null>(null);
  const [failed, setFailed] = useState(false);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    if (!me) return;
    let alive = true;
    setFailed(false);
    getAgencyState(me).then((s) => { if (alive) setState(s); }, () => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [me, version]);
  return { me, state, failed, reload };
}

export function AgencyTopBar({ title, end }: { title: ReactNode; end?: ReactNode }) {
  const router = useRouter();
  return (
    <header className="relative flex items-center gap-2 px-4 pt-5 pb-3">
      <button
        type="button"
        aria-label="رجوع"
        onClick={() => router.history.back()}
        className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary transition hover:opacity-80"
      >
        <ChevronRight className="size-5" />
      </button>
      <h1 className="flex-1 truncate text-center font-display text-lg font-extrabold">{title}</h1>
      <div className="grid min-w-10 place-items-center">{end}</div>
    </header>
  );
}

export function AgencyCrest({ className = "" }: { className?: string }) {
  return <img src={crest} alt="" width={400} height={385} draggable={false} className={`select-none drop-shadow-xl ${className}`} />;
}

export function Diamonds({ value, className = "" }: { value: number | null; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 font-sans font-extrabold tabular-nums ${className}`} dir="ltr">
      {value == null ? "—" : formatDiamonds(value)}
      <img src={diamondIcon} alt="ماسة" className="size-[1em] object-contain" />
    </span>
  );
}

export function PersonAvatar({ person, size = "size-12" }: { person?: RoomPerson | undefined; size?: string }) {
  if (person?.avatar_url) return <img src={person.avatar_url} alt="" className={`${size} shrink-0 rounded-full object-cover ring-2 ring-primary/40`} />;
  return (
    <span className={`${size} grid shrink-0 place-items-center rounded-full bg-secondary font-display text-lg font-bold text-muted-foreground ring-2 ring-primary/40`}>
      {(person?.display_name ?? "?").trim().charAt(0) || "?"}
    </span>
  );
}

export function PersonName({ person, badge }: { person?: RoomPerson | undefined; badge?: ReactNode | undefined }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="flex items-center gap-1.5 truncate text-sm font-bold">
        <span className="truncate">{person?.display_name ?? "عضو"}</span>
        {badge}
      </p>
      {person && <p className="mt-0.5 text-xs text-muted-foreground" dir="ltr">ID:{shownId(person)}</p>}
    </div>
  );
}

export function AgentTag() {
  return <span className="shrink-0 rounded-md bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">وكيل</span>;
}

type MenuTo = "/agency/members" | "/agency/requests" | "/agency/income" | "/agency/my-income" | "/agency/apply";
export function AgencyMenuCard({ to, icon, title, hint, count }: { to: MenuTo; icon: ReactNode; title: string; hint: string; count?: number | undefined }) {
  return (
    <Link to={to} className="flex items-center gap-3 rounded-[1.5rem] border bg-card px-4 py-4 shadow-soft transition active:scale-[0.99]">
      <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary/15 text-primary">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 font-display text-base font-extrabold">
          {title}
          {!!count && <span className="rounded-full bg-live px-2 py-0.5 font-sans text-[10px] font-bold text-primary-foreground">{count}</span>}
        </span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">{hint}</span>
      </span>
      <ChevronLeft className="size-5 shrink-0 text-muted-foreground" />
    </Link>
  );
}

/** Gold-bordered midnight panel from the agency artwork; stretches to any size (9-slice). */
export function GoldFrame({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`border-solid ${className}`}
      style={{ borderWidth: 13, borderImage: `url(${goldFrame}) 26 fill / 13px stretch` }}
    >
      {children}
    </div>
  );
}

/** The small gold-outlined button/plate from the agency artwork (9-slice). */
export function GoldPill({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`flex min-h-8 items-center justify-center border-solid text-center text-sm font-bold text-agency-gold ${className}`}
      style={{ borderWidth: 10, borderImage: `url(${goldPill}) 20 fill / 10px stretch` }}
    >
      <span className="-my-2 truncate">{children}</span>
    </span>
  );
}

export const AGENCY_ICONS = {
  members: iconMembers,
  orders: iconOrders,
  memberIncome: iconMemberIncome,
  incomeDetails: iconIncomeDetails,
  exitFees: iconExitFees,
} as const;

/** Golden dragon crest; the member's picture sits inside the shield's round window. */
export function DragonCrest({ person, className = "" }: { person?: RoomPerson | undefined; className?: string }) {
  return (
    <div className={`relative aspect-[520/529] select-none ${className}`}>
      {/* Round window inside the shield, measured on the artwork (percent of the picture). */}
      <div className="absolute left-[29%] top-[38.3%] h-[41.2%] w-[41.6%] overflow-hidden rounded-full">
        {person?.avatar_url ? (
          <img src={person.avatar_url} alt="" className="size-full object-cover" />
        ) : (
          <span className="grid size-full place-items-center bg-muted font-display text-4xl font-bold text-agency-gold">
            {(person?.display_name ?? "?").trim().charAt(0) || "?"}
          </span>
        )}
      </div>
      <img src={dragonCrest} alt="" width={520} height={529} draggable={false} className="pointer-events-none relative size-full drop-shadow-xl" />
    </div>
  );
}

/** One gold row of the agent dashboard: icon, title and a gold plate on the far side. */
export function GoldMenuRow({ to, icon, title, value, disabled }: {
  to?: MenuTo | undefined; icon: string; title: string; value: ReactNode; disabled?: boolean | undefined;
}) {
  const body = (
    <GoldFrame className="flex items-center gap-3 px-2 py-1.5">
      <img src={icon} alt="" className="h-10 w-11 shrink-0 object-contain" draggable={false} />
      <span className="min-w-0 flex-1 truncate font-display text-base font-extrabold text-agency-gold">{title}</span>
      <GoldPill className="w-[34%] shrink-0">{value}</GoldPill>
    </GoldFrame>
  );
  if (!to || disabled) return <div aria-disabled className="opacity-80">{body}</div>;
  return <Link to={to} className="block transition active:scale-[0.99]">{body}</Link>;
}

export function Notice({ children }: { children: ReactNode }) {
  return <p className="mx-4 mt-6 rounded-2xl border bg-card px-4 py-6 text-center text-sm text-muted-foreground">{children}</p>;
}

/** Shown on pages that only the agent of an agency can open. */
export function AgentOnly({ state, failed, children }: { state: AgencyState | null; failed: boolean; children: (s: Extract<AgencyState, { kind: "agent" }>) => ReactNode }) {
  if (failed) return <Notice>ماقدرناش نحمّل بيانات الوكالة، جرب تاني.</Notice>;
  if (!state) return <Notice>…</Notice>;
  if (state.kind === "missing") return <Notice>نظام الوكالات لسه مش جاهز في قاعدة البيانات.</Notice>;
  if (state.kind !== "agent") return <Notice>الصفحة دي للوكيل بس.</Notice>;
  return <>{children(state)}</>;
}
