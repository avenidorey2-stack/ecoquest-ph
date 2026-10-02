// Leaderboard weeks run Monday 00:00 → Sunday 23:59:59 Philippine Time (UTC+8, no DST).

const PHT_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Start of the leaderboard week containing `now`, as a UTC instant. */
export function weekStart(now = new Date()) {
  // Shift so the UTC fields read as Manila wall-clock time.
  const manila = new Date(now.getTime() + PHT_OFFSET_MS);
  const daysSinceMonday = (manila.getUTCDay() + 6) % 7;
  const mondayMidnight = Date.UTC(
    manila.getUTCFullYear(),
    manila.getUTCMonth(),
    manila.getUTCDate() - daysSinceMonday,
  );
  return new Date(mondayMidnight - PHT_OFFSET_MS);
}

/** When the current week's leaderboard resets. */
export function nextWeekStart(now = new Date()) {
  return new Date(weekStart(now).getTime() + 7 * DAY_MS);
}

/** A user's weekly points, or 0 if they were earned in an earlier week. */
export function currentWeeklyPoints(
  user: { weeklyPoints: number; weeklyPointsWeekStart: Date | null },
  now = new Date(),
) {
  return user.weeklyPointsWeekStart?.getTime() === weekStart(now).getTime() ? user.weeklyPoints : 0;
}

/** Start of the Philippine-time day containing `now` (00:00 PHT), as a UTC instant. Daily quests reset here. */
export function dayStart(now = new Date()) {
  const manila = new Date(now.getTime() + PHT_OFFSET_MS);
  return new Date(Date.UTC(manila.getUTCFullYear(), manila.getUTCMonth(), manila.getUTCDate()) - PHT_OFFSET_MS);
}

/** Next 00:00 PHT after `now`. */
export function nextDayStart(now = new Date()) {
  return new Date(dayStart(now).getTime() + DAY_MS);
}

/** "2026-10-03" — the Philippine calendar date of `now` (daily quest period key). */
export function manilaDateKey(now = new Date()) {
  return new Date(now.getTime() + PHT_OFFSET_MS).toISOString().slice(0, 10);
}
