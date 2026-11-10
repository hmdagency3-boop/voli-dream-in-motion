import { Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { Armchair, Copy, Feather, PenSquare, User } from "lucide-react";
import cpCard from "@/assets/cp-relationship-card.webp";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { LevelBadge } from "@/components/LevelBadge";
import { SpecialIdBadge } from "@/components/SpecialIdBadge";
import type { Profile } from "@/hooks/use-account";
import { supabase } from "@/lib/supabase";
import { levelProgress, type LevelKind, type Threshold } from "@/lib/levels";
import { badgeTier, charismaBadge, wealthBadge } from "@/lib/badges";
import { shownId } from "@/lib/special-id";
import { activeVipLevel } from "@/lib/vip";
import { VipBadge, VipFrame } from "@/components/VipBadge";
import { ProfileCover, ProfileIdTags, useProfileInfo } from "@/components/ProfileInfo";

const tabs = ["هدية", "اطار", "مركبة", "شارة"] as const;

function useCounts(userId: string | undefined) {
  const [counts, setCounts] = useState<{ following: number; followers: number } | null>(null);
  useEffect(() => {
    if (!userId) return;
    Promise.all([
      supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", userId),
      supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", userId),
    ]).then(([a, b]) => setCounts({ following: a.count ?? 0, followers: b.count ?? 0 }));
  }, [userId]);
  return counts;
}

function useThresholds() {
  const [data, setData] = useState<Record<LevelKind, Threshold[]>>({ charisma: [], wealth: [] });
  useEffect(() => {
    supabase.from("level_thresholds").select("kind, level, required").then(({ data: rows }) => {
      if (!rows) return;
      const out: Record<LevelKind, Threshold[]> = { charisma: [], wealth: [] };
      for (const r of rows as { kind: LevelKind; level: number; required: number }[]) out[r.kind]?.push({ level: r.level, required: Number(r.required) });
      setData(out);
    });
  }, []);
  return data;
}

function useBio(userId: string | undefined) {
  const [bio, setBio] = useState<string | null>(null);
  useEffect(() => {
    if (!userId) return;
    supabase.from("profiles").select("bio").eq("auth_id", userId).maybeSingle()
      .then(({ data }) => setBio((data as { bio: string | null } | null)?.bio ?? null));
  }, [userId]);
  return bio;
}

export type DetailsProfile = Profile & { auth_id?: string };

export function ProfileDetails({ profile, userId, ready, signedIn, isSelf, back }: {
  profile: DetailsProfile | null; userId: string | undefined; ready: boolean; signedIn: boolean; isSelf: boolean; back: ReactNode;
}) {
  const session = signedIn ? { user: { user_metadata: {} as Record<string, unknown> } } : null;
  const counts = useCounts(userId);
  const thresholds = useThresholds();
  const bio = useBio(userId);
  const [tab, setTab] = useState<(typeof tabs)[number]>("هدية");
  const name = profile?.display_name ?? (session?.user.user_metadata?.["display_name"] as string | undefined) ?? (isSelf ? "حسابي" : "مستخدم");
  const wl = levelProgress(Number(profile?.wealth_points ?? 0), thresholds.wealth).level;
  const cl = levelProgress(Number(profile?.charisma_points ?? 0), thresholds.charisma).level;
  const [avatarBroken, setAvatarBroken] = useState(false);
  useEffect(() => setAvatarBroken(false), [profile?.avatar_url]);
  const avatar = profile?.avatar_url && !avatarBroken ? profile.avatar_url : null;
  const initial = (name.trim().charAt(0) || "؟").toUpperCase();
  const vipLevel = activeVipLevel(profile);
  const [info] = useProfileInfo(userId);

  return (
    <>
      {/* الغلاف */}
      <div className="relative h-80 overflow-hidden">
        <ProfileCover album={info?.album ?? []} avatar={profile?.avatar_url} />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background" />
        <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4">
          {back}
          {isSelf && userId ? (
            <Button asChild variant="ghost" size="icon" className="rounded-full bg-overlay text-on-media backdrop-blur">
              <Link to="/me/edit" aria-label="تعديل البيانات"><PenSquare className="size-5" /></Link>
            </Button>
          ) : <span />}
        </div>

        <div className="absolute inset-x-0 bottom-3 flex items-end gap-3 px-5">
          <VipFrame level={vipLevel}>
            <span className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-full border-4 border-background bg-secondary text-muted-foreground">
              {profile?.avatar_url ? <img src={profile.avatar_url} alt="" className="size-full object-cover" /> : <User className="size-10" />}
            </span>
          </VipFrame>
          <div className="min-w-0 flex-1 pb-1">
            <h1 className="truncate font-display text-2xl font-extrabold">{session && (profile || isSelf) ? name : ready ? (isSelf ? "لم يتم تسجيل الدخول" : "المستخدم غير موجود") : "…"}</h1>
            {profile && (
              <div className="mt-0.5 flex items-center justify-end gap-1.5 text-sm text-muted-foreground" dir="ltr">
                <button type="button" aria-label="نسخ الـ ID" onClick={() => { navigator.clipboard.writeText(shownId(profile)); toast.success("تم نسخ الـ ID"); }} className="grid size-6 place-items-center rounded-md hover:text-foreground">
                  <Copy className="size-3.5" />
                </button>
                {profile.special_id ? (
                  <SpecialIdBadge id={profile.special_id} vipLevel={vipLevel} className="w-20" />
                ) : (
                  <span>ID:{profile.public_id}</span>
                )}
                <ProfileIdTags info={info} isSelf={isSelf} />
              </div>
            )}
            {profile && (
              <div dir="rtl" className="mt-2.5 flex flex-wrap items-center gap-2">
                <VipBadge level={vipLevel} />
                <LevelBadge badge={wealthBadge(wl)} level={wl} locked={badgeTier(wl) === null} height={22} />
                <LevelBadge badge={charismaBadge(cl)} level={cl} locked={badgeTier(cl) === null} height={22} />
              </div>
            )}
          </div>
        </div>
      </div>

      {ready && (!session || (!isSelf && !profile)) ? (
        <div className="p-8 text-center">
          {!session && <Button asChild className="rounded-full"><Link to="/login">تسجيل الدخول</Link></Button>}
        </div>
      ) : (
        <>
          <p className="mt-3 flex items-center gap-2 px-5 text-sm text-muted-foreground">
            <Feather className="size-4 shrink-0" /> {bio || (isSelf ? "قول شيئاً لجعل الآخرين يعرفون لك ." : "لا توجد نبذة")}
          </p>

          {/* الإحصائيات */}
          <section className="mx-4 mt-5 grid grid-cols-3 rounded-2xl border border-primary/40 bg-card py-4 shadow-soft">
            {[
              { label: "الزائرين", value: 0 },
              { label: isSelf ? "متابعيني" : "المتابعين", value: counts?.followers },
              { label: "تمت متابعة", value: counts?.following },
            ].map((s, i) => (
              <div key={s.label} className={`text-center ${i ? "border-r" : ""}`}>
                <p className="font-display text-2xl font-extrabold">{s.value ?? "—"}</p>
                <p className="mt-1 text-sm text-primary">{s.label}</p>
              </div>
            ))}
          </section>

          {/* وكالة */}
          <h2 className="mt-6 px-5 text-lg font-bold">وكالة</h2>
          <div className="mx-4 mt-3 rounded-2xl border bg-card px-4 py-5 text-center text-sm text-muted-foreground">
            {isSelf ? "لم تنضم لأي وكالة بعد" : "لم ينضم لأي وكالة بعد"}
          </div>

          {/* علاقة */}
          <h2 className="mt-6 px-5 text-lg font-bold">علاقة</h2>
          <figure className="mx-4 mt-3" aria-label="بطاقة العلاقة CP">
            <div className="relative aspect-[2415/1194] w-full">
              <img src={cpCard} alt="بطاقة علاقة بإطار ذهبي وقلب ياقوت وردي، وكرسي الشريك داخل الإطار الأيسر" width={2415} height={1194} draggable={false} className="block size-full select-none object-contain" />
              {/*
                أفاتار المستخدم داخل الإطار الدائري الأيمن.
                المركز (80.6%, 54.3%) والقطر 15.6% مقاسين من نفس البطاقة
                (فتحة الدائرة: x من 1762 إلى 2131، y من 457 إلى 840 في 2415×1194).
              */}
              <div
                className="absolute left-[80.6%] top-[54.3%] aspect-square w-[15.6%] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full"
                role="img"
                aria-label={`صورة ${name}`}
              >
                {avatar ? (
                  <img
                    src={avatar}
                    alt=""
                    onError={() => setAvatarBroken(true)}
                    className="block size-full object-cover"
                    draggable={false}
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    style={{ fontSize: "calc((min(100vw, 28rem) - 2rem) * 0.07)" }}
                    className="grid size-full place-items-center bg-brand font-display font-extrabold text-on-media"
                  >
                    {initial}
                  </span>
                )}
              </div>
            </div>
            <figcaption className="mt-2 text-center text-sm font-semibold text-muted-foreground">{isSelf ? "ليس لديك CP بعد" : "ليس لديه CP بعد"}</figcaption>
          </figure>

          {/* دعم */}
          <h2 className="mt-6 px-5 text-lg font-bold">دعم</h2>
          <div className="mt-4 flex justify-center gap-6 px-5">
            {[1, 2, 3].map((n) => (
              <div key={n} className="flex flex-col items-center gap-2">
                <span className={`grid size-20 place-items-center rounded-full border-4 bg-secondary ${n === 1 ? "border-accent" : n === 2 ? "border-muted-foreground" : "border-primary/50"}`}>
                  <Armchair className="size-7 text-muted-foreground" />
                </span>
                <span className="text-sm text-muted-foreground">No.{n}</span>
              </div>
            ))}
          </div>

          {/* التبويبات */}
          <nav className="mt-8 flex justify-around border-b px-5" aria-label="مقتنيات">
            {tabs.map((t) => (
              <button key={t} type="button" onClick={() => setTab(t)} aria-pressed={t === tab}
                className={`relative pb-3 text-lg font-bold transition ${t === tab ? "text-foreground" : "text-muted-foreground"}`}>
                {t}
                {t === tab && <span className="absolute inset-x-2 -bottom-px h-1 rounded-full bg-primary" />}
              </button>
            ))}
          </nav>
          <p className="py-12 text-center text-sm text-muted-foreground">
            {tab === "هدية" ? "لا توجد هدايا بعد" : tab === "اطار" ? "لا توجد إطارات بعد" : tab === "مركبة" ? "لا توجد مركبات بعد" : "لا توجد شارات بعد"}
          </p>
        </>
      )}
    </>
  );
}
