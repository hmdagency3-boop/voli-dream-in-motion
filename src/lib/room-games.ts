/** Games offered from the room's games button. Only "ready" games can be played; the rest show as coming soon. */
export type RoomGame = { key: string; name: string; emoji: string; ready: boolean };

export const ROOM_GAMES: RoomGame[] = [
  { key: "dice", name: "النرد", emoji: "🎲", ready: true },
  { key: "ludo", name: "لودو", emoji: "🎯", ready: false },
  { key: "wheel", name: "عجلة الحظ", emoji: "🎡", ready: false },
  { key: "fruits", name: "الفواكه", emoji: "🍒", ready: false },
];

/** A dice throw: a whole number from 1 to 6. `random` is injectable for tests. */
export function rollDice(random: () => number = Math.random): number {
  return Math.min(6, Math.floor(random() * 6) + 1);
}

/** The line the throw writes into the room chat, so everyone inside sees it. */
export const diceMessage = (face: number) => `🎲 رمى النرد وطلع ${face}`;
