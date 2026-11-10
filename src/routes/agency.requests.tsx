import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { AppScreen } from "@/components/AppScreen";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AgencyTopBar, AgentOnly, Notice, PersonAvatar, PersonName, useAgencyState } from "@/components/agency/AgencyParts";
import { agencyErrorMessage, decideJoin, getJoinRequests, type Agency, type JoinRequest } from "@/lib/agency";
import { shownId } from "@/lib/special-id";
import type { RoomPerson } from "@/lib/rooms";

export const Route = createFileRoute("/agency/requests")({
  head: () => ({
    meta: [
      { title: "طلبات الانضمام — voli" },
      { name: "description", content: "اقبل أو ارفض طلبات المضيفين للانضمام لوكالتك على voli." },
      { property: "og:title", content: "طلبات الانضمام — voli" },
      { property: "og:description", content: "طلبات الانضمام لوكالتك على voli." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RequestsPage,
});

const statusText: Record<JoinRequest["status"], string> = {
  pending: "", accepted: "تم القبول", rejected: "تم الرفض", cancelled: "اتلغى",
};

function RequestsPage() {
  const { state, failed } = useAgencyState();
  return (
    <AppScreen>
      <AgencyTopBar title="قائمة الطلبات" />
      <AgentOnly state={state} failed={failed}>{(s) => <Requests agency={s.agency} />}</AgentOnly>
    </AppScreen>
  );
}

function Requests({ agency }: { agency: Agency }) {
  const [rows, setRows] = useState<(JoinRequest & { person?: RoomPerson | undefined })[] | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => { getJoinRequests(agency.id).then(setRows, () => setRows([])); }, [agency.id, version]);

  const shown = useMemo(() => {
    const t = q.trim();
    if (!rows || !t) return rows;
    return rows.filter((r) => r.person && (shownId(r.person).includes(t) || String(r.person.public_id).includes(t)));
  }, [rows, q]);

  async function decide(id: string, accept: boolean) {
    setBusy(id);
    try { await decideJoin(id, accept); toast.success(accept ? "اتقبل وبقى مضيف في الوكالة" : "اترفض الطلب"); }
    catch (err) { toast.error(agencyErrorMessage(err)); }
    finally { setBusy(null); setVersion((v) => v + 1); }
  }

  return (
    <>
      <div className="relative mx-4">
        <Search className="pointer-events-none absolute start-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} inputMode="numeric" placeholder="بحث بالايدي" className="rounded-full ps-10" />
      </div>
      <p className="mx-4 mt-2 text-xs text-muted-foreground">بيظهر طلبات آخر 7 أيام بس، رد عليها في الوقت المناسب.</p>
      {!shown ? <Notice>…</Notice> : shown.length === 0 ? <Notice>مافيش طلبات.</Notice> : (
        <ul className="mx-4 mt-3 space-y-2.5">
          {shown.map((r) => (
            <li key={r.id} className="flex items-center gap-3 rounded-[1.25rem] border bg-card p-3 shadow-soft">
              <PersonAvatar person={r.person} />
              <PersonName person={r.person} />
              {r.status === "pending" ? (
                <div className="flex shrink-0 gap-1.5">
                  <Button size="sm" disabled={busy === r.id} onClick={() => decide(r.id, true)} className="rounded-full px-4">قبول</Button>
                  <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => decide(r.id, false)} className="rounded-full px-4">رفض</Button>
                </div>
              ) : (
                <span className="shrink-0 text-xs text-muted-foreground">{statusText[r.status]}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
