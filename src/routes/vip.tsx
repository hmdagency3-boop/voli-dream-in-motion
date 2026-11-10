import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, Check, Crown, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import coinIcon from "@/assets/coin.webp";
import { AppScreen } from "@/components/AppScreen";
import { VipBadge, VipFrame } from "@/components/VipBadge";
import { VipEntrance } from "@/components/VipEntrance";
import { vipEntranceArt } from "@/lib/vip-art";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useAccount } from "@/hooks/use-account";
import { supabase } from "@/lib/supabase";
import { activeVipLevel, VIP_FEATURE_FROM, VIP_TIERS, vipTier, type VipTier } from "@/lib/vip";

export const Route = createFileRoute("/vip")({
  head: () => ({
    meta: [
      { title: "نادي VIP — voli" },
      { name: "description", content: "رتب VIP التنانين الثمانية على voli: الإطارات، الدخوليات، الآيدي المميز، الحصانة والمزيد." },
      { property: "og:title", content: "نادي VIP — voli" },
      { property: "og:description", content: "رتب VIP التنانين الثمانية على voli ومميزات كل رتبة." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VipPage,
});

type TierPrice = { level: number; price_coins: number | null; duration_days: number };

function useTierPrices() {
  const [prices, setPrices] = useState<Record<number, TierPrice>>({});
  useEffect(() => {
    supabase.from("vip_tiers").select("level, price_coins, duration_days").then(({ data }) => {
      if (!data) return;
      const out: Record<number, TierPrice> = {};
      for (const r of data as TierPrice[]) out[r.level] = { ...r, price_coins: r.price_coins === null ? null : Number(r.price_coins) };
      setPrices(out);
    });
  }, []);
  return prices;
}

const buyErrors: Record<string, string> = {
  not_for_sale: "الرتبة دي لسه مش متاحة للشراء",
  not_enough_coins: "رصيدك من الكوينز مش كفاية",
  already_permanent: "عندك الرتبة دي أو أعلى منها بشكل دائم",
};

function VipPage() {
  const { session, profile, ready, reload } = useAccount();
  const prices = useTierPrices();
  const current = activeVipLevel(profile);
  const currentTier = vipTier(current);
  const [selected, setSelected] = useState(1);
  const [buying, setBuying] = useState(false);
  useEffect(() => { if (current) setSelected(current); }, [current]);
  useEffect(() => {
    document.getElementById(`vip-tab-${selected}`)?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [selected]);
  const tier = vipTier(selected) ?? VIP_TIERS[0];
  const price = prices[selected];
  if (!tier) return null;

  async function buy() {
    setBuying(true);
    const { error } = await supabase.rpc("buy_vip", { p_level: selected });
    setBuying(false);
    if (error) { toast.error(buyErrors[error.hint ?? ""] ?? "الشراء ماتمش، حاول تاني"); return; }
    toast.success(`مبروك! بقيت ${tier?.nameAr ?? "VIP"}`);
    reload();
  }

  async function setSetting(column: "hide_location" | "vip_invisible", on: boolean) {
    if (!session) return;
    const { error } = await supabase.from("profiles").update({ [column]: on }).eq("auth_id", session.user.id);
    if (error) { toast.error("مش متاح لرتبتك الحالية"); return; }
    reload();
  }

  return (
    <AppScreen navigation={false}>
      <header className="relative overflow-hidden bg-brand px-4 pb-6 pt-4">
        <div className="flex items-center justify-between">
          <Button asChild variant="ghost" size="icon" aria-label="رجوع" className="rounded-full bg-overlay text-on-media backdrop-blur">
            <Link to="/me"><ArrowRight className="size-5" /></Link>
          </Button>
          {session && profile && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-overlay px-3 py-1.5 text-sm font-bold text-on-media backdrop-blur">
              <img src={coinIcon} alt="كوينز" className="size-4 object-contain" />
              {Number(profile.coins ?? 0).toLocaleString("en")}
            </span>
          )}
        </div>
        <div className="mt-4 flex items-center gap-4">
          <VipFrame level={current}>
            <span className="grid size-16 place-items-center rounded-full bg-overlay text-on-media">
              <Crown className="size-7" />
            </span>
          </VipFrame>
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-extrabold text-on-media">نادي VIP</h1>
            <p className="mt-1 text-sm text-on-media/80">
              {!ready ? "…" : !session ? "سجّل الدخول علشان تشوف رتبتك" : currentTier
                ? <>رتبتك: {currentTier.nameAr}{profile?.vip_expires_at ? ` · لحد ${new Date(profile.vip_expires_at).toLocaleDateString("ar-EG")}` : " · دائمة"}</>
                : "معندكش رتبة VIP لسه"}
            </p>
          </div>
        </div>
      </header>

      {/* اختيار الرتبة */}
      <nav aria-label="رتب VIP" className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-4">
        {VIP_TIERS.map((t) => (
          <Button
            variant="ghost"
            key={t.level}
            id={`vip-tab-${t.level}`}
            type="button"
            onClick={() => setSelected(t.level)}
            aria-pressed={t.level === selected}
            className={`h-32 w-32 shrink-0 flex-col gap-1 rounded-2xl border-2 px-2 py-2 transition ${t.level === selected ? `${t.border} bg-card` : "border-transparent bg-secondary/60"}`}
          >
            <VipBadge level={t.level} size="tab" />
            <span className="max-w-full truncate text-[11px] font-semibold text-muted-foreground">{t.nameAr}</span>
          </Button>
        ))}
      </nav>

      <TierCard tier={tier} owned={current >= tier.level} name={profile?.display_name || "اسمك هنا"} />

      {session && (
        <div className="mx-4 mt-4">
          {price?.price_coins ? (
            <Button onClick={buy} disabled={buying} className="h-12 w-full rounded-full text-base font-bold">
              {buying ? <Loader2 className="animate-spin" /> : <img src={coinIcon} alt="" className="size-5 object-contain" />}
              {current === tier.level ? "جدّد" : "اشترك"} بـ {price.price_coins.toLocaleString("en")} كوينز · {price.duration_days} يوم
            </Button>
          ) : (
            <Button disabled className="h-12 w-full rounded-full text-base font-bold">الشراء قريباً</Button>
          )}
        </div>
      )}

      {/* إعدادات VIP */}
      {session && profile && (
        <section className="mx-4 mt-6 rounded-2xl border bg-card">
          <h2 className="px-4 pt-4 text-base font-bold">إعدادات VIP</h2>
          <SettingRow
            label="إخفاء الموقع والبلد"
            from={VIP_FEATURE_FROM.hideLocation}
            current={current}
            checked={!!profile.hide_location}
            onChange={(on) => setSetting("hide_location", on)}
          />
          <SettingRow
            label="وضع التخفي في غرف البث"
            from={VIP_FEATURE_FROM.invisibleMode}
            current={current}
            checked={!!profile.vip_invisible}
            onChange={(on) => setSetting("vip_invisible", on)}
          />
        </section>
      )}

      {ready && !session && (
        <div className="p-6 text-center">
          <Button asChild className="rounded-full"><Link to="/login">تسجيل الدخول</Link></Button>
        </div>
      )}
    </AppScreen>
  );
}

function TierCard({ tier, owned, name }: { tier: VipTier; owned: boolean; name: string }) {
  // Everything from lower tiers is included too.
  const inherited = VIP_TIERS.filter((t) => t.level < tier.level);
  return (
    <section className={`mx-4 rounded-[1.5rem] border-2 ${tier.border} bg-card p-5 shadow-soft`} aria-label={tier.nameAr}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-xs font-bold ${tier.text}`} dir="ltr">VIP {tier.level} · {tier.nameEn}</p>
          <h2 className="mt-1 font-display text-xl font-extrabold">{tier.nameAr}</h2>
        </div>
        {owned && <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold text-vip-on ${tier.bg}`}>مفعّلة</span>}
      </div>
      <div className="my-3 grid place-items-center py-2">
        <VipBadge level={tier.level} size="showcase" />
      </div>
      <ul className="mt-4 space-y-2.5">
        {tier.features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm">
            <Check className={`mt-0.5 size-4 shrink-0 ${tier.text}`} />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      {vipEntranceArt(tier.level) && <div className="mt-4 overflow-hidden rounded-2xl bg-brand px-2 py-4">
        <p className="mb-2 px-1 text-xs font-bold text-on-media/80">معاينة الدخولية</p>
        <VipEntrance key={tier.level} level={tier.level} name={name} />
      </div>}
      {inherited.length > 0 && (
        <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
          + كل مميزات {inherited.length === 1 ? inherited[0]?.nameAr : `الرتب من VIP 1 لحد VIP ${tier.level - 1}`}
        </p>
      )}
    </section>
  );
}

function SettingRow({ label, from, current, checked, onChange }: {
  label: string; from: number; current: number; checked: boolean; onChange: (on: boolean) => void;
}) {
  const allowed = current >= from;
  return (
    <label className="flex items-center justify-between gap-3 border-t px-4 py-3.5 first-of-type:border-t-0">
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{label}</span>
        {!allowed && (
          <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <Lock className="size-3" /> متاح من VIP {from}
          </span>
        )}
      </span>
      <Switch checked={allowed && checked} disabled={!allowed} onCheckedChange={onChange} aria-label={label} />
    </label>
  );
}
