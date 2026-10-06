// "Active now / Active 2h ago" for friends. Client-safe: no server imports.

/** Seen within this long counts as "Active Now" (the app checks in every 30 s while open). */
export const ACTIVE_NOW_MS = 5 * 60_000;
/** Older than this, nothing is shown. */
const SHOW_FOR_MS = 7 * 24 * 60 * 60_000;

export function isActiveNow(iso: string | null | undefined, now = Date.now()) {
  return !!iso && now - new Date(iso).getTime() < ACTIVE_NOW_MS;
}

/** "Active Now", "Active 12m ago", "Active 2h ago", "Active 3d ago" — or null if unknown or old. */
export function activeLabel(iso: string | null | undefined, now = Date.now()): string | null {
  if (!iso) return null;
  const ms = now - new Date(iso).getTime();
  if (ms < ACTIVE_NOW_MS) return "Active Now";
  if (ms > SHOW_FOR_MS) return null;
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `Active ${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Active ${hours}h ago`;
  return `Active ${Math.floor(hours / 24)}d ago`;
}
