import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { sendRoomMessage } from "@/lib/rooms";
import { ROOM_GAMES, diceMessage, rollDice } from "@/lib/room-games";

/** The room's games box: ready games play right away and post their result to the room chat. */
export function RoomGames({ open, onOpenChange, roomId, onPlayed }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roomId: string;
  /** Called after a result was posted, so the room can refresh its chat. */
  onPlayed: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  async function play(key: string) {
    if (busy) return;
    if (key !== "dice") return;
    setBusy(key);
    try {
      const res = await sendRoomMessage(roomId, diceMessage(rollDice()));
      if (res !== "ok") throw new Error(res ?? "");
      onOpenChange(false);
      onPlayed();
    } catch {
      toast.error("مقدرتش ارمي النرد");
    } finally { setBusy(null); }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto max-w-md rounded-t-3xl">
        <SheetHeader><SheetTitle>الألعاب</SheetTitle></SheetHeader>
        <div className="grid grid-cols-4 gap-3 p-4">
          {ROOM_GAMES.map((g) => (
            <button key={g.key} type="button" disabled={!g.ready || !!busy} onClick={() => play(g.key)}
              aria-label={g.ready ? `العب ${g.name}` : `${g.name} — قريبًا`}
              className="relative flex flex-col items-center gap-1.5 rounded-2xl bg-secondary p-3 transition active:scale-95 disabled:active:scale-100">
              <span className={`grid size-12 place-items-center text-3xl ${g.ready ? "" : "opacity-40 grayscale"}`}>
                {busy === g.key ? <Loader2 className="size-6 animate-spin" /> : g.emoji}
              </span>
              <span className="text-xs font-bold">{g.name}</span>
              {!g.ready && (
                <span className="absolute inset-x-0 -top-1.5 mx-auto w-fit rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground">قريبًا</span>
              )}
            </button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
