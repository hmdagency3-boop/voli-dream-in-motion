/**
 * A member counts as newly arrived only after being absent from the room list for this long.
 * Presence is a heartbeat, so a slow phone or a background tab can drop out of the list for a
 * few polls; without this gap the same entrance would replay on top of itself.
 */
export const REANNOUNCE_GAP_MS = 5 * 60 * 1000;

/**
 * Updates `lastPresent` (member id -> last time seen in the room) with the current list and
 * returns who should get a "came in" entrance now. The first call (`first`) only remembers
 * who is already here. The viewer never announces themselves here.
 */
export function freshArrivals(
  lastPresent: Map<string, number>,
  members: string[],
  me: string | undefined,
  now: number,
  first: boolean,
): string[] {
  const fresh: string[] = [];
  for (const id of new Set(members)) {
    const last = lastPresent.get(id);
    if (!first && id !== me && (last === undefined || now - last > REANNOUNCE_GAP_MS)) fresh.push(id);
    lastPresent.set(id, now);
  }
  return fresh;
}
