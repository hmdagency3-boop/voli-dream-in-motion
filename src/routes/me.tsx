import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import diamondIcon from '@/assets/diamond.webp';
import coinIcon from '@/assets/coin.webp';
import vipClubCard from '@/assets/vip-club-card.webp';
import profileWallpaper from '@/assets/profile-wallpaper.jpg';
import { useAccount } from "@/hooks/use-account";
import { supabase } from "@/lib/supabase";
import {
  LogOut, Copy,
  Settings, ChevronLeft, Crown, Wallet, Gift, User,
  Shield, Headphones, Video, QrCode, TrendingUp, Users, ShoppingBag,
} from "lucide-react";
import { AppScreen } from "@/components/AppScreen";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { levelProgress, type LevelKind, type Threshold } from "@/lib/levels";
import { Sparkles } from "lucide-react";
import { LevelBadge } from "@/components/LevelBadge";
import { badgeTier, charismaBadge, wealthBadge } from "@/lib/badges";
import { SpecialIdBadge } from "@/components/SpecialIdBadge";
import { shownId } from "@/lib/special-id";
import { activeVipLevel } from "@/lib/vip";
import { VipBadge, VipFrame } from "@/components/VipBadge";
import { HeadwearFrame } from "@/components/HeadwearFrame";
import { useWorn } from "@/lib/store";

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

function LevelCard({ kind, points, thresholds }: { kind: LevelKind; points: number; thresholds: Threshold[] }) {
  const p = levelProgress(points, thresholds);
  const charisma = kind === "charisma";
  const Icon = charisma ? Sparkles : Crown;
  return (
    <div className="rounded-[1.5rem] bg-card p-4 ring-1 ring-border">
      <div className="flex items-center gap-2">
        <span className={`grid size-9 place-items-center rounded-xl ${charisma ? "bg-primary/10" : "bg-accent/15"}`}>
          <Icon className={`size-5 ${charisma ? "text-primary" : "text-accent-foreground"}`} />
        </span>
        <span className="text-xs font-semibold text-muted-foreground">{charisma ? "الكاريزما" : "الثروة"}</span>
      </div>
      <p className="mt-2 font-display text-2xl font-extrabold">Lv.{p.level}</p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
        <div className="h-full rounded-full bg-brand" style={{ width: `${p.percent}%` }} />
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        {thresholds.length === 0 ? "—" : p.next === null ? "أعلى مستوى" : `باقي ${p.remaining.toLocaleString("en")} ${charisma ? "ماسة" : "كوينز"}`}
      </p>
    </div>
  );
}

export const Route = createFileRoute("/me")({
  head: () => ({
    meta: [
      { title: "حسابي — voli" },
      { name: "description", content: "ملفك الشخصي على voli: مستواك، محفظتك، متابعينك وإعداداتك." },
      { property: "og:title", content: "حسابي — voli" },
      { property: "og:description", content: "ملفك الشخصي على voli." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MePage,
});

/** خلفية صفحة "أنا": صورة التنانين، وتحتها طبقة تعتيم تخلي الكلام مقروء. */
const meBackground = (
  <>
    <img src={profileWallpaper} alt="" draggable={false} className="size-full object-cover object-center" />
    <div className="absolute inset-0 bg-gradient-to-b from-background/25 via-background/50 to-background/85" />
  </>
);

const stats = [
  { label: "متابَعين", value: "—" },
  { label: "متابِعين", value: "—" },
  { label: "زوار", value: "—" },
];

const menu = [
  { icon: Video, label: "بثوثي", hint: "" },
  { icon: Gift, label: "الهدايا", hint: "" },
  { icon: Crown, label: "VIP", hint: "اشترك" },
  { icon: TrendingUp, label: "المستوى", hint: "" },
  { icon: Shield, label: "الخصوصية والأمان", hint: "" },
  { icon: Headphones, label: "المساعدة والدعم", hint: "" },
];

/** The member's picture, or the person icon when there is none or it fails to load. */
function MeAvatar({ url }: { url: string | null }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [url]);
  if (!url || broken) return <User className="size-10" aria-hidden="true" />;
  return <img src={url} alt="صورتك الشخصية" onError={() => setBroken(true)} className="size-full object-cover" draggable={false} />;
}

function MePage() {
  const { session, profile, ready } = useAccount();
  const navigate = useNavigate();
  const thresholds = useThresholds();
  const myId = session?.user.id;
  const frame = useWorn([myId])[myId ?? ""]?.frame?.art_url;
  return (
    <AppScreen background={meBackground}>
        {/* ── الغلاف ── */}
        <div className="relative h-44">
          <div className="absolute inset-0 bg-gradient-to-b from-background/45 to-transparent" />

          <div className="absolute top-5 left-5 flex gap-2">
            <Button variant="ghost" size="icon" disabled aria-label="رمز QR" className="grid size-10 place-items-center rounded-full bg-overlay text-on-media backdrop-blur transition hover:opacity-80">
              <QrCode className="size-5" />
            </Button>
            <Button variant="ghost" size="icon" disabled aria-label="الإعدادات" className="grid size-10 place-items-center rounded-full bg-overlay text-on-media backdrop-blur transition hover:opacity-80">
              <Settings className="size-5" />
            </Button>
          </div>
        </div>

        {/* ── بطاقة الملف ── */}
        <section
          onClick={() => { if (session) navigate({ to: "/me/details" }); }}
          className={`relative mx-4 -mt-16 rounded-[2rem] border bg-card p-5 shadow-soft ${session ? "cursor-pointer transition active:scale-[0.99]" : ""}`}
        >
          {session && <ChevronLeft className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />}
          <div className="flex items-start gap-4">
            <HeadwearFrame art={frame}>
              <VipFrame level={activeVipLevel(profile)}>
                <span className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-full bg-secondary text-muted-foreground">
                  <MeAvatar url={profile?.avatar_url ?? null} />
                </span>
              </VipFrame>
            </HeadwearFrame>
            <div className="min-w-0 flex-1 pt-1">
              {session ? (
                <>
                  <h1 className="truncate font-display text-xl font-extrabold">
                    {profile?.display_name ?? (session.user.user_metadata?.["display_name"] as string | undefined) ?? 'حسابي'}
                  </h1>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {profile ? (
                      <span className="inline-flex items-center gap-1.5" dir="ltr">
                        <button
                          type="button"
                          aria-label="نسخ الـ ID"
                          onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(shownId(profile)); toast.success('تم نسخ الـ ID'); }}
                          className="grid size-6 place-items-center rounded-md text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                        >
                          <Copy className="size-3.5" />
                        </button>
                        {profile.special_id ? (
                          <SpecialIdBadge id={profile.special_id} vipLevel={activeVipLevel(profile)} className="w-20" />
                        ) : (
                          <>ID: <span className="font-semibold text-foreground">{profile.public_id}</span></>
                        )}
                      </span>
                    ) : 'ID غير متوفر بعد'}
                  </div>
                  {(() => {
                    const wl = levelProgress(Number(profile?.wealth_points ?? 0), thresholds.wealth).level;
                    const cl = levelProgress(Number(profile?.charisma_points ?? 0), thresholds.charisma).level;
                    return (
                      <div dir="rtl" className="mt-2 flex flex-wrap items-center gap-2">
                        <VipBadge level={activeVipLevel(profile)} />
                        <LevelBadge badge={wealthBadge(wl)} level={wl} locked={badgeTier(wl) === null} height={22} />
                        <LevelBadge badge={charismaBadge(cl)} level={cl} locked={badgeTier(cl) === null} height={22} />
                      </div>
                    );
                  })()}
                </>
              ) : (
                <>
                  <h1 className="font-display text-xl font-extrabold">حسابي</h1>
                  <p className="mt-2 text-sm text-muted-foreground">{ready ? 'لم يتم تسجيل الدخول' : '…'}</p>
                  {ready && <Button asChild className="mt-3 rounded-full"><Link to="/login">تسجيل الدخول</Link></Button>}
                </>
              )}
            </div>
          </div>

          {/* ── الإحصائيات (جزء من بطاقة الملف) ── */}
          <div className="mt-4 grid grid-cols-3">
            {stats.map((s) => (
              <div key={s.label} className="text-center">
                <p className="font-display text-lg font-bold">{s.value}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── بانر VIP ── */}
        <Link to="/vip" aria-label="انضم لنادي VIP" className="relative mx-4 mt-3 block w-[calc(100%-2rem)] transition active:scale-[0.98]">
          <img src={vipClubCard} alt="نادي VIP" draggable={false} className="block w-full select-none" />
        </Link>

        {/* ── المحفظة ── */}
        <section className="mx-4 mt-3 grid grid-cols-2 gap-3">
          <div className="flex items-center gap-2 rounded-2xl bg-card px-3 py-2 ring-1 ring-border">
            <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-primary/10">
              <img src={diamondIcon} alt="ماسة" className="size-5 object-contain" />
            </span>
            <span className="text-xs font-semibold text-muted-foreground">الدخل</span>
            <span className="ms-auto font-sans text-sm font-semibold tabular-nums">0</span>
          </div>
          <div className="flex items-center gap-2 rounded-2xl bg-card px-3 py-2 ring-1 ring-border">
            <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-accent/15">
              <img src={coinIcon} alt="كوينز" className="size-5 object-contain" />
            </span>
            <span className="text-xs font-semibold text-muted-foreground">شحن</span>
            <span title={Number(profile?.coins ?? 0).toLocaleString("en")} className="ms-auto min-w-0 truncate font-sans text-sm font-semibold tabular-nums">{new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(Number(profile?.coins ?? 0))}</span>
          </div>
        </section>

        {/* ── المتجر ── */}
        <Link to="/store" className="mx-4 mt-3 flex items-center gap-3 rounded-[1.5rem] border bg-card px-4 py-3.5 transition hover:bg-secondary">
          <span className="grid size-9 place-items-center rounded-xl bg-accent/15">
            <ShoppingBag className="size-[18px] text-accent-foreground" />
          </span>
          <span className="flex-1 text-sm font-semibold">المتجر</span>
          <span className="text-xs text-muted-foreground">إطارات ومركبات</span>
          <ChevronLeft className="size-4 text-muted-foreground" />
        </Link>

        {/* ── وكالتي ── */}
        <Link to="/agency" className="mx-4 mt-3 flex items-center gap-3 rounded-[1.5rem] border bg-card px-4 py-3.5 transition hover:bg-secondary">
          <span className="grid size-9 place-items-center rounded-xl bg-primary/15">
            <Users className="size-[18px] text-primary" />
          </span>
          <span className="flex-1 text-sm font-semibold">وكالتي</span>
          <ChevronLeft className="size-4 text-muted-foreground" />
        </Link>

        {/* ── القائمة ── */}
        <ul className="mx-4 mt-4 overflow-hidden rounded-[1.5rem] border bg-card">
          {menu.map((m, i) => (
            <li key={m.label}>
              {m.label === "المستوى" || m.label === "VIP" ? (
                <Link to={m.label === "VIP" ? "/vip" : "/levels"} className={`flex w-full items-center gap-3 px-4 py-3.5 text-start transition hover:bg-secondary ${i ? "border-t" : ""}`}>
                  <span className="grid size-9 place-items-center rounded-xl bg-secondary">
                    <m.icon className="size-[18px] text-foreground" />
                  </span>
                  <span className="flex-1 text-sm font-semibold">{m.label}</span>
                  {m.label === "VIP" && activeVipLevel(profile) > 0
                    ? <VipBadge level={activeVipLevel(profile)} />
                    : m.hint && <span className="text-xs text-muted-foreground">{m.hint}</span>}
                  <ChevronLeft className="size-4 text-muted-foreground" />
                </Link>
              ) : (
              <Button variant="ghost" disabled className={`h-auto flex w-full items-center gap-3 px-4 py-3.5 text-start transition hover:bg-secondary ${i ? "border-t" : ""}`}>
                <span className="grid size-9 place-items-center rounded-xl bg-secondary">
                  <m.icon className="size-[18px] text-foreground" />
                </span>
                <span className="flex-1 text-sm font-semibold">{m.label}</span>
                {m.hint && <span className="text-xs text-muted-foreground">{m.hint}</span>}
                <ChevronLeft className="size-4 text-muted-foreground" />
              </Button>
              )}
            </li>
          ))}
        </ul>

        {session && (
          <Button
            variant="ghost"
            onClick={async () => { await supabase.auth.signOut(); navigate({ to: '/login' }); }}
            className="h-auto mx-4 mt-4 flex w-[calc(100%-2rem)] items-center justify-start gap-3 rounded-[1.5rem] border bg-card px-4 py-3.5 text-destructive transition hover:bg-destructive/10"
          >
            <span className="grid size-9 place-items-center rounded-xl bg-destructive/10">
              <LogOut className="size-[18px]" />
            </span>
            <span className="flex-1 text-start text-sm font-bold">تسجيل الخروج</span>
          </Button>
        )}

        <p className="mt-5 text-center text-[11px] text-muted-foreground">voli</p>

    </AppScreen>
  );
}
