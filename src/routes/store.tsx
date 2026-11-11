import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Backpack, Loader2, Play, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import coinIcon from "@/assets/coin.webp";
import { AppScreen } from "@/components/AppScreen";
import { CategoryPills, FramePreview, ItemTile, KindTabs, Price, VideoPreview } from "@/components/StoreParts";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useAccount } from "@/hooks/use-account";
import { buyStoreItem, equipItem, getStoreItems, storeErrorMessage, storeMissing, useWorn, type StoreCategory, type StoreItem, type StoreKind } from "@/lib/store";

export const Route = createFileRoute("/store")({
  head: () => ({
    meta: [
      { title: "المتجر — voli" },
      { name: "description", content: "متجر voli: إطارات لصورتك ومركبات دخول للرومات، تشتريها بالكوينز." },
      { property: "og:title", content: "المتجر — voli" },
      { property: "og:description", content: "إطارات ومركبات دخول على voli." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StorePage,
});

function StorePage() {
  const { session, profile, reload } = useAccount();
  const [items, setItems] = useState<StoreItem[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [kind, setKind] = useState<StoreKind>("frame");
  const [category, setCategory] = useState<StoreCategory>("simple");
  const [picked, setPicked] = useState<Partial<Record<StoreKind, string>>>({});
  const [confirm, setConfirm] = useState(false);
  const [buying, setBuying] = useState(false);
  const [video, setVideo] = useState<StoreItem | null>(null);
  const [wornVersion, setWornVersion] = useState(0);
  const me = session?.user.id;
  const worn = useWorn([me], wornVersion)[me ?? ""];
  const balance = Number(profile?.coins ?? 0);

  useEffect(() => {
    if (!session) return;
    getStoreItems().then(setItems).catch((e) => {
      setItems([]);
      setProblem(storeMissing(e) ? "المتجر لسه مش جاهز في قاعدة البيانات" : "المتجر مافتحش، حاول تاني");
    });
  }, [session]);

  const shelf = useMemo(() => (items ?? []).filter((i) => i.kind === kind && i.category === category), [items, kind, category]);
  const selected = shelf.find((i) => i.id === picked[kind]) ?? shelf[0] ?? null;

  async function buy() {
    if (!selected) return;
    setBuying(true);
    try {
      await buyStoreItem(selected.id);
      // Bought items go on right away (the panel's other item of the same kind comes off).
      await equipItem(selected.id, true).catch(() => {});
      toast.success(`مبروك! ${selected.name} بقى معاك ولبسته`);
      reload();
      setWornVersion((v) => v + 1);
    } catch (e) {
      toast.error(storeErrorMessage(e));
    } finally {
      setBuying(false);
      setConfirm(false);
    }
  }

  const footer = (
    <div className="flex items-center justify-between gap-3 border-t bg-card px-4 py-3">
      <span className="inline-flex items-center gap-1.5 font-display text-lg font-extrabold tabular-nums">
        <img src={coinIcon} alt="رصيدك من الكوينز" className="size-6 object-contain" />
        {balance.toLocaleString("en")}
      </span>
      <Button onClick={() => setConfirm(true)} disabled={!selected} className="h-12 rounded-full px-7 text-base font-bold">
        <ShoppingCart className="size-5" /> شراء
      </Button>
    </div>
  );

  return (
    <AppScreen navigation={false} footer={footer}>
      <section className="rounded-b-[2.5rem] bg-brand pt-4 text-on-media">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center px-4">
          <Button asChild variant="ghost" size="icon" aria-label="رجوع" className="rounded-full bg-overlay text-on-media backdrop-blur">
            <Link to="/me"><ArrowRight className="size-5" /></Link>
          </Button>
          <h1 className="font-display text-2xl font-extrabold">المتجر</h1>
          <Link to="/backpack" className="inline-flex items-center gap-1.5 justify-self-end rounded-full bg-overlay px-3 py-1.5 text-sm font-bold backdrop-blur">
            <Backpack className="size-4" /> الحقيبة
          </Link>
        </div>
        <div className="mt-5"><KindTabs value={kind} onChange={setKind} /></div>
        {kind === "frame" ? (
          <FramePreview avatar={profile?.avatar_url} art={selected?.art_url ?? worn?.frame?.art_url} name={profile?.display_name ?? ""} />
        ) : (
          <div className="relative grid h-44 place-items-center">
            {selected && <img src={selected.art_url} alt={selected.name} className="h-36 max-w-[70%] object-contain drop-shadow-2xl" />}
            {selected?.video_url && (
              <Button type="button" size="sm" variant="ghost" onClick={() => setVideo(selected)} className="absolute bottom-3 rounded-full bg-overlay text-on-media">
                <Play className="size-4 fill-current" /> شوف الدخولية
              </Button>
            )}
          </div>
        )}
      </section>

      <CategoryPills value={category} onChange={setCategory} />

      {items === null ? (
        <div className="grid place-items-center py-16"><Loader2 className="size-7 animate-spin" aria-label="جاري التحميل" /></div>
      ) : problem ? (
        <p className="px-6 py-16 text-center text-sm text-muted-foreground">{problem}</p>
      ) : shelf.length === 0 ? (
        <p className="px-6 py-16 text-center text-sm text-muted-foreground">مفيش منتجات في القسم ده لسه</p>
      ) : (
        <div className="grid grid-cols-3 gap-x-3 gap-y-4 px-4">
          {shelf.map((i) => (
            <ItemTile key={i.id} art={i.art_url} name={i.name} selected={selected?.id === i.id}
              onSelect={() => setPicked((p) => ({ ...p, [kind]: i.id }))}
              onPlay={i.video_url ? () => setVideo(i) : undefined}
              footer={<Price value={i.price} />} />
          ))}
        </div>
      )}

      <AlertDialog open={confirm} onOpenChange={(o) => !buying && setConfirm(o)}>
        <AlertDialogContent className="max-w-sm rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>شراء {selected?.name}؟</AlertDialogTitle>
            <AlertDialogDescription>
              {selected && <>هتدفع {selected.price.toLocaleString("en")} كوينز لمدة {selected.duration_days} يوم، وهيتلبس على طول. لو عندك منه، الأيام بتتزوّد على اللي فاضل.</>}
              {selected && balance < selected.price && <span className="mt-2 block font-bold text-destructive">رصيدك {balance.toLocaleString("en")} كوينز بس، مش كفاية.</span>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel disabled={buying} className="rounded-full">إلغاء</AlertDialogCancel>
            <AlertDialogAction disabled={buying || !selected || balance < selected.price} onClick={(e) => { e.preventDefault(); void buy(); }} className="rounded-full">
              {buying ? <Loader2 className="animate-spin" /> : <img src={coinIcon} alt="" className="size-4 object-contain" />} اشتري
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <VideoPreview url={video?.video_url ?? null} title={video?.name ?? ""} onClose={() => setVideo(null)} />
    </AppScreen>
  );
}
