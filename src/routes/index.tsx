import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { DoorOpen, Lock, Mic, Search, Users } from "lucide-react";
import { AppScreen } from "@/components/AppScreen";
import { Button } from "@/components/ui/button";
import { getLiveRooms, roomTheme, roomThemeStyle } from "@/lib/rooms";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "voli — بثوث مباشرة ترفيهية" },
      { name: "description", content: "تابع البثوث المباشرة على voli." },
      { property: "og:title", content: "voli — بثوث مباشرة ترفيهية" },
      { property: "og:description", content: "تابع البثوث المباشرة على voli." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

const categories = ["الكل", "غناء", "ألعاب", "دردشة", "DJ", "كوميديا", "رقص"];
type LiveRoom = Awaited<ReturnType<typeof getLiveRooms>>[number];

function Index() {
  const [category, setCategory] = useState("الكل");
  const [rooms, setRooms] = useState<LiveRoom[] | null>(null);

  useEffect(() => {
    let active = true;
    const load = () => getLiveRooms().then((r) => active && setRooms(r)).catch(() => active && setRooms([]));
    load();
    const t = setInterval(load, 15000);
    return () => { active = false; clearInterval(t); };
  }, []);

  return (
    <AppScreen>
        <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-5 pt-6">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">أهلاً بك</p>
            <h1 className="font-display text-3xl font-extrabold">voli<span className="text-primary">.</span></h1>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button asChild variant="secondary" size="icon" aria-label="البحث" className="size-11 rounded-full">
              <Link to="/search"><Search /></Link>
            </Button>
            <Button asChild variant="secondary" size="icon" aria-label="الروم" className="size-11 rounded-full">
              <Link to="/room/new"><DoorOpen /></Link>
            </Button>
          </div>
        </header>
        <nav aria-label="تصنيفات البث" className="no-scrollbar mt-6 flex gap-2 overflow-x-auto px-5">
          {categories.map((item) => (
            <Button key={item} variant={item === category ? "default" : "secondary"} aria-pressed={item === category} onClick={() => setCategory(item)} className="shrink-0 rounded-full">{item}</Button>
          ))}
        </nav>
        <section className="mt-6 px-5">
          <h2 className="font-display text-lg font-bold">مباشر الآن</h2>
          {rooms && rooms.length > 0 ? (
            <ul className="mt-3 grid grid-cols-2 gap-3">
              {rooms.map((r) => (
                <li key={r.id}>
                  {r.owner && (
                    <Link to="/room/$publicId" params={{ publicId: String(r.owner.public_id) }}
                      className={`relative block aspect-square overflow-hidden rounded-2xl text-on-media ${roomTheme(r.theme).className}`} style={roomThemeStyle(r.theme)}>
                      {(r.cover_url ?? r.owner.avatar_url) && <img src={r.cover_url ?? r.owner.avatar_url ?? ""} alt="" className="absolute inset-0 size-full object-cover" />}
                      <span className="absolute inset-0 bg-media-fade" />
                      <span className="absolute start-2 top-2 inline-flex items-center gap-1 rounded-full bg-overlay px-2 py-0.5 text-xs">
                        <Users className="size-3" /> {r.online}
                      </span>
                      {r.locked && <Lock className="absolute end-2 top-2 size-4" aria-label="مقفول" />}
                      <span className="absolute inset-x-2 bottom-2">
                        <span className="block truncate text-sm font-bold">{r.name}</span>
                        <span className="block truncate text-xs opacity-80">{r.owner.display_name}</span>
                      </span>
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <div role="status" className="flex min-h-72 flex-col items-center justify-center gap-4 text-muted-foreground">
              <Mic className="size-12 text-primary" aria-hidden="true" />
              <p className="text-sm">{rooms === null ? "…" : "لا توجد رومات شغالة حالياً"}</p>
              <Button asChild className="rounded-full"><Link to="/room/new">ابدأ حفلة</Link></Button>
            </div>
          )}
        </section>
    </AppScreen>
  );
}
