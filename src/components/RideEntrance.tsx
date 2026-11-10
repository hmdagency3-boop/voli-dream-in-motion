import { useEffect, useRef } from "react";
import type { WornItem } from "@/lib/store";

/** Longest a ride may hold the room. A ride without a video shows its picture for a few seconds. */
const MAX_MS = 15000;
const PICTURE_MS = 4500;

/** A member's store ride coming into the room: its video (muted when the browser refuses sound) or its picture. */
export function RideEntrance({ ride, name, onDone }: { ride: WornItem; name: string; onDone: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    const v = ref.current;
    if (v) {
      v.muted = false;
      v.play().catch(() => { v.muted = true; v.play().catch(() => done.current()); });
    }
    const t = setTimeout(() => done.current(), ride.video_url ? MAX_MS : PICTURE_MS);
    return () => clearTimeout(t);
  }, [ride.item_id, ride.video_url]);

  return (
    <div className="pointer-events-none absolute inset-0 z-40 grid place-items-center overflow-hidden" aria-live="polite">
      {ride.video_url ? (
        <video ref={ref} src={ride.video_url} playsInline preload="auto" onEnded={() => done.current()} onError={() => done.current()}
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
