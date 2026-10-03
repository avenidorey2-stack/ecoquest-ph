import type { Mission, MissionKind, MissionObjective, Prisma, PrismaClient } from "@/generated/prisma/client";
import { Prisma as PrismaNS } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { awardPoints } from "@/lib/points";
import { awardXp } from "@/lib/levels";
import { notify } from "@/lib/notifications";
import { dayStart, manilaDateKey, nextDayStart } from "@/lib/week";
import { MAX_MISSION_POINTS, MAX_MISSION_TARGET, MAX_MISSION_XP, MISSION_OBJECTIVES } from "@/lib/mission-meta";

type Db = PrismaClient | Prisma.TransactionClient;

const KINDS: MissionKind[] = ["DAILY", "SIDE"];
const OBJECTIVES = Object.keys(MISSION_OBJECTIVES) as MissionObjective[];
const MAX_TITLE = 80;
const MAX_DESCRIPTION = 300;

export class MissionError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

/** A mission is live while active and inside its start/end window. */
export function isLive(m: Pick<Mission, "isActive" | "startsAt" | "endsAt">, now = new Date()) {
  return m.isActive && m.startsAt <= now && (!m.endsAt || m.endsAt > now);
}

/**
 * The period a mission counts activity in, and its claim key:
 * DAILY → today (00:00–24:00 PHT, clipped to the mission's window), key = PHT date.
 * SIDE → the mission's whole window, key = "once".
 */
export function missionPeriod(m: Pick<Mission, "kind" | "startsAt" | "endsAt">, now = new Date()) {
  if (m.kind === "DAILY") {
    // A daily quest covers whole PHT days — including all of its first day, even if it was
    // created mid-day (e.g. by the seed or an admin at 3 PM).
    const from = new Date(Math.max(dayStart(now).getTime(), dayStart(m.startsAt).getTime()));
    const dayEnd = nextDayStart(now);
    const to = m.endsAt && m.endsAt < dayEnd ? m.endsAt : dayEnd;
    return { from, to, periodKey: manilaDateKey(now) };
  }
  return { from: m.startsAt, to: m.endsAt ?? null, periodKey: "once" };
}

/** How much of `objective` the user did in [from, to). */
export async function objectiveProgress(db: Db, userId: string, objective: MissionObjective, from: Date, to: Date | null) {
  const range = { gte: from, ...(to ? { lt: to } : {}) };
  switch (objective) {
    case "PLANT_TREES":
      return (await db.plantedTree.aggregate({ where: { userId, plantedAt: range }, _sum: { count: true } }))._sum.count ?? 0;
    case "SUBMIT_PROOF":
      // Only proofs an admin approved, counted on the day of approval — a pending upload earns nothing.
      return db.verification.count({ where: { quest: { userId }, status: "APPROVED", reviewedAt: range } });
    case "BUY_SEEDLINGS":
      return (await db.order.aggregate({ where: { userId, createdAt: range, status: { not: "CANCELLED" } }, _sum: { quantity: true } }))._sum.quantity ?? 0;
    case "INVITE_FRIENDS":
      return db.user.count({ where: { referredByUserId: userId, createdAt: range } });
    case "REDEEM_REWARD":
      return db.redemptionHistory.count({ where: { userId, createdAt: range, status: { not: "REJECTED" } } });
  }
}

export type MissionView = {
  id: string;
  kind: MissionKind;
  title: string;
  description: string | null;
  objective: MissionObjective;
  target: number;
  progress: number;
  rewardPoints: number;
  rewardXp: number;
  /** claimed: reward taken this period · ready: target met, claim it · active: in progress */
  status: "claimed" | "ready" | "active";
  endsAt: string | null;
};

/** Live daily and side quests with the user's progress and claim state. */
export async function getUserMissions(userId: string, now = new Date()) {
  const missions = await prisma.mission.findMany({
    where: { isActive: true, startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  const periods = missions.map((m) => ({ m, ...missionPeriod(m, now) }));
  const claims = missions.length
    ? await prisma.missionClaim.findMany({
        where: { userId, OR: periods.map((p) => ({ missionId: p.m.id, periodKey: p.periodKey })) },
        select: { missionId: true },
      })
    : [];
  const claimed = new Set(claims.map((c) => c.missionId));

  const views: MissionView[] = await Promise.all(
    periods.map(async ({ m, from, to }) => {
      const progress = await objectiveProgress(prisma, userId, m.objective, from, to);
      return {
        id: m.id,
        kind: m.kind,
        title: m.title,
        description: m.description,
        objective: m.objective,
        target: m.target,
        progress,
        rewardPoints: m.rewardPoints,
        rewardXp: m.rewardXp,
        status: claimed.has(m.id) ? "claimed" : progress >= m.target ? "ready" : "active",
        endsAt: m.endsAt?.toISOString() ?? null,
      };
    }),
  );
  return {
    daily: views.filter((v) => v.kind === "DAILY"),
    side: views.filter((v) => v.kind === "SIDE"),
    dailyResetsAt: nextDayStart(now).toISOString(),
  };
}

/**
 * Claims a mission's reward for the current period: checks the target is met, then records the
 * claim (unique per mission+user+period, so it can only pay once) and awards points and XP.
 */
export async function claimMission(userId: string, missionId: string, now = new Date()) {
  let kind: MissionKind | undefined;
  try {
    return await prisma.$transaction(async (tx) => {
      // Shared row lock: a concurrent close waits for this claim, and a claim that starts after a
      // close sees isActive = false.
      await tx.$queryRaw`SELECT 1 FROM "Mission" WHERE "id" = ${missionId} FOR SHARE`;
      const mission = await tx.mission.findUnique({ where: { id: missionId } });
      if (!mission || !isLive(mission, now)) throw new MissionError("This quest isn't available.", 404);
      kind = mission.kind;
      const { from, to, periodKey } = missionPeriod(mission, now);
      const progress = await objectiveProgress(tx, userId, mission.objective, from, to);
      if (progress < mission.target) {
        throw new MissionError(`Not done yet: ${progress}/${mission.target}.`, 409);
      }
      const claim = await tx.missionClaim.create({
        data: { missionId, userId, periodKey, pointsAwarded: mission.rewardPoints, xpAwarded: mission.rewardXp },
      });
      if (mission.rewardPoints > 0) await awardPoints(tx, userId, mission.rewardPoints, 0, now);
      const xp = await awardXp(tx, userId, mission.rewardXp);
      await notify(
        tx,
        userId,
        `${mission.kind === "DAILY" ? "Daily" : "Side"} quest complete: ${mission.title} — +${mission.rewardPoints.toLocaleString("en-PH")} pts${mission.rewardXp ? ` · +${mission.rewardXp} XP` : ""}.`,
        "/dashboard",
      );
      return { claim, level: xp.level, leveledUp: xp.level > xp.previousLevel };
    });
  } catch (err) {
    if (err instanceof PrismaNS.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new MissionError(kind === "DAILY" ? "Already claimed today — come back tomorrow!" : "Already claimed.", 409);
    }
    throw err;
  }
}

// ─── Closing a quest ────────────────────────────────────────────────────────

/** userId → progress for everyone with any activity toward `objective` in [from, to). */
async function progressByUser(db: Db, objective: MissionObjective, from: Date, to: Date | null) {
  const range = { gte: from, ...(to ? { lt: to } : {}) };
  const totals = new Map<string, number>();
  const add = (userId: string | null, n: number) => {
    if (userId && n > 0) totals.set(userId, (totals.get(userId) ?? 0) + n);
  };
  switch (objective) {
    case "PLANT_TREES":
      for (const r of await db.plantedTree.groupBy({ by: ["userId"], where: { plantedAt: range }, _sum: { count: true } })) {
        add(r.userId, r._sum.count ?? 0);
      }
      break;
    case "SUBMIT_PROOF":
      for (const v of await db.verification.findMany({
        where: { status: "APPROVED", reviewedAt: range },
        select: { quest: { select: { userId: true } } },
      })) {
        add(v.quest.userId, 1);
      }
      break;
    case "BUY_SEEDLINGS":
      for (const r of await db.order.groupBy({ by: ["userId"], where: { createdAt: range, status: { not: "CANCELLED" } }, _sum: { quantity: true } })) {
        add(r.userId, r._sum.quantity ?? 0);
      }
      break;
    case "INVITE_FRIENDS":
      for (const r of await db.user.groupBy({ by: ["referredByUserId"], where: { referredByUserId: { not: null }, createdAt: range }, _count: true })) {
        add(r.referredByUserId, r._count);
      }
      break;
    case "REDEEM_REWARD":
      for (const r of await db.redemptionHistory.groupBy({ by: ["userId"], where: { createdAt: range, status: { not: "REJECTED" } }, _count: true })) {
        add(r.userId, r._count);
      }
      break;
  }
  return totals;
}

/**
 * Closes a live quest (isActive → false). Progress is never stored — it's derived from activity —
 * so there's nothing to clean up: once inactive the quest is filtered from dashboards and can't be
 * claimed, and rewards already claimed stay. Users who had progress this period but hadn't claimed
 * it (incomplete, or complete but unclaimed) are told it's closed. Returns how many were notified.
 */
export async function closeMission(missionId: string, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    // Exclusive row lock: waits for in-flight claims to commit (so they count as claimed below)
    // and holds off new claims until the quest is closed.
    await tx.$queryRaw`SELECT 1 FROM "Mission" WHERE "id" = ${missionId} FOR UPDATE`;
    const mission = await tx.mission.findUnique({ where: { id: missionId } });
    if (!mission) throw new MissionError("Quest not found.", 404);

    // Only a quest that was live has users mid-way through it.
    let notified = 0;
    if (isLive(mission, now)) {
      const { from, to, periodKey } = missionPeriod(mission, now);
      const progress = await progressByUser(tx, mission.objective, from, to);
      const claimed = new Set(
        (await tx.missionClaim.findMany({ where: { missionId, periodKey }, select: { userId: true } })).map((c) => c.userId),
      );
      const affected = [...progress.keys()].filter((userId) => !claimed.has(userId));
      if (affected.length) {
        ({ count: notified } = await tx.notification.createMany({
          data: affected.map((userId) => ({ userId, message: `The quest '${mission.title}' is now closed.`, link: "/dashboard" })),
        }));
      }
    }
    await tx.mission.update({ where: { id: missionId }, data: { isActive: false } });
    return { notified };
  });
}

// ─── Admin input ────────────────────────────────────────────────────────────

type MissionInput = Partial<
  Pick<Mission, "kind" | "title" | "description" | "objective" | "target" | "rewardPoints" | "rewardXp" | "isActive" | "startsAt" | "endsAt" | "sortOrder">
>;

/** Validates an admin create (all core fields required) or edit (only provided fields). */
export function parseMission(body: Record<string, unknown>, { create }: { create: boolean }) {
  const data: MissionInput = {};
  const fail = (error: string) => ({ ok: false as const, error });
  const int = (v: unknown, min: number, max: number) => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;

  if (body.kind !== undefined) {
    if (!KINDS.includes(body.kind as MissionKind)) return fail("Type must be DAILY or SIDE.");
    data.kind = body.kind as MissionKind;
  }
  if (body.title !== undefined) {
    const t = typeof body.title === "string" ? body.title.trim() : "";
    if (!t || t.length > MAX_TITLE) return fail(`Title is required (max ${MAX_TITLE} characters).`);
    data.title = t;
  }
  if (body.description !== undefined) {
    if (body.description !== null && typeof body.description !== "string") return fail("Description must be text.");
    const d = (body.description as string | null)?.trim() ?? "";
    if (d.length > MAX_DESCRIPTION) return fail(`Description is at most ${MAX_DESCRIPTION} characters.`);
    data.description = d || null;
  }
  if (body.objective !== undefined) {
    if (!OBJECTIVES.includes(body.objective as MissionObjective)) return fail("Unknown objective.");
    data.objective = body.objective as MissionObjective;
  }
  if (body.target !== undefined) {
    if (!int(body.target, 1, MAX_MISSION_TARGET)) return fail(`Target must be a whole number from 1 to ${MAX_MISSION_TARGET}.`);
    data.target = body.target as number;
  }
  if (body.rewardPoints !== undefined) {
    if (!int(body.rewardPoints, 0, MAX_MISSION_POINTS)) return fail(`Reward points must be 0–${MAX_MISSION_POINTS.toLocaleString("en-PH")}.`);
    data.rewardPoints = body.rewardPoints as number;
  }
  if (body.rewardXp !== undefined) {
    if (!int(body.rewardXp, 0, MAX_MISSION_XP)) return fail(`Reward XP must be 0–${MAX_MISSION_XP.toLocaleString("en-PH")}.`);
    data.rewardXp = body.rewardXp as number;
  }
  if (body.sortOrder !== undefined) {
    if (!int(body.sortOrder, -1000, 1000)) return fail("Sort order must be a whole number.");
    data.sortOrder = body.sortOrder as number;
  }
  if (body.isActive !== undefined) {
    if (typeof body.isActive !== "boolean") return fail("isActive must be true or false.");
    data.isActive = body.isActive;
  }
  for (const field of ["startsAt", "endsAt"] as const) {
    const v = body[field];
    if (v === undefined) continue;
    if (v === null || v === "") {
      if (field === "startsAt") return fail("Start date can't be empty.");
      data.endsAt = null;
      continue;
    }
    const date = typeof v === "string" ? new Date(v) : null;
    if (!date || Number.isNaN(date.getTime())) return fail(`Invalid ${field === "startsAt" ? "start" : "end"} date.`);
    data[field] = date;
  }
  if (data.startsAt && data.endsAt && data.endsAt <= data.startsAt) return fail("End date must be after the start date.");

  if (create) {
    for (const f of ["kind", "title", "objective", "target", "rewardPoints"] as const) {
      if (data[f] === undefined) return fail(`${f} is required.`);
    }
  }
  return { ok: true as const, data };
}

// ─── Starter content (prisma/seed.ts) ───────────────────────────────────────

const STARTER_MISSIONS: Omit<Prisma.MissionCreateManyInput, "id">[] = [
  { kind: "DAILY", title: "Daily proof", description: "Get a planting proof approved today.", objective: "SUBMIT_PROOF", target: 1, rewardPoints: 20, rewardXp: 10, sortOrder: 1 },
  { kind: "DAILY", title: "Green day", description: "Get 3 plants approved today.", objective: "PLANT_TREES", target: 3, rewardPoints: 50, rewardXp: 20, sortOrder: 2 },
  { kind: "DAILY", title: "Seedling run", description: "Buy a seedling from the shop today.", objective: "BUY_SEEDLINGS", target: 1, rewardPoints: 15, rewardXp: 5, sortOrder: 3 },
  { kind: "SIDE", title: "Stock the nursery", description: "Buy 5 seedlings from the shop.", objective: "BUY_SEEDLINGS", target: 5, rewardPoints: 100, rewardXp: 30, sortOrder: 1 },
  { kind: "SIDE", title: "Grow the movement", description: "Invite 3 friends who sign up with your link.", objective: "INVITE_FRIENDS", target: 3, rewardPoints: 150, rewardXp: 50, sortOrder: 2 },
  { kind: "SIDE", title: "Treat yourself", description: "Redeem your first reward.", objective: "REDEEM_REWARD", target: 1, rewardPoints: 30, rewardXp: 10, sortOrder: 3 },
];

/** Adds starter daily/side quests — only when there are no missions yet (admin edits are never overwritten). */
export async function seedStarterMissions(db: Db) {
  if (await db.mission.count()) return 0;
  return (await db.mission.createMany({ data: STARTER_MISSIONS })).count;
}
