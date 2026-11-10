import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AppScreen } from "@/components/AppScreen";
import { Button } from "@/components/ui/button";
import { AgencyTopBar, AgentOnly, Diamonds, Notice, PersonName, useAgencyState } from "@/components/agency/AgencyParts";
import { agencyCommission, formatDiamonds, getMembersIncome, weekRange, type Agency } from "@/lib/agency";
import type { RoomPerson } from "@/lib/rooms";

export const Route = createFileRoute("/agency/income")({
  head: () => ({
    meta: [
      { title: "دخل الأعضاء — voli" },
      { name: "description", content: "دخل كل مضيف في وكالتك على voli بالأسبوع، مع إجمالي الوكالة وعمولتها." },
      { property: "og:title", content: "دخل الأعضاء — voli" },
      { property: "og:description", content: "دخل أعضاء وكالتك على voli." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: IncomePage,
});

function IncomePage() {
  const { state, failed } = useAgencyState();
  return (
    <AppScreen>
      <AgencyTopBar title="دخل الأعضاء" />
      <AgentOnly state={state} failed={failed}>{(s) => <Income agency={s.agency} />}</AgentOnly>
    </AppScreen>
  );
}

function Income({ agency }: { agency: Agency }) {
  const [offset, setOffset] = useState(0);
  const range = useMemo(() => weekRange(new Date(), offset), [offset]);
  const [rows, setRows] = useState<{ person?: RoomPerson | undefined; host_id: string; diamonds: number; active: boolean }[] | null>(null);
  useEffect(() => { setRows(null); getMembersIncome(range.from, range.to).then(setRows, () => setRows([])); }, [range.from, range.to]);

  const total = rows?.reduce((s, r) => s + r.diamonds, 0) ?? null;
  const commission = total == null ? null : agencyCommission(total, agency.commission_percent);

  return (
    <>
      <div className="mx-4 flex items-center justify-between gap-2 rounded-full border bg-card p-1.5">
        <Button size="icon" variant="ghost" aria-label="الأسبوع اللي قبله" onClick={() => setOffset((o) => o - 1)} className="rounded-full"><ChevronRight className="size-5" /></Button>
        <span className="text-sm font-semibold tabular-nums" dir="ltr">{range.from} ~ {range.to}</span>
        <Button size="icon" variant="ghost" aria-label="الأسبوع اللي بعده" disabled={offset >= 0} onClick={() => setOffset((o) => o + 1)} className="rounded-full"><ChevronLeft className="size-5" /></Button>
      </div>

      <div className="mx-4 mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-[1.25rem] border bg-card p-4 shadow-soft">
          <p className="text-xs text-muted-foreground">إجمالي دخل الماس</p>
          <Diamonds value={total} className="mt-1 text-xl" />
        </div>
        <div className="rounded-[1.25rem] border bg-card p-4 shadow-soft">
          <p className="text-xs text-muted-foreground">عمولتي{agency.commission_percent != null ? ` (${agency.commission_percent}%)` : ""}</p>
          {agency.commission_percent == null
            ? <p className="mt-1.5 text-[11px] font-semibold text-muted-foreground">النسبة هتتحدد في سياسة التطبيق</p>
            : <Diamonds value={commission} className="mt-1 text-xl" />}
        </div>
      </div>

      {!rows ? <Notice>…</Notice> : rows.length === 0 ? <Notice>مافيش دخل في الأسبوع ده.</Notice> : (
        <div className="mx-4 mt-4 overflow-hidden rounded-[1.25rem] border bg-card">
          <div className="grid grid-cols-[1fr_auto] gap-3 border-b px-4 py-2.5 text-xs font-semibold text-muted-foreground">
            <span>مضيف</span><span>إجمالي دخل الماس</span>
          </div>
          <ul>
            {rows.map((r, i) => (
              <li key={r.host_id} className={`grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-3 ${i ? "border-t" : ""}`}>
                <PersonName person={r.person} badge={r.active ? undefined : <span className="text-[10px] text-muted-foreground">(خرج)</span>} />
                <span className="font-sans text-sm font-bold tabular-nums">{formatDiamonds(r.diamonds)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="mx-4 mt-3 text-[11px] text-muted-foreground">بيتحسب دخل المضيف بس وهو مفعّل في الوكالة. الأيام بتوقيت القاهرة.</p>
    </>
  );
}
