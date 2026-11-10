import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { BadgeCheck, Copy, Search, Wallet } from "lucide-react";
import { toast } from "sonner";
import { AppScreen } from "@/components/AppScreen";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAccount } from "@/hooks/use-account";
import {
  AGENCY_ICONS, AgencyCrest, AgencyMenuCard, AgencyTopBar, Diamonds, DragonCrest, GoldFrame, GoldMenuRow, GoldPill, Notice,
  PersonAvatar, PersonName, useAgencyState,
} from "@/components/agency/AgencyParts";
import {
  agencyCommission, agencyErrorMessage, cancelJoin, findAgency, getAgencySummary, parseAgencyCode, requestJoin,
  type AgencyState, type AgencySummary, type FoundAgency,
} from "@/lib/agency";

export const Route = createFileRoute("/agency/")({
  head: () => ({
    meta: [
      { title: "وكالتي — voli" },
      { name: "description", content: "نظام الوكالات على voli: افتح وكالتك أو انضم لوكالة بكودها وتابع دخل المضيفين." },
      { property: "og:title", content: "وكالتي — voli" },
      { property: "og:description", content: "افتح وكالتك أو انضم لوكالة على voli." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AgencyPage,
});

function AgencyPage() {
  const { me, state, failed, reload } = useAgencyState();

  return (
    <AppScreen>
      <div className="min-h-full bg-agency">
      <AgencyTopBar title="وكالتي" />
      {failed ? <Notice>ماقدرناش نحمّل بيانات الوكالة، جرب تاني.</Notice>
        : !state ? <Notice>…</Notice>
        : state.kind === "missing" ? <Notice>نظام الوكالات لسه مش جاهز في قاعدة البيانات.</Notice>
        : state.kind === "agent" ? <AgentHome state={state} />
        : state.kind === "host" ? <HostHome state={state} />
        : <JoinOrApply state={state} reload={reload} />}

      </div>
    </AppScreen>
  );
}

function CodeChip({ code }: { code: number }) {
  return (
    <button
      type="button"
      onClick={() => { navigator.clipboard.writeText(String(code)); toast.success("تم نسخ كود الوكالة"); }}
      className="inline-flex items-center gap-1.5 rounded-full border border-agency-gold/50 bg-agency-gold/10 px-2.5 py-1 text-[11px] font-bold text-agency-gold"
      dir="ltr"
    >
      كود: {code}
      <Copy className="size-3.5" />
    </button>
  );
}

function AgentHome({ state }: { state: Extract<AgencyState, { kind: "agent" }> }) {
  const { profile } = useAccount();
  const [sum, setSum] = useState<AgencySummary | null>(null);
  useEffect(() => { getAgencySummary().then(setSum, () => setSum(null)); }, []);
  const commission = sum ? agencyCommission(sum.this_week, sum.commission_percent) : null;

  return (
    <div className="px-3 pb-4">
      {/* Dragon crest overlapping the top of the stats panel, as in the agency artwork. */}
      <DragonCrest person={profile ? { auth_id: "", ...profile } : undefined} className="relative z-10 mx-auto w-[58%]" />
      <GoldFrame className="relative -mt-[14%] px-3 pb-3 pt-2">
        {/* Free corners beside the shield: agency name and code. */}
        <div className="relative pt-[15%]">
          <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2">
            <div className="w-[30%] min-w-0">
              <p className="truncate font-display text-sm font-extrabold text-agency-gold">{state.agency.name}</p>
              <p className="text-[10px] text-agency-gold-soft">الوكيل</p>
            </div>
            <div className="flex w-[30%] justify-end"><CodeChip code={state.agency.code} /></div>
          </div>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <Stat label="ماس الأسبوع" value={<Diamonds value={sum?.this_week ?? null} />} />
          <Stat label="الأسبوع الماضي" value={<Diamonds value={sum?.last_week ?? null} />} />
          <Stat
            label={`العمولة${sum?.commission_percent != null ? ` (${sum.commission_percent}%)` : ""}`}
            value={commission == null ? "—" : <Diamonds value={commission} />}
          />
        </div>
      </GoldFrame>

      <div className="mt-3 space-y-2.5">
        <GoldMenuRow to="/agency/members" icon={AGENCY_ICONS.members} title="أعضاء الوكالة" value={sum ? sum.members : "—"} />
        <GoldMenuRow
          to="/agency/requests" icon={AGENCY_ICONS.orders} title="قائمة الطلبات"
          value={sum ? (sum.pending_requests ? <span className="text-live">{sum.pending_requests} جديد</span> : "0") : "—"}
        />
        <GoldMenuRow to="/agency/income" icon={AGENCY_ICONS.memberIncome} title="دخل الأعضاء" value="عرض" />
        <GoldMenuRow to="/agency/my-income" icon={AGENCY_ICONS.incomeDetails} title="تفاصيل الدخل" value="عرض" />
        <GoldMenuRow icon={AGENCY_ICONS.exitFees} title="رسوم الخروج من الوكالة" value="قريباً" disabled />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0 text-center">
      <p className="mb-1 truncate text-[10px] font-semibold text-agency-gold-soft">{label}</p>
      <GoldPill className="w-full text-xs">{value}</GoldPill>
    </div>
  );
}

function HostHome({ state }: { state: Extract<AgencyState, { kind: "host" }> }) {
  return (
    <>
      <div className="relative -mt-2 flex justify-center">
        <AgencyCrest className="w-40" />
      </div>
      <section className="relative mx-4 -mt-6 rounded-[2rem] border bg-card p-5 shadow-soft">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-primary"><BadgeCheck className="size-4" /> إنت مضيف مفعّل في الوكالة</p>
        <p className="mt-2 font-display text-xl font-extrabold">{state.agency.name}</p>
        <div className="mt-2"><CodeChip code={state.agency.code} /></div>
        <div className="mt-4 flex items-center gap-3 border-t pt-3">
          <PersonAvatar person={state.owner} size="size-11" />
          <PersonName person={state.owner} badge={<span className="text-[10px] font-bold text-primary">الوكيل</span>} />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          من يوم انضمامك ({new Date(state.joined_at).toLocaleDateString("en-CA")}) كل الهدايا اللي بتوصلك بتتحسب في دخلك ودخل الوكالة.
        </p>
      </section>
      <div className="mx-4 mt-4">
        <AgencyMenuCard to="/agency/my-income" icon={<Wallet className="size-6" />} title="تفاصيل دخلي" hint="عرض سجل الدخل السابق" />
      </div>
    </>
  );
}

function JoinOrApply({ state, reload }: { state: Extract<AgencyState, { kind: "none" }>; reload: () => void }) {
  const [code, setCode] = useState("");
  const [found, setFound] = useState<FoundAgency | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    const c = parseAgencyCode(code);
    if (c == null) { toast.error("اكتب كود وكالة صحيح (أرقام بس)"); return; }
    setBusy(true);
    try { setFound(await findAgency(c)); } catch (err) { toast.error(agencyErrorMessage(err)); } finally { setBusy(false); }
  }
  async function join(id: string) {
    setBusy(true);
    try { await requestJoin(id); toast.success("اتبعت طلب الانضمام للوكيل"); setFound(undefined); setCode(""); reload(); }
    catch (err) { toast.error(agencyErrorMessage(err)); } finally { setBusy(false); }
  }
  async function cancel(id: string) {
    setBusy(true);
    try { await cancelJoin(id); toast.success("اتلغى الطلب"); reload(); }
    catch (err) { toast.error(agencyErrorMessage(err)); } finally { setBusy(false); }
  }

  const app = state.application;
  return (
    <>
      <div className="flex justify-center"><AgencyCrest className="w-36" /></div>

      {state.request ? (
        <section className="mx-4 mt-2 rounded-[1.5rem] border bg-card p-5 shadow-soft">
          <p className="text-xs font-semibold text-primary">طلب انضمام مستني رد الوكيل</p>
          <p className="mt-1 font-display text-lg font-extrabold">{state.request.agency?.name ?? "وكالة"}</p>
          {state.request.agency && <p className="text-xs text-muted-foreground" dir="ltr">كود: {state.request.agency.code}</p>}
          <Button variant="outline" disabled={busy} onClick={() => cancel(state.request!.id)} className="mt-3 w-full rounded-full">إلغاء الطلب</Button>
        </section>
      ) : (
        <section className="mx-4 mt-2 rounded-[1.5rem] border bg-card p-5 shadow-soft">
          <h2 className="font-display text-lg font-extrabold">انضم لوكالة كمضيف</h2>
          <p className="mt-1 text-xs text-muted-foreground">اكتب كود الوكالة، وابعت طلب انضمام للوكيل. دخلك يتحسب للوكالة بعد ما يقبلك.</p>
          <form onSubmit={search} className="mt-3 flex gap-2">
            <Input value={code} onChange={(e) => { setCode(e.target.value); setFound(undefined); }} inputMode="numeric" placeholder="كود الوكالة" dir="ltr" className="rounded-full text-center" maxLength={9} />
            <Button type="submit" disabled={busy} className="shrink-0 rounded-full"><Search className="size-4" /> بحث</Button>
          </form>
          {found === null && <p className="mt-3 text-center text-sm text-muted-foreground">مافيش وكالة بالكود ده.</p>}
          {found && (
            <div className="mt-3 flex items-center gap-3 rounded-2xl bg-secondary p-3">
              <PersonAvatar person={found.owner} size="size-12" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{found.name}</p>
                <p className="text-xs text-muted-foreground">كود {found.code} · {found.members} عضو · الوكيل {found.owner?.display_name ?? "—"}</p>
              </div>
              <Button size="sm" disabled={busy} onClick={() => join(found.id)} className="shrink-0 rounded-full">طلب انضمام</Button>
            </div>
          )}
        </section>
      )}

      <section className="mx-4 mt-3 rounded-[1.5rem] border bg-card p-5 shadow-soft">
        <h2 className="font-display text-lg font-extrabold">عايز تبقى وكيل؟</h2>
        {app?.status === "pending" ? (
          <p className="mt-2 text-sm text-muted-foreground">طلبك لفتح وكالة «{app.agency_name}» وصل للإدارة ومستني المراجعة.</p>
        ) : (
          <>
            {app?.status === "rejected" && (
              <p className="mt-2 rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">
                طلبك الأخير اترفض{app.reject_reason ? `: ${app.reject_reason}` : "."} تقدر تقدّم تاني.
              </p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">قدّم طلب ببياناتك، ولما الإدارة توافق هتاخد كود وكالة تلقائي.</p>
            <Button asChild disabled={!!state.request} className="mt-3 w-full rounded-full">
              <Link to="/agency/apply">قدّم طلب فتح وكالة</Link>
            </Button>
          </>
        )}
      </section>
    </>
  );
}
