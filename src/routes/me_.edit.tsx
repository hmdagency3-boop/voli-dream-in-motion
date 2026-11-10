import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, ChevronLeft, Loader2, Plus, User, X } from "lucide-react";
import { toast } from "sonner";
import { AppScreen } from "@/components/AppScreen";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ImageCropDialog } from "@/components/ImageCropDialog";
import { CountryFlag, CountrySheet, GenderSheet, useProfileInfo } from "@/components/ProfileInfo";
import { useAccount } from "@/hooks/use-account";
import { updateMyAvatar } from "@/lib/rooms";
import {
  ALBUM_MAX, BIO_MAX, GENDER_LABEL, NAME_MAX, checkName, countryName, loadMyBio, saveMyAlbum, saveMyBio,
  ageFrom, saveMyBirthday, saveMyName, saveMyProfileInfo, uploadAlbumPicture, type ProfileInfo,
} from "@/lib/profile-info";

export const Route = createFileRoute("/me_/edit")({
  head: () => ({
    meta: [
      { title: "تعديل البيانات — voli" },
      { name: "description", content: "عدّل صورتك وألبومك واسمك وجنسك وتاريخ ميلادك ودولتك ونبذتك على voli." },
      { property: "og:title", content: "تعديل البيانات — voli" },
      { property: "og:description", content: "عدّل بيانات بروفايلك على voli." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EditProfilePage,
});

type Field = "name" | "gender" | "birthday" | "country" | "bio" | null;
const EMPTY: ProfileInfo = { gender: null, country: null, country_hidden: false, birthday: null, age: null, album: [] };
const MAX_PICTURE = 5 * 1024 * 1024;
const isPicture = (f: File) => f.type.startsWith("image/");

function EditProfilePage() {
  const { session, profile, reload } = useAccount();
  const userId = session?.user.id;
  const [loadedInfo, setInfo] = useProfileInfo(userId);
  const info = loadedInfo ?? EMPTY;
  const [bio, setBio] = useState<string | null>(null);
  const [field, setField] = useState<Field>(null);
  const [saving, setSaving] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [albumBusy, setAlbumBusy] = useState(false);
  const avatarInput = useRef<HTMLInputElement>(null);
  const albumInput = useRef<HTMLInputElement>(null);
  const [cropping, setCropping] = useState<{ kind: "avatar" | "album"; files: File[] } | null>(null);

  useEffect(() => { if (userId) loadMyBio(userId).then(setBio); }, [userId]);

  async function run(task: () => Promise<void>, done = "تم الحفظ") {
    setSaving(true);
    try { await task(); toast.success(done); setField(null); }
    catch { toast.error("ماقدرناش نحفظ، جرّب تاني"); }
    finally { setSaving(false); }
  }

  // Every picked picture goes through the crop dialog first, one at a time.
  function pickAvatar(f: File) {
    if (!userId) return;
    if (!isPicture(f)) { toast.error("اختار صورة"); return; }
    setCropping({ kind: "avatar", files: [f] });
  }

  function pickAlbum(files: File[]) {
    const room = ALBUM_MAX - info.album.length;
    if (room <= 0) { toast.error(`الألبوم بياخد ${ALBUM_MAX} صور بس`); return; }
    const picked = files.filter(isPicture).slice(0, room);
    if (picked.length < Math.min(files.length, room)) toast.error("في ملفات مش صور ماتضافتش");
    if (picked.length) setCropping({ kind: "album", files: picked });
  }

  const nextCrop = () => setCropping((c) => (c && c.files.length > 1 ? { ...c, files: c.files.slice(1) } : null));

  async function saveCropped(f: File) {
    if (!userId || !cropping) return;
    if (f.size > MAX_PICTURE) { toast.error("الصورة كبيرة، صغّرها شوية"); return; }
    if (cropping.kind === "avatar") {
      setAvatarBusy(true);
      try { await updateMyAvatar(userId, f); reload(); toast.success("تم تحديث الصورة"); nextCrop(); }
      catch (e) { toast.error((e as { hint?: string }).hint === "avatar_locked" ? "تغيير الصورة متوقف لحسابك حالياً" : "الصورة ماترفعتش"); }
      finally { setAvatarBusy(false); }
      return;
    }
    setAlbumBusy(true);
    try {
      const url = await uploadAlbumPicture(f);
      const next = [...info.album, url].slice(0, ALBUM_MAX);
      await saveMyAlbum(next);
      setInfo({ ...info, album: next });
      toast.success("تمت إضافة الصورة");
      nextCrop();
    } catch { toast.error("الصورة ماترفعتش، جرّب تاني"); }
    finally { setAlbumBusy(false); }
  }

  async function removeAlbum(url: string) {
    const next = info.album.filter((u) => u !== url);
    setAlbumBusy(true);
    try { await saveMyAlbum(next); setInfo({ ...info, album: next }); }
    catch { toast.error("ماقدرناش نشيل الصورة"); }
    finally { setAlbumBusy(false); }
  }

  return (
    <AppScreen navigation={false}>
      <div className="min-h-full bg-muted">
        <header className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background px-3 py-3">
          <Button asChild variant="ghost" size="icon" className="rounded-full">
            <Link to="/me/details" aria-label="رجوع"><ArrowRight className="size-5" /></Link>
          </Button>
          <h1 className="flex-1 text-center font-display text-lg font-extrabold">تعديل البيانات</h1>
          <span className="size-10" />
        </header>

        <p className="px-5 pt-5 text-sm font-semibold text-muted-foreground">البيانات الشخصية</p>

        {/* الصورة الشخصية */}
        <section className="mx-4 mt-3 rounded-2xl bg-card shadow-soft">
          <Row label="الصورة الشخصية" onClick={() => avatarInput.current?.click()} disabled={avatarBusy || !userId}>
            <span className="relative grid size-12 place-items-center overflow-hidden rounded-full bg-secondary text-muted-foreground">
              {profile?.avatar_url ? <img src={profile.avatar_url} alt="صورتك الشخصية" className="size-full object-cover" /> : <User className="size-6" />}
              {avatarBusy && <span className="absolute inset-0 grid place-items-center bg-overlay text-on-media"><Loader2 className="size-5 animate-spin" /></span>}
            </span>
          </Row>
          <input ref={avatarInput} hidden type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) pickAvatar(f); }} />
        </section>

        {/* الألبوم */}
        <section className="mx-4 mt-3 rounded-2xl bg-card p-4 shadow-soft">
          <p className="flex flex-wrap items-baseline gap-x-2 font-bold">
            الألبوم <span className="text-xs font-normal text-muted-foreground">* تقدر ترفع وتعرض {ALBUM_MAX} صور بس</span>
          </p>
          <div className="mt-3 grid grid-cols-4 gap-2">
            {info.album.map((url, i) => (
              <div key={url} className="relative aspect-square overflow-hidden rounded-xl bg-secondary">
                <img src={url} alt={`صورة ${i + 1} من الألبوم`} className="size-full object-cover" />
                <button type="button" aria-label={`شيل الصورة ${i + 1}`} disabled={albumBusy} onClick={() => removeAlbum(url)}
                  className="absolute left-1 top-1 grid size-6 place-items-center rounded-full bg-overlay text-on-media backdrop-blur">
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
            {info.album.length < ALBUM_MAX && (
              <button type="button" aria-label="أضف صور للألبوم" disabled={albumBusy || !userId} onClick={() => albumInput.current?.click()}
                className="grid aspect-square place-items-center rounded-xl bg-secondary text-muted-foreground transition hover:text-foreground disabled:opacity-60">
                {albumBusy ? <Loader2 className="size-6 animate-spin" /> : <Plus className="size-7" />}
              </button>
            )}
          </div>
          <input ref={albumInput} hidden type="file" accept="image/*" multiple onChange={(e) => { const fs = [...(e.target.files ?? [])]; e.target.value = ""; if (fs.length) pickAlbum(fs); }} />
        </section>

        <ImageCropDialog file={cropping?.files[0] ?? null} round={cropping?.kind === "avatar"}
          title={cropping?.kind === "avatar" ? "قص الصورة الشخصية" : `قص صورة الألبوم${cropping && cropping.files.length > 1 ? ` (فاضل ${cropping.files.length})` : ""}`}
          onDone={saveCropped} onCancel={nextCrop} />

        {/* باقي البيانات */}
        <section className="mx-4 mt-3 divide-y rounded-2xl bg-card shadow-soft">
          <Row label="الاسم" onClick={() => setField("name")} disabled={!userId}>
            <Value>{profile?.display_name}</Value>
          </Row>
          <Row label="الجنس" onClick={() => setField("gender")} disabled={!userId}>
            <Value>{info.gender ? GENDER_LABEL[info.gender] : null}</Value>
          </Row>
          <Row label="تاريخ الميلاد" onClick={() => setField("birthday")} disabled={!userId}>
            <Value><span dir="ltr">{info.birthday}</span></Value>
          </Row>
          <Row label="الدولة" onClick={() => setField("country")} disabled={!userId}>
            {info.country ? (
              <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
                <CountryFlag code={info.country} className="size-5" /><span className="truncate">{countryName(info.country)}</span>
              </span>
            ) : <Value>{null}</Value>}
          </Row>
          <Row label="النبذة" onClick={() => setField("bio")} disabled={!userId || bio === null}>
            <Value>{bio}</Value>
          </Row>
        </section>
      </div>

      <TextSheet open={field === "name"} onOpenChange={(v) => setField(v ? "name" : null)} title="الاسم" max={NAME_MAX}
        value={profile?.display_name ?? ""} saving={saving}
        onSave={(text) => {
          const check = checkName(text);
          if (!check.ok) { toast.error(check.reason); return; }
          if (!userId) return;
          setSaving(true);
          saveMyName(userId, check.value)
            .then((r) => { if (r === "locked") toast.error("تغيير الاسم متوقف لحسابك حالياً"); else { reload(); toast.success("تم الحفظ"); setField(null); } })
            .catch(() => toast.error("ماقدرناش نحفظ، جرّب تاني"))
            .finally(() => setSaving(false));
        }} />

      <TextSheet open={field === "bio"} onOpenChange={(v) => setField(v ? "bio" : null)} title="النبذة" max={BIO_MAX} multiline
        value={bio ?? ""} saving={saving}
        onSave={(text) => userId && run(async () => { await saveMyBio(userId, text); setBio(text.trim().slice(0, BIO_MAX)); })} />

      <GenderSheet open={field === "gender"} onOpenChange={(v) => setField(v ? "gender" : null)} value={info.gender} saving={saving}
        onSave={(g) => run(async () => { await saveMyProfileInfo(g, info.country); setInfo({ ...info, gender: g }); })} />

      <CountrySheet open={field === "country"} onOpenChange={(v) => setField(v ? "country" : null)} value={info.country} hidden={info.country_hidden} saving={saving}
        onSave={(c) => run(async () => { await saveMyProfileInfo(info.gender, c); setInfo({ ...info, country: c }); })} />

      <BirthdaySheet open={field === "birthday"} onOpenChange={(v) => setField(v ? "birthday" : null)} value={info.birthday} saving={saving}
        onSave={(d) => run(async () => { await saveMyBirthday(d); setInfo({ ...info, birthday: d, age: d ? ageFrom(d) : null }); })} />
    </AppScreen>
  );
}

function Row({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className="flex w-full items-center gap-3 px-4 py-4 text-start transition hover:bg-secondary/50 disabled:opacity-60 first:rounded-t-2xl last:rounded-b-2xl">
      <span className="shrink-0 font-bold">{label}</span>
      <span className="flex min-w-0 flex-1 justify-end">{children}</span>
      <ChevronLeft className="size-5 shrink-0 text-muted-foreground" aria-hidden />
    </button>
  );
}

function Value({ children }: { children: ReactNode }) {
  return children ? <span className="truncate text-muted-foreground">{children}</span> : <span className="text-muted-foreground/70">غير محدد</span>;
}

function TextSheet({ open, onOpenChange, title, value, max, multiline, saving, onSave }: {
  open: boolean; onOpenChange: (v: boolean) => void; title: string; value: string; max: number; multiline?: boolean; saving: boolean; onSave: (v: string) => void;
}) {
  const [text, setText] = useState(value);
  useEffect(() => { if (open) setText(value); }, [open, value]);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" dir="rtl" className="mx-auto max-w-md rounded-t-[2rem]">
        <SheetHeader className="text-start">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{text.length}/{max}</SheetDescription>
        </SheetHeader>
        <form className="mt-3" onSubmit={(e) => { e.preventDefault(); onSave(text); }}>
          {multiline
            ? <Textarea value={text} maxLength={max} rows={4} onChange={(e) => setText(e.target.value)} placeholder="قول شيئاً لجعل الآخرين يعرفون لك" className="rounded-2xl" />
            : <Input value={text} maxLength={max} onChange={(e) => setText(e.target.value)} className="rounded-full" autoFocus />}
          <Button type="submit" disabled={saving || text.trim() === value.trim()} className="mt-4 w-full rounded-full">
            {saving ? "جارٍ الحفظ…" : "حفظ"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function BirthdaySheet({ open, onOpenChange, value, saving, onSave }: {
  open: boolean; onOpenChange: (v: boolean) => void; value: string | null; saving: boolean; onSave: (v: string) => void;
}) {
  const [date, setDate] = useState(value ?? "");
  useEffect(() => { if (open) setDate(value ?? ""); }, [open, value]);
  const today = new Date().toISOString().slice(0, 10);
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= "1900-01-01" && date <= today;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" dir="rtl" className="mx-auto max-w-md rounded-t-[2rem]">
        <SheetHeader className="text-start">
          <SheetTitle>تاريخ الميلاد</SheetTitle>
          <SheetDescription>بيظهر ليك أنت بس.</SheetDescription>
        </SheetHeader>
        <Input type="date" dir="ltr" value={date} min="1900-01-01" max={today} onChange={(e) => setDate(e.target.value)} className="mt-3 rounded-full" />
        <Button type="button" onClick={() => onSave(date)} disabled={saving || !valid || date === value} className="mt-4 w-full rounded-full">
          {saving ? "جارٍ الحفظ…" : "حفظ"}
        </Button>
      </SheetContent>
    </Sheet>
  );
}
