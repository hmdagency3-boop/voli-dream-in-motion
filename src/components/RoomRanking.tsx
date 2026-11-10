import { useEffect, useState, type CSSProperties } from "react";
import { Loader2, Trophy } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import supportPodium from "@/assets/rank/support-podium.webp";
import invitedPodium from "@/assets/rank/invited-podium.webp";
import supportCrown from "@/assets/rank/support-crown.webp";
import invitedCrown from "@/assets/rank/invited-crown.webp";
import type { RoomPerson } from "@/lib/rooms";
import { getRoomRanking, type RankBoard as Board, type RankEntry, type RankPeriod as Period } from "@/lib/ranking";

/** Crown cut-outs and their box on the 1040x860 podium picture, in percent. */
const crownBox = (x: number, y: number, w: number, h: number) => ({ left: `${x / 10.4}%`, top: `${y / 8.6}%`, width: `${w / 10.4}%`, height: `${h / 8.6}%` });


/** Avatar circle positions on the cropped podium picture: percent of its box, plus its width.
 *  Measured from each artwork's own ring: center of the ring and its inner opening. */
type Spot = { x: number; y: number; w: number };
const SPOTS: Spot[] = [
  { x: 50.0, y: 39.42, w: 15.71 }, // 1st
  { x: 18.65, y: 41.1, w: 16.4 }, // 2nd
  { x: 81.39, y: 43.49, w: 16.4 }, // 3rd
];
// The crystal podium's rings sit in different places than the gold ones.
const INVITED_SPOTS: Spot[] = [
  { x: 49.95, y: 36.4, w: 16.3 }, // 1st
  { x: 18.65, y: 39.53, w: 16.3 }, // 2nd
  { x: 81.39, y: 43.43, w: 16.4 }, // 3rd
];

const BOARDS = {
  support: { label: "الدعم", art: supportPodium, accent: "text-rank-gold", ring: "ring-rank-gold", border: "border-rank-gold/60", unit: "دعم", glow: "var(--rank-gold)", crown: { src: supportCrown, box: crownBox(360, 38, 320, 245) }, halo: crownBox(250, -30, 540, 360), spots: SPOTS },
  received: { label: "المدعومين", art: invitedPodium, accent: "text-rank-crystal", ring: "ring-rank-crystal", border: "border-rank-crystal/60", unit: "مدعوم", glow: "var(--rank-crystal)", crown: { src: invitedCrown, box: crownBox(370, 45, 300, 210) }, halo: crownBox(255, 30, 530, 330), spots: INVITED_SPOTS },
} as const;

const PERIODS: [Period, string][] = [["day", "يومي"], ["week", "أسبوعي"], ["month", "شهري"]];

/** Twinkle points over the podium artwork: percent of its box, size in px, start delay in s. */
const SPARKS = [
  { x: 12, y: 15, size: 16, delay: 0 },
  { x: 87, y: 24, size: 12, delay: 0.9 },
  { x: 31, y: 7, size: 9, delay: 1.7 },
  { x: 69, y: 9, size: 13, delay: 2.3 },
  { x: 50, y: 27, size: 8, delay: 1.2 },
  { x: 17, y: 58, size: 10, delay: 2.8 },
  { x: 83, y: 55, size: 9, delay: 0.4 },
];

/** Room leaderboard: who supported the room most and who received the most, each over its own podium artwork.
 *  Loaded from the database every time it opens or the board / period changes. */
export function RoomRanking({ open, onOpenChange, roomId }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  roomId?: string | undefined;
}) {
  const [board, setBoard] = useState<Board>("support");
  const [period, setPeriod] = useState<Period>("day");
  const [state, setState] = useState<{ key: string; rows: RankEntry[] | null } | { key: string; failed: true } | null>(null);
  const key = `${roomId}:${board}:${period}`;
  useEffect(() => {
    if (!open || !roomId) return;
    let live = true;
    getRoomRanking(roomId, board, period)
      .then((rows) => live && setState({ key, rows }))
      .catch(() => live && setState({ key, failed: true }));
    return () => { live = false; };
  }, [open, roomId, board, period, key]);
  const b = BOARDS[board];
  const current = state?.key === key ? state : null;
  const loading = !current;
  const notReady = !!current && "rows" in current && current.rows === null;
  const failed = !!current && "failed" in current;
  const rows = current && "rows" in current && current.rows ? current.rows : [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto flex h-[88dvh] max-w-md flex-col gap-0 overflow-hidden rounded-t-3xl border-0 bg-rank-surface p-0 text-on-media">
        <SheetTitle className="sr-only">ترتيب {b.label}</SheetTitle>
        <div className="flex shrink-0 justify-center gap-6 pt-3">
          {(Object.keys(BOARDS) as Board[]).map((k) => (
            <button key={k} type="button" onClick={() => setBoard(k)} aria-pressed={board === k}
              className={`relative pb-1.5 text-base font-bold transition ${board === k ? BOARDS[k].accent : "opacity-50"}`}>
              {BOARDS[k].label}
              {board === k && <span className="absolute inset-x-1/4 bottom-0 h-0.5 rounded-full bg-current" />}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="relative w-full overflow-hidden" style={{ aspectRatio: "1040 / 860", "--rank-glow": b.glow } as CSSProperties}>
            <img src={b.art} alt="" className="rank-art absolute inset-0 size-full" />
            <div className="rank-sweep pointer-events-none absolute inset-0" aria-hidden />
            <div className="rank-halo pointer-events-none absolute" aria-hidden style={b.halo} />
            <img src={b.crown.src} alt="" aria-hidden className="rank-crown pointer-events-none absolute" style={b.crown.box} />
            {SPARKS.map((s, i) => (
              <span key={i} aria-hidden className="rank-sparkle pointer-events-none absolute"
                style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.size, height: s.size, animationDelay: `${s.delay}s` }} />
            ))}
            {b.spots.map((s, i) => {
              const e = rows[i];
              return (
                <div key={i}>
                  <div className={`absolute grid ${i === 0 ? "rank-glow" : ""}`} aria-hidden={!e}
                    style={{ left: `${s.x}%`, top: `${s.y}%`, width: `${s.w}%`, aspectRatio: "1", borderRadius: "9999px", translate: "-50% -50%" }} />
                  <div className="absolute grid -translate-x-1/2 -translate-y-1/2 place-items-center overflow-hidden rounded-full"
                    style={{ left: `${s.x}%`, top: `${s.y}%`, width: `${s.w}%`, aspectRatio: "1" }}>
                    {e && <Face person={e.person} />}
                  </div>
                  <p className="absolute -translate-x-1/2 -translate-y-1/2 truncate text-center text-[11px] font-bold text-rank-surface"
                    style={{ left: `${s.x}%`, top: "81%", width: "22%" }}>
                    {e?.person.display_name ?? "—"}
                  </p>
                  <p className="absolute -translate-x-1/2 -translate-y-1/2 text-center text-[10px] font-bold tabular-nums"
                    style={{ left: `${s.x - 1}%`, top: "89.4%", width: "10%" }}>
                    {e ? short(e.score) : 0}
                  </p>
                </div>
              );
            })}
          </div>

          <div className={`mx-4 mt-2 grid grid-cols-3 gap-1.5 rounded-full border p-1 ${b.border}`}>
            {PERIODS.map(([k, label]) => (
              <button key={k} type="button" onClick={() => setPeriod(k)} aria-pressed={period === k}
                className={`rounded-full py-1.5 text-sm font-bold transition ${period === k ? `bg-overlay ${b.accent} ring-1 ${b.ring}` : "opacity-60"}`}>
                {label}
              </button>
            ))}
          </div>

          <ol className="grid gap-2 p-4">
            {rows.slice(3).map((e, i) => (
              <li key={e.person.auth_id} className={`flex items-center gap-3 rounded-2xl border bg-rank-row px-3 py-2.5 ${b.border}`}>
                <span className={`w-7 shrink-0 text-center text-xl font-black tabular-nums ${b.accent}`}>{i + 4}</span>
                <span className={`size-11 shrink-0 overflow-hidden rounded-full ring-2 ${b.ring}`}><Face person={e.person} /></span>
                <span className="min-w-0 flex-1 truncate font-semibold">{e.person.display_name}</span>
                <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-bold tabular-nums ${b.border} ${b.accent}`}>{short(e.score)}</span>
              </li>
            ))}
            {loading && (
              <li className="flex justify-center py-8"><Loader2 className={`size-7 animate-spin ${b.accent}`} aria-label="بيحمّل الترتيب" /></li>
            )}
            {!loading && rows.length === 0 && (
              <li className="flex flex-col items-center gap-2 py-8 text-center text-sm opacity-70">
                <Trophy className={`size-8 ${b.accent}`} />
                {notReady ? "الترتيب مش جاهز لسه. اتأكد إن تحديث الترتيب اتشغّل في قاعدة البيانات"
                  : failed ? "الترتيب ماتحمّلش، اقفل وافتح تاني"
                  : board === "support" ? "لسه محدش دعم الروم في الفترة دي، أول هدية تطلعك المركز الأول"
                  : "لسه محدش استلم هدايا في الروم في الفترة دي"}
              </li>
            )}
          </ol>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Face({ person }: { person: RoomPerson }) {
  return person.avatar_url ? (
    <img src={person.avatar_url} alt="" className="size-full object-cover" />
  ) : (
    <span className="grid size-full place-items-center bg-secondary text-lg font-bold text-secondary-foreground">
      {person.display_name.trim().charAt(0) || "؟"}
    </span>
  );
}

const short = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(n));
