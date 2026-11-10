import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AppScreen } from "@/components/AppScreen";
import { Button } from "@/components/ui/button";
import { AgencyTopBar, Diamonds, Notice, useAgencyState } from "@/components/agency/AgencyParts";
import { formatDiamonds, getMyIncome, monthRange } from "@/lib/agency";

export const Route = createFileRoute("/agency/my-income")({
  head: () => ({
    meta: [
      { title: "تفاصيل دخلي — voli" },
      { name: "description", content: "دخلك من الهدايا يوم بيوم وإنت مفعّل في وكالة على voli." },
      { property: "og:title", content: "تفاصيل دخلي — voli" },
      { property: "og:description", content: "سجل دخلك في الوكالة على voli." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MyIncomePage,
});

function MyIncomePage() {
  const { state, failed } = useAgencyState();
  const [offset, setOffset] = useState(0);
  const range = useMemo(() => monthRange(new Date(), offset), [offset]);
  const [rows, setRows] = useState<{ day: string; diamonds: number }[] | null>(null);
  const inAgency = state?.kind === "agent" || state?.kind === "host";
  useEffect(() => {
    if (!inAgency) return;
    setRows(null);
    getMyIncome(range.from, range.to).then(setRows, () => setRows([]));
  }, [inAgency, range.from, range.to]);
  const total = rows?.reduce((s, r) => s + r.diamonds, 0) ?? null;

  return (
    <AppScreen>
      <AgencyTopBar title="دخلي" />
      {failed ? <Notice>ماقدرناش نحمّل بيانات الوكالة، جرب تاني.</Notice>
        : !state ? <Notice>…</Notice>
        : state.kind === "missing" ? <Notice>نظام الوكالات لسه مش جاهز في قاعدة البيانات.</Notice>
        : !inAgency ? <Notice>دخلك بيتحسب لما تبقى مضيف مفعّل في وكالة.</Notice>
        : (
          <>
            <div className="mx-4 flex items-center justify-between gap-2 rounded-full border bg-card p-1.5">
              <Button size="icon" variant="ghost" aria-label="الشهر اللي قبله" onClick={() => setOffset((o) => o - 1)} className="rounded-full"><ChevronRight className="size-5" /></Button>
              <span className="text-sm font-semibold tabular-nums" dir="ltr">{range.label}</span>
              <Button size="icon" variant="ghost" aria-label="الشهر اللي بعده" disabled={offset >= 0} onClick={() => setOffset((o) => o + 1)} className="rounded-full"><ChevronLeft className="size-5" /></Button>
            </div>
            <div className="mx-4 mt-3 rounded-[1.25rem] border bg-card p-4 shadow-soft">
              <p className="text-xs text-muted-foreground">الماس</p>
              <Diamonds value={total} className="mt-1 text-2xl" />
            </div>
            {!rows ? <Notice>…</Notice> : rows.length === 0 ? <Notice>مافيش دخل في الشهر ده.</Notice> : (
              <div className="mx-4 mt-4 overflow-hidden rounded-[1.25rem] border bg-card">
                <div className="grid grid-cols-2 border-b px-4 py-2.5 text-xs font-semibold text-muted-foreground">
                  <span>التاريخ</span><span className="text-end">إجمالي الماس</span>
                </div>
                <ul>
                  {rows.map((r, i) => (
                    <li key={r.day} className={`grid grid-cols-2 px-4 py-3 text-sm ${i ? "border-t" : ""}`}>
                      <span className="tabular-nums" dir="ltr">{r.day}</span>
                      <span className="text-end font-bold tabular-nums">{formatDiamonds(r.diamonds)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="mx-4 mt-3 text-[11px] text-muted-foreground">الهدايا اللي وصلتك وإنت برا الوكالة مش بتتحسب هنا.</p>
          </>
        )}
    </AppScreen>
  );
}
