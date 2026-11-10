import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, Lock, LockOpen, Megaphone, Mic, Star, Users, Video, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAccount } from "@/hooks/use-account";
import {
  ANNOUNCEMENT_MAX, ROOM_NAME_MAX, ROOM_THEMES, SEAT_COUNTS, getMyRoom, isRoomPassword, roomTheme, roomThemeStyle, startParty, uploadRoomCover,
  type RoomTheme, type SeatCount,
} from "@/lib/rooms";

export const Route = createFileRoute("/room/new")({
  head: () => ({
    meta: [
      { title: "ابدأ حفلة — voli" },
      { name: "description", content: "جهّز الروم بتاعك وابدأ الحفلة على voli." },
      { property: "og:title", content: "ابدأ حفلة — voli" },
      { property: "og:description", content: "جهّز الروم بتاعك وابدأ الحفلة على voli." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RoomSetup,
});

type Panel = null | "theme" | "seats" | "lock" | "announcement";

function RoomSetup() {
  const { session, profile } = useAccount();
  const me = session?.user.id;
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState("");
  const [cover, setCover] = useState<string | null>(null);
  const [mode, setMode] = useState<"audio" | "video">("audio");
  const [seats, setSeats] = useState<SeatCount>(10);
  const [theme, setTheme] = useState<RoomTheme>("default");
  const [announcement, setAnnouncement] = useState("");
  const [locked, setLocked] = useState(false);
  /** null = keep the saved lock as it is. */
  const [password, setPassword] = useState<string | null>(null);
  const [draftPassword, setDraftPassword] = useState("");
  const [panel, setPanel] = useState<Panel>(null);
  const [uploading, setUploading] = useState(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!me || !profile || loaded) return;
    getMyRoom(me)
      .then((r) => {
        if (r) {
          setName(r.name); setCover(r.cover_url ?? profile.avatar_url); setMode(r.mode); setSeats(r.seat_count);
          setTheme(r.theme); setAnnouncement(r.announcement); setLocked(r.locked);
        } else {
          setName(`روم ${profile.display_name}`.slice(0, ROOM_NAME_MAX)); setCover(profile.avatar_url);
        }
      })
      .catch(() => { setName(`روم ${profile.display_name}`.slice(0, ROOM_NAME_MAX)); setCover(profile.avatar_url); })
      .finally(() => setLoaded(true));
  }, [me, profile, loaded]);

  async function onCover(file: File | undefined) {
    if (!file || !me) return;
    if (!file.type.startsWith("image/")) { toast.error("اختار صورة"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("الصورة لازم تكون أقل من 5 ميجا"); return; }
    setUploading(true);
    try { setCover(await uploadRoomCover(me, file)); }
    catch { toast.error("الصورة ماترفعتش. اتأكد إن تحديث الرومات اتشغّل في قاعدة البيانات"); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  function saveLock(on: boolean) {
    if (!on) { setLocked(false); setPassword(""); setPanel(null); return; }
    if (!isRoomPassword(draftPassword)) { toast.error("كلمة السر من 4 لـ 8 أرقام"); return; }
    setLocked(true); setPassword(draftPassword); setDraftPassword(""); setPanel(null);
  }

  async function onStart() {
    if (!profile || starting) return;
    const n = name.trim();
    if (!n) { toast.error("اكتب اسم الروم"); return; }
    setStarting(true);
    try {
      await startParty({ name: n, coverUrl: cover, mode, seatCount: seats, theme, announcement: announcement.trim(), password });
      navigate({ to: "/room/$publicId", params: { publicId: String(profile.public_id) } });
    } catch {
      toast.error("الحفلة مابدأتش. اتأكد إن ملف supabase/004_rooms.sql اتشغّل في قاعدة البيانات");
      setStarting(false);
    }
  }

  const options = [
    { key: "theme" as const, icon: Star, label: "ثيم", hint: roomTheme(theme).label },
    { key: "seats" as const, icon: Users, label: "وضع الغرفة", hint: `${seats} مايك` },
    { key: "lock" as const, icon: locked ? Lock : LockOpen, label: "قفل", hint: locked ? "مقفول" : "مفتوح" },
    { key: "announcement" as const, icon: Megaphone, label: "إعلان", hint: announcement ? "متكتب" : "" },
  ];

  return (
    <div className="h-dvh overflow-hidden bg-muted md:p-8">
      <div className={`relative mx-auto flex h-full w-full max-w-md flex-col overflow-y-auto px-5 pb-8 pt-6 text-on-media md:rounded-[2.5rem] md:border ${roomTheme(theme).className}`} style={roomThemeStyle(theme)}>
        <header className="relative flex items-center justify-center">
          <Button asChild variant="ghost" size="icon" aria-label="إغلاق" className="absolute start-0 rounded-full text-on-media hover:bg-overlay">
            <Link to="/"><X className="size-6" /></Link>
          </Button>
          <div role="radiogroup" aria-label="نوع الروم" className="flex rounded-full border border-on-media/15 bg-overlay p-1">
            {([["audio", Mic, "صوت"], ["video", Video, "فيديو"]] as const).map(([key, Icon, label]) => (
              <button
                key={key} type="button" role="radio" aria-checked={mode === key} aria-label={label}
                onClick={() => setMode(key)}
                className={`grid h-10 w-16 place-items-center rounded-full transition ${mode === key ? "bg-primary text-primary-foreground" : "text-on-media/70"}`}
              >
                <Icon className="size-5" />
              </button>
            ))}
          </div>
        </header>

        <section className="mt-6 flex items-center gap-3 rounded-2xl border border-on-media/10 bg-overlay p-2">
          <button
            type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
            aria-label="تغيير صورة الروم"
            className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-secondary"
          >
            {cover ? <img src={cover} alt="" className="size-full object-cover" /> : <Camera className="m-auto size-7 text-muted-foreground" />}
            <span className="absolute inset-x-0 bottom-0 bg-overlay py-0.5 text-center text-xs">{uploading ? <Loader2 className="mx-auto size-3.5 animate-spin" /> : "تغيير"}</span>
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onCover(e.target.files?.[0])} />
          <input
            aria-label="اسم الروم" value={name} maxLength={ROOM_NAME_MAX} onChange={(e) => setName(e.target.value)}
            placeholder="اسم الروم"
            className="min-w-0 flex-1 bg-transparent px-2 text-lg font-bold outline-none placeholder:text-on-media/50"
          />
        </section>
        {mode === "video" && (
          <p className="mt-3 text-center text-xs text-on-media/70">الصوت والفيديو المباشر محتاجين خدمة بث هتتوصل بعدين؛ الروم هيشتغل دلوقتي بالمايكات والدردشة.</p>
        )}

        <div className="flex-1" />

        <section className="grid grid-cols-4 gap-2 text-center">
          {options.map((o) => (
            <button key={o.key} type="button" onClick={() => setPanel(o.key)} className="flex flex-col items-center gap-2">
              <span className="grid size-16 place-items-center rounded-full border border-on-media/15 bg-overlay"><o.icon className="size-6" /></span>
              <span className="text-sm font-semibold">{o.label}</span>
              <span className="min-h-4 text-xs text-on-media/60">{o.hint}</span>
            </button>
          ))}
        </section>

        <Button onClick={onStart} disabled={starting || !profile} className="mt-8 h-14 rounded-full text-lg font-bold">
          {starting ? <Loader2 className="animate-spin" /> : "بدء الحفلة"}
        </Button>
      </div>

      <Sheet open={panel !== null} onOpenChange={(o) => !o && setPanel(null)}>
        <SheetContent side="bottom" className="mx-auto max-w-md rounded-t-3xl">
          {panel === "theme" && (
            <>
              <SheetHeader><SheetTitle>ثيم الروم</SheetTitle></SheetHeader>
              <div className="grid grid-cols-4 gap-3 p-4">
                {ROOM_THEMES.map((t) => (
                  <button key={t.key} type="button" onClick={() => { setTheme(t.key); setPanel(null); }} aria-pressed={theme === t.key} className="flex flex-col items-center gap-1.5 text-sm">
                    <span className={`h-20 w-full rounded-xl ring-2 ${t.className} ${theme === t.key ? "ring-primary" : "ring-transparent"}`} style={roomThemeStyle(t.key)} />
                    {t.label}
                  </button>
                ))}
              </div>
            </>
          )}
          {panel === "seats" && (
            <>
              <SheetHeader><SheetTitle>عدد المايكات</SheetTitle></SheetHeader>
              <div className="grid grid-cols-4 gap-3 p-4">
                {SEAT_COUNTS.map((n) => (
                  <Button key={n} variant={seats === n ? "default" : "secondary"} onClick={() => { setSeats(n); setPanel(null); }} className="h-14 rounded-2xl text-lg">{n}</Button>
                ))}
              </div>
            </>
          )}
          {panel === "lock" && (
            <>
              <SheetHeader><SheetTitle>قفل الروم</SheetTitle></SheetHeader>
              <div className="space-y-3 p-4">
                <p className="text-sm text-muted-foreground">اللي يدخل الروم لازم يكتب كلمة السر. إنت كصاحب الروم بتدخل من غيرها.</p>
                <input
                  aria-label="كلمة سر الروم" inputMode="numeric" dir="ltr" maxLength={8} value={draftPassword}
                  onChange={(e) => setDraftPassword(e.target.value.replace(/\D/g, ""))}
                  placeholder={locked ? "كلمة سر جديدة" : "من 4 لـ 8 أرقام"}
                  className="w-full rounded-2xl bg-secondary px-4 py-3 text-center text-lg tracking-[0.4em] outline-none"
                />
                <Button onClick={() => saveLock(true)} className="h-12 w-full rounded-full">قفل الروم</Button>
                {locked && <Button variant="secondary" onClick={() => saveLock(false)} className="h-12 w-full rounded-full">فتح الروم</Button>}
              </div>
            </>
          )}
          {panel === "announcement" && (
            <>
              <SheetHeader><SheetTitle>إعلان الروم</SheetTitle></SheetHeader>
              <div className="space-y-3 p-4">
                <textarea
                  aria-label="نص الإعلان" value={announcement} maxLength={ANNOUNCEMENT_MAX} rows={4}
                  onChange={(e) => setAnnouncement(e.target.value)} placeholder="اكتب إعلان يظهر لكل اللي يدخل الروم"
                  className="w-full resize-none rounded-2xl bg-secondary p-4 text-sm outline-none"
                />
                <p className="text-end text-xs text-muted-foreground" dir="ltr">{announcement.length}/{ANNOUNCEMENT_MAX}</p>
                <Button onClick={() => setPanel(null)} className="h-12 w-full rounded-full">تم</Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
