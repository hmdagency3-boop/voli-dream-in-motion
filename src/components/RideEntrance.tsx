import { useEffect, useRef } from "react";
import type { WornItem } from "@/lib/store";

/** Safety net while a ride video loads; once its length is known the ride gets its full length plus a margin. */
const LOADING_MS = 20000;
const LONGEST_MS = 60000;
const PICTURE_MS = 4500;

/** A member's store ride coming into the room: its video (muted when the browser refuses sound) or its picture. */
export function RideEntrance({ ride, name, onDone }: { ride: WornItem; name: string; onDone: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const done = useRef(onDone);
  done.current = onDone;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const finished = useRef(false);

  // Ends exactly once, however many signals (ended, error, timer) arrive.
  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    clearTimeout(timer.current);
    done.current();
  };
  const finishIn = (ms: number) => { clearTimeout(timer.current); timer.current = setTimeout(finish, ms); };

  useEffect(() => {
    finished.current = false;
    const v = ref.current;
    if (v) {
      v.muted = false;
      v.play().catch(() => { v.muted = true; v.play().catch(finish); });
    }
    finishIn(ride.video_url ? LOADING_MS : PICTURE_MS);
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ride.item_id, ride.video_url]);

  return (
    <div className="pointer-events-none absolute inset-0 z-40 grid place-items-center overflow-hidden" aria-live="polite">
      {ride.video_url ? (
        <video ref={ref} src={ride.video_url} playsInline preload="auto"
          onLoadedMetadata={(e) => { const d = e.currentTarget.duration; if (Number.isFinite(d) && d > 0) finishIn(Math.min(d * 1000 + 3000, LONGEST_MS)); }}
          onWaiting={() => { const v = ref.current; if (v && Number.isFinite(v.duration)) finishIn(Math.min((v.duration - v.currentTime) * 1000 + 8000, LONGEST_MS)); }}
          onEnded={finish} onError={finish}
          className="h-full w-full object-contain" />
      ) : (
        <img src={ride.art_url} alt="" className="w-3/4 max-w-xs object-contain drop-shadow-2xl animate-in slide-in-from-right-full fade-in duration-700" />
      )}
      <p className="absolute inset-x-4 top-24 mx-auto w-fit max-w-full truncate rounded-full bg-overlay px-4 py-1.5 text-sm font-bold text-on-media animate-in fade-in slide-in-from-top-2 duration-500">
        {name} دخل بـ {ride.name}
      </p>
    </div>
  );
}
