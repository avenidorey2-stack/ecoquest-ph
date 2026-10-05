/** Compact relative time, e.g. "Just Now", "5m ago", "3h ago", "2d ago", else a date. */
export function timeAgo(date: Date, now: Date) {
  const s = Math.max(0, Math.round((now.getTime() - date.getTime()) / 1000));
  if (s < 60) return "Just Now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 7 * 86_400) return `${Math.floor(s / 86_400)}d ago`;
  return date.toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric" });
}

/** "₱1,234.50" */
export function formatPesos(amount: number) {
  return `₱${amount.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "1,234 pts" */
export function formatPoints(amount: number) {
  return `${amount.toLocaleString("en-PH")} pts`;
}

/** An amount in its currency: points or pesos. */
export function formatAmount(amount: number, currency: "POINTS" | "PESOS") {
  return currency === "PESOS" ? formatPesos(amount) : formatPoints(amount);
}

/** "Oct 2, 2026" in Philippine time. */
export function formatDate(date: Date | string) {
  return new Date(date).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" });
}
