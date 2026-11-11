import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AppScreen } from "@/components/AppScreen";
import { DaysRibbon, FramePreview, ItemTile, KindTabs, VideoPreview } from "@/components/StoreParts";
import { Button } from "@/components/ui/button";
import { useAccount } from "@/hooks/use-account";
import { daysLeft, equipItem, getBackpack, storeErrorMessage, storeMissing, type BackpackItem, type StoreKind } from "@/lib/store";

export const Route = createFileRoute("/backpack")({
  head: () => ({
    meta: [
      { title: "الحقيبة — voli" },
      { name: "description", content: "حقيبتك على voli: الإطارات والمركبات اللي معاك والأيام الفاضلة لكل واحدة." },
      { property: "og:title", content: "الحقيبة — voli" },
      { property: "og:description", content: "الإطارات والمركبات اللي معاك على voli." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BackpackPage,
});

function BackpackPage() {
  const { session, profile } = useAccount();
  const [items, setItems] = useState<BackpackItem[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [kind, setKind] = useState<StoreKind>("frame");
  const [picked, setPicked] = useState<Partial<Record<StoreKind, string>>>({});
  const [busy, setBusy] = useState(false);
  const [video, setVideo] = useState<BackpackItem | null>(null);

  const load = useCallback(() => getBackpack().then((r) => { setItems(r); setProblem(null); }).catch((e) => {
    setItems([]);
    setProblem(storeMissing(e) ? "المتجر لسه مش جاهز في قاعدة البيانات" : "الحقيبة مافتحتش، حاول تاني");
  }), []);
  useEffect(() => { if (session) void load(); }, [session, load]);

  const shelf = useMemo(() => (items ?? []).filter((i) => i.kind === kind), [items, kind]);
  const selected = shelf.find((i) => i.id === picked[kind]) ?? shelf.find((i) => i.equipped) ?? shelf[0] ?? null;
  const wornFrame = (items ?? []).find((i) => i.kind === "frame" && i.equipped);

  async function toggle() {
    if (!selected) return;
    setBusy(true);
    try {
      await equipItem(selected.id, !selected.equipped);
      toast.success(selected.equipped ? `شلت ${selected.name}` : `لبست ${selected.name}`);
      await load();
    } catch (e) { toast.error(storeErrorMessage(e)); }
    finally { setBusy(false); }
  }

  const label = !selected ? "" : kind === "frame" ? (selected.equipped ? "شيل الإطار" : "البس الإطار") : (selected.equipped ? "وقّف المركبة" : "استخدم المركبة");
  const footer = selected ? (
    <div className="border-t bg-card px-4 py-3">
      <Button onClick={toggle} disabled={busy} variant={selected.equipped ? "secondary" : "default"} className="h-12 w-full rounded-full text-base font-bold">
        {busy && <Loader2 className="animate-spin" />} {label}
      </Button>
    </div>
  ) : undefined;

  return (
    <AppScreen navigation={false} footer={footer}>
      <section className="rounded-b-[2.5rem] bg-brand pt-4 text-on-media">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center px-4">
          <Button asChild variant="ghost" size="icon" aria-label="رجوع للمتجر" className="rounded-full bg-overlay text-on-media backdrop-blur">
            <Link to="/store"><ArrowRight className="size-5" /></Link>
          </Button>
          <h1 className="font-display text-2xl font-extrabold">الحقيبة</h1>
          <span />
        </div>
        <div className="mt-5"><KindTabs value={kind} onChange={setKind} /></div>
        {kind === "frame" ? (
          <FramePreview avatar={profile?.avatar_url} art={(selected ?? wornFrame)?.art_url} name={profile?.display_name ?? ""} />
        ) : (
          <div className="grid h-44 place-items-center">
            {selected && <img src={selected.art_url} alt={selected.name} className="h-36 max-w-[70%] object-contain drop-shadow-2xl" />}
          </div>
        )}
      </section>

      {items === null ? (
        <div className="grid place-items-center py-16"><Loader2 className="size-7 animate-spin" aria-label="جاري التحميل" /></div>
      ) : problem ? (
        <p className="px-6 py-16 text-center text-sm text-muted-foreground">{problem}</p>
      ) : shelf.length === 0 ? (
        <div className="grid place-items-center gap-3 px-6 py-16 text-center">
          <p className="text-sm text-muted-foreground">{kind === "frame" ? "مفيش إطارات في حقيبتك لسه" : "مفيش مركبات في حقيبتك لسه"}</p>
          <Button asChild className="rounded-full"><Link to="/store">روح للمتجر</Link></Button>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-x-3 gap-y-5 px-4 pt-6">
          {shelf.map((i) => (
            <ItemTile key={i.id} art={i.art_url} name={i.name} selected={selected?.id === i.id}
              onSelect={() => setPicked((p) => ({ ...p, [kind]: i.id }))}
              onPlay={i.video_url ? () => setVideo(i) : undefined}
              badge={<DaysRibbon days={daysLeft(i.expires_at)} />}
              footer={i.equipped ? <span className="inline-flex items-center gap-1 text-xs text-primary"><Check className="size-3.5" /> مستخدم</span> : <span className="text-xs text-muted-foreground">—</span>} />
          ))}
        </div>
      )}

      <VideoPreview url={video?.video_url ?? null} title={video?.name ?? ""} onClose={() => setVideo(null)} />
    </AppScreen>
  );
}
