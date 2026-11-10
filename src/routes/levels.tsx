import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { AppScreen } from "@/components/AppScreen";
import { LevelBadge } from "@/components/LevelBadge";
import { badgeTier, charismaBadge, charismaBadges, tierRange, wealthBadge, wealthBadges } from "@/lib/badges";
import { useEffect, useState } from "react";
import { useAccount } from "@/hooks/use-account";
import { supabase } from "@/lib/supabase";
import { levelProgress, type LevelKind, type Threshold } from "@/lib/levels";

export const Route = createFileRoute("/levels")({
  head: () => ({
    meta: [
      { title: "المستويات — voli" },
      { name: "description", content: "كل مستويات الثروة على voli وبادج كل مجموعة مستويات." },
      { property: "og:title", content: "المستويات — voli" },
      { property: "og:description", content: "بادجات المستويات على voli." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LevelsPage,
});

const charismaNames = ["الوردي الناعم", "الروز جولد", "البنفسجي الكريستالي", "الياقوتي الأحمر", "الذهبي الملكي", "الأرجواني الماسي", "الكريستال السماوي", "الوردي الأسود الملكي", "الأحمر الناري بالفينكس", "الذهبي الأسطوري بالتاج", "الإلهة الكونية Supreme"];

function CurrentLevel({ kind }: { kind: LevelKind }) {
  const { profile } = useAccount();
  const [thresholds, setThresholds] = useState<Threshold[]>([]);
  useEffect(() => {
    supabase.from("level_thresholds").select("level, required").eq("kind", kind).then(({ data }) => {
      if (data) setThresholds((data as { level: number; required: number }[]).map(r => ({ level: r.level, required: Number(r.required) })));
    });
  }, [kind]);
  const wealth = kind === "wealth";
  const points = Number((wealth ? profile?.wealth_points : profile?.charisma_points) ?? 0);
  const p = levelProgress(points, thresholds);
  return (
    <section className="mx-4 mt-3 rounded-[1.5rem] border bg-card p-4 shadow-soft">
      <div className="flex items-center gap-3">
        {wealth
          ? <LevelBadge badge={wealthBadge(p.level)} level={p.level} locked={badgeTier(p.level) === null} className="w-24 shrink-0" />
          : <LevelBadge badge={charismaBadge(p.level)} level={p.level} locked={badgeTier(p.level) === null} className="w-24 shrink-0" />}
        <div className="flex-1">
          <p className="text-xs font-semibold text-muted-foreground">{wealth ? "مستوى الثروة الحالي" : "مستوى الكاريزما الحالي"}</p>
          <p className="font-display text-xl font-extrabold">ليفل {p.level}</p>
        </div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
        <div className="h-full rounded-full bg-brand" style={{ width: `${p.percent}%` }} />
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground">
        <span dir="ltr">{points.toLocaleString("en")}{p.next !== null ? ` / ${p.next.toLocaleString("en")}` : ""}</span>
        <span>
          {thresholds.length === 0 ? "—" : p.next === null ? "أعلى مستوى" : `باقي ${p.remaining.toLocaleString("en")} ${wealth ? "كوينز" : "ماسة"} لليفل ${p.level + 1}`}
        </span>
      </div>
    </section>
  );
}

function LevelsPage() {
  return (
    <AppScreen>
      <header className="flex items-center gap-2 px-4 pt-5">
        <Link to="/me" aria-label="رجوع" className="grid size-10 place-items-center rounded-full bg-secondary">
          <ChevronRight className="size-5" />
        </Link>
        <h1 className="font-display text-xl font-extrabold">المستويات</h1>
      </header>

      <h2 className="mx-4 mt-5 font-display text-lg font-extrabold">الثروة</h2>
      <CurrentLevel kind="wealth" />
      <ul className="mx-4 mt-3 overflow-hidden rounded-[1.5rem] border bg-card">
        {wealthBadges.map((b, i) => (
          <li key={b.tier} className={`flex items-center gap-4 px-4 py-3 ${i ? "border-t" : ""}`}>
            <LevelBadge badge={b} level={b.tier === 1 ? 1 : (b.tier - 1) * 10} className="w-24 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-bold">من ليفل <span dir="ltr">{tierRange(b.tier)}</span></p>
              <p className="mt-0.5 text-xs text-muted-foreground">البادج {b.tier}</p>
            </div>
          </li>
        ))}
      </ul>

      <h2 className="mx-4 mt-6 font-display text-lg font-extrabold">الكاريزما</h2>
      <CurrentLevel kind="charisma" />
      <ul className="mx-4 mt-3 overflow-hidden rounded-[1.5rem] border bg-card">
        {charismaBadges.map((b, i) => ({ b, name: charismaNames[i] ?? "" })).map(({ b, name }, i) => (
          <li key={name} className={`flex items-center gap-4 px-4 py-3 ${i ? "border-t" : ""}`}>
            <LevelBadge badge={b} level={i === 0 ? 1 : i * 10} className="w-24 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-bold">من ليفل <span dir="ltr">{tierRange(i + 1)}</span></p>
              <p className="mt-0.5 text-xs text-muted-foreground">البادج {i + 1} · {name}</p>
            </div>
          </li>
        ))}
      </ul>
      <div className="h-4" />
    </AppScreen>
  );
}
