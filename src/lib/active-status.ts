// "Active now / Active 2m ago" for friends. Client-safe: no server imports.
//
// While the app is open and visible it checks in every 30 s (isOnline = true, lastActiveAt =
// now). The moment the planter leaves — closes the tab, switches apps, locks the phone — the app
// says so (isOnline = false), and friends see "Active 1m ago", counting up from lastActiveAt.

/** Online and checked in within this long counts as "Active Now". Covers a missed check-in or
 *  two, and ends "Active Now" if the app closed without saying goodbye (e.g. the phone died). */
export const ACTIVE_NOW_MS = 2 * 60_000;
/** Older than this, nothing is shown. */
const SHOW_FOR_MS = 7 * 24 * 60 * 60_000;

/** What a friend may see about when a planter was last on. */
export type Presence = { activeAt: string | null; online: boolean };

/** `person`'s presence as `viewer` may see it: friends only, and only if the planter shares it. */
export function visiblePresence(
  person: { lastActiveAt: Date | null; isOnline: boolean; showActiveStatus: boolean },
  isFriend: boolean,
): Presence {
  if (!isFriend || !person.showActiveStatus || !person.lastActiveAt) return { activeAt: null, online: false };
  return { activeAt: person.lastActiveAt.toISOString(), online: person.isOnline };
}

export function isActiveNow(p: Presence, now = Date.now()) {
  return p.online && !!p.activeAt && now - new Date(p.activeAt).getTime() < ACTIVE_NOW_MS;
}

/** "Active Now", "Active 1m ago", "Active 2h ago", "Active 3d ago" — or null if unknown or old. */
export function activeLabel(p: Presence, now = Date.now()): string | null {
  if (!p.activeAt) return null;
  if (isActiveNow(p, now)) return "Active Now";
  const ms = now - new Date(p.activeAt).getTime();
  if (ms > SHOW_FOR_MS) return null;
  const mins = Math.max(1, Math.floor(ms / 60_000));
  if (mins < 60) return `Active ${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Active ${hours}h ago`;
  return `Active ${Math.floor(hours / 24)}d ago`;
}
