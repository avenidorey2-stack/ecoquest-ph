// When chat messages were sent, worded like Messenger (Philippine time).

const TZ = "Asia/Manila";
export const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
/** A time line goes above a message that comes this long after the one before it (and at each new day). */
export const BREAK_MS = 60 * 60_000;

/** Whole calendar days (Philippine time) from `a` back to `b`. */
const daysBetween = (a: Date | number, b: Date | number) => (Date.parse(dayKey.format(a)) - Date.parse(dayKey.format(b))) / 86_400_000;

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("en-PH", { timeZone: TZ, hour: "numeric", minute: "2-digit" });

/**
 * When a message was sent, like Messenger. `short` (the time lines between messages): "12:47 AM"
 * today, "Tue 10:46 PM" this week, "Oct 1, 10:46 PM" this year, "Oct 1, 2025, 10:46 PM" before.
 * Long (hovering a message): "Tuesday 9:50 PM", "October 1, 2026, 9:50 PM".
 */
export function sentLabel(iso: string, style: "short" | "long", now = Date.now()) {
  const d = new Date(iso);
  const time = timeOf(iso);
  if (dayKey.format(d) === dayKey.format(now)) return time;
  // Up to 6 days back, so a weekday name never means both today and last week.
  if (daysBetween(now, d) < 7) return `${d.toLocaleDateString("en-US", { timeZone: TZ, weekday: style === "short" ? "short" : "long" })} ${time}`;
  const sameYear = dayKey.format(d).slice(0, 4) === dayKey.format(now).slice(0, 4);
  const date = d.toLocaleDateString("en-US", {
    timeZone: TZ,
    month: style === "short" ? "short" : "long",
    day: "numeric",
    year: sameYear && style === "short" ? undefined : "numeric",
  });
  return `${date}, ${time}`;
}
