import { useEffect, useMemo, useState } from "react";
import { Check, EyeOff, Mars, Search, Venus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  COVER_SLIDE_MS, GENDER_LABEL, countryFlagUrl, coverPictures, countryFlag, countryName, countryOptions, loadProfileInfo,
  type Gender, type ProfileInfo,
} from "@/lib/profile-info";

/** Loads a member's gender, country, birthday and album; null until loaded or when the database update is missing. */
export function useProfileInfo(userId: string | undefined) {
  const [info, setInfo] = useState<ProfileInfo | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!userId) return;
    let active = true;
    setInfo(null); setLoaded(false);
    loadProfileInfo(userId).then((r) => { if (active) { setInfo(r); setLoaded(true); } });
    return () => { active = false; };
  }, [userId]);
  return [info, setInfo, loaded] as const;
}

/** Small gender sign and country flag shown next to the ID. */
export function ProfileIdTags({ info, isSelf }: { info: ProfileInfo | null; isSelf: boolean }) {
  if (!info) return null;
  return (
    <>
      {info.gender && (
        <span role="img"
          aria-label={info.age != null ? `${GENDER_LABEL[info.gender]}، ${info.age} سنة` : GENDER_LABEL[info.gender]}
          title={GENDER_LABEL[info.gender]}
          className={`inline-flex h-[18px] shrink-0 items-center gap-0.5 rounded-full px-1.5 text-gender-foreground ${info.gender === "male" ? "bg-gender-male" : "bg-gender-female"}`}>
          {info.gender === "male" ? <Mars className="size-3 stroke-[2.75]" aria-hidden /> : <Venus className="size-3 stroke-[2.75]" aria-hidden />}
          {info.age != null && <span className="text-[11px] font-bold italic leading-none tabular-nums" aria-hidden>{info.age}</span>}
        </span>
      )}
      {info.country && (
        <CountryFlag code={info.country} className={`size-4 ${isSelf && info.country_hidden ? "opacity-50" : ""}`} />
      )}
    </>
  );
}

/** Round country flag picture; falls back to the emoji when no picture exists. */
export function CountryFlag({ code, className = "" }: { code: string; className?: string }) {
  const url = countryFlagUrl(code);
  const label = countryName(code);
  if (!url) return <span role="img" aria-label={label} title={label} className="shrink-0 text-base leading-none">{countryFlag(code)}</span>;
  return <img src={url} alt={label} title={label} draggable={false} className={`shrink-0 rounded-full object-cover ring-1 ring-border ${className}`} />;
}

/**
 * The big picture at the top of a profile: the album pictures taking turns (auto, swipe or dots),
 * or the avatar when there is no album, or the brand colour when there is neither.
 */
export function ProfileCover({ album, avatar }: { album: string[]; avatar: string | null | undefined }) {
  const pictures = useMemo(() => coverPictures(album, avatar), [album, avatar]);
  const [index, setIndex] = useState(0);
  const [startX, setStartX] = useState<number | null>(null);
  const count = pictures.length;
  const current = count ? index % count : 0;

  useEffect(() => { setIndex(0); }, [pictures]);
  useEffect(() => {
    if (count < 2) return;
    const t = setTimeout(() => setIndex((i) => (i + 1) % count), COVER_SLIDE_MS);
    return () => clearTimeout(t);
  }, [count, current]);

  if (!count) return <div className="absolute inset-0 bg-brand" />;
  return (
    <div className="absolute inset-0 touch-pan-y"
      onPointerDown={(e) => setStartX(e.clientX)}
      onPointerUp={(e) => {
        if (startX == null || count < 2) return;
        const dx = e.clientX - startX;
        setStartX(null);
        // In right-to-left reading, swiping right shows the next picture.
        if (Math.abs(dx) > 40) setIndex((i) => (i + (dx > 0 ? 1 : count - 1)) % count);
      }}>
      {pictures.map((url, i) => (
        <img key={url} src={url} alt={i === current ? "صورة الغلاف" : ""} aria-hidden={i !== current} draggable={false}
          loading={i === 0 ? "eager" : "lazy"}
          className={`absolute inset-0 size-full select-none object-cover transition-opacity duration-700 ${i === current ? "opacity-100" : "opacity-0"}`} />
      ))}
      {count > 1 && (
        <div className="absolute inset-x-0 top-16 z-10 flex justify-center gap-1.5" dir="ltr">
          {pictures.map((url, i) => (
            <button key={url} type="button" aria-label={`صورة ${i + 1} من الألبوم`} aria-current={i === current}
              onClick={() => setIndex(i)}
              className={`h-1.5 rounded-full bg-on-media transition-all ${i === current ? "w-5" : "w-1.5 opacity-50"}`} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Pick male or female. */
export function GenderSheet({ open, onOpenChange, value, saving, onSave }: {
  open: boolean; onOpenChange: (v: boolean) => void; value: Gender | null; saving: boolean; onSave: (g: Gender) => void;
}) {
  const [gender, setGender] = useState<Gender | null>(value);
  useEffect(() => { if (open) setGender(value); }, [open, value]);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" dir="rtl" className="mx-auto max-w-md rounded-t-[2rem]">
        <SheetHeader className="text-start">
          <SheetTitle>الجنس</SheetTitle>
          <SheetDescription>بيظهر جنب الـ ID في بروفايلك.</SheetDescription>
        </SheetHeader>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {(["male", "female"] as const).map((g) => (
            <button key={g} type="button" aria-pressed={gender === g} onClick={() => setGender(g)}
              className={`flex items-center justify-center gap-2 rounded-2xl border-2 py-3 font-bold transition ${gender === g
                ? g === "male" ? "border-gender-male bg-gender-male/15 text-gender-male" : "border-gender-female bg-gender-female/15 text-gender-female"
                : "border-border text-muted-foreground"}`}>
              {g === "male" ? <Mars className="size-5" /> : <Venus className="size-5" />} {GENDER_LABEL[g]}
            </button>
          ))}
        </div>
        <Button type="button" onClick={() => gender && onSave(gender)} disabled={saving || !gender || gender === value} className="mt-5 w-full rounded-full">
          {saving ? "جارٍ الحفظ…" : "حفظ"}
        </Button>
      </SheetContent>
    </Sheet>
  );
}

/** Searchable country list with round flags. */
export function CountrySheet({ open, onOpenChange, value, hidden, saving, onSave }: {
  open: boolean; onOpenChange: (v: boolean) => void; value: string | null; hidden: boolean; saving: boolean; onSave: (code: string) => void;
}) {
  const [country, setCountry] = useState<string | null>(value);
  const [query, setQuery] = useState("");
  const all = useMemo(() => (open ? countryOptions() : []), [open]);
  const q = query.trim();
  const shown = q ? all.filter((c) => c.name.includes(q) || c.code.toLowerCase() === q.toLowerCase()) : all;
  useEffect(() => { if (open) { setCountry(value); setQuery(""); } }, [open, value]);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" dir="rtl" className="mx-auto flex max-h-[85dvh] max-w-md flex-col rounded-t-[2rem]">
        <SheetHeader className="text-start">
          <SheetTitle>الدولة</SheetTitle>
          <SheetDescription>علمها بيظهر جنب الـ ID في بروفايلك.</SheetDescription>
        </SheetHeader>
        <div className="relative mt-2">
          <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث عن دولتك" className="rounded-full pr-9" />
        </div>
        <ul className="mt-2 min-h-0 flex-1 overflow-y-auto rounded-2xl border" role="listbox" aria-label="الدول">
          {shown.map((c) => (
            <li key={c.code}>
              <button type="button" role="option" aria-selected={country === c.code} onClick={() => setCountry(c.code)}
                className={`flex w-full items-center gap-3 px-4 py-2.5 text-start text-sm transition hover:bg-secondary ${country === c.code ? "bg-secondary font-bold" : ""}`}>
                <CountryFlag code={c.code} className="size-6" />
                <span className="flex-1">{c.name}</span>
                {country === c.code && <Check className="size-4 text-primary" />}
              </button>
            </li>
          ))}
          {shown.length === 0 && <li className="p-4 text-center text-sm text-muted-foreground">مفيش دولة بالاسم ده</li>}
        </ul>
        {hidden && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><EyeOff className="size-3.5" /> دولتك مخفية عن الآخرين لأنك مفعّل إخفاء الموقع.</p>
        )}
        <Button type="button" onClick={() => country && onSave(country)} disabled={saving || !country || country === value} className="mt-4 w-full rounded-full">
          {saving ? "جارٍ الحفظ…" : "حفظ"}
        </Button>
      </SheetContent>
    </Sheet>
  );
}
