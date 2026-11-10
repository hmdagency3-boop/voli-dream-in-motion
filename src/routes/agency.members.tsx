import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { AppScreen } from "@/components/AppScreen";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AgencyTopBar, AgentOnly, AgentTag, Notice, PersonAvatar, PersonName, useAgencyState } from "@/components/agency/AgencyParts";
import { agencyErrorMessage, getMembers, removeMember, type Agency } from "@/lib/agency";
import { shownId } from "@/lib/special-id";
import type { RoomPerson } from "@/lib/rooms";

export const Route = createFileRoute("/agency/members")({
  head: () => ({
    meta: [
      { title: "أعضاء الوكالة — voli" },
      { name: "description", content: "المضيفين المفعّلين في وكالتك على voli." },
      { property: "og:title", content: "أعضاء الوكالة — voli" },
      { property: "og:description", content: "أعضاء وكالتك على voli." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MembersPage,
});

function MembersPage() {
  const { state, failed } = useAgencyState();
  return (
    <AppScreen>
      {state?.kind !== "agent" && <AgencyTopBar title="أعضاء الوكالة" />}
      <AgentOnly state={state} failed={failed}>{(s) => <Members agency={s.agency} />}</AgentOnly>
    </AppScreen>
  );
}

function Members({ agency }: { agency: Agency }) {
  const [rows, setRows] = useState<{ person: RoomPerson; agent: boolean }[] | null>(null);
  const [q, setQ] = useState("");
  const [removing, setRemoving] = useState<RoomPerson | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => { getMembers(agency).then(setRows, () => setRows([])); }, [agency, version]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!rows || !t) return rows;
    return rows.filter((r) => r.person.display_name.toLowerCase().includes(t) || shownId(r.person).includes(t) || String(r.person.public_id).includes(t));
  }, [rows, q]);

  async function confirmRemove() {
    if (!removing) return;
    try { await removeMember(removing.auth_id); toast.success("اتشال العضو من الوكالة"); setVersion((v) => v + 1); }
    catch (err) { toast.error(agencyErrorMessage(err)); }
    finally { setRemoving(null); }
  }

  return (
    <>
      <AgencyTopBar title={`أعضاء الوكالة${rows ? ` (${rows.length})` : ""}`} />
      <div className="relative mx-4">
        <Search className="pointer-events-none absolute start-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="البحث بالـ ID أو الاسم" className="rounded-full ps-10" />
      </div>
      {!shown ? <Notice>…</Notice> : shown.length === 0 ? <Notice>مافيش أعضاء.</Notice> : (
        <ul className="mx-4 mt-3 space-y-2.5">
          {shown.map((r) => (
            <li key={r.person.auth_id} className="flex items-center gap-3 rounded-[1.25rem] border bg-card p-3 shadow-soft">
              <PersonAvatar person={r.person} />
              <PersonName person={r.person} badge={r.agent ? <AgentTag /> : undefined} />
              {!r.agent && (
                <Button size="sm" variant="destructive" onClick={() => setRemoving(r.person)} className="shrink-0 rounded-full px-5">إزالة</Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <AlertDialog open={!!removing} onOpenChange={(o) => { if (!o) setRemoving(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>إزالة {removing?.display_name} من الوكالة؟</AlertDialogTitle>
            <AlertDialogDescription>الهدايا اللي هتوصله بعد الإزالة مش هتتحسب في دخل الوكالة.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRemove}>تأكيد الإزالة</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
