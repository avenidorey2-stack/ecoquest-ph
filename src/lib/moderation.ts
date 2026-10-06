import type { ModerationAction, ReportReason } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { notify, notifyAdmins } from "@/lib/notifications";
import { hitRateLimit } from "@/lib/rate-limit";

// Profile reports and what admins do about them.
//   1. A planter reports another planter's profile (fileReport): reason + optional details.
//   2. Admins see open reports grouped by the reported planter (listOpenReportGroups).
//   3. An admin decides once for all of that planter's open reports (resolveReports):
//      dismiss · warn (a notification) · suspend for some days · ban (the last resort).
//   4. Suspended/banned planters can't sign in or use a session (getCurrentUser in authz);
//      an admin can lift it early (liftRestriction).
// Reporters are told the report was reviewed, never what happened to the other planter.

export const REPORT_REASONS: Record<ReportReason, string> = {
  SPAM: "Spam or scam",
  HARASSMENT: "Harassment or bullying",
  INAPPROPRIATE_CONTENT: "Inappropriate photos or comments",
  FAKE_ACCOUNT: "Fake account or pretending to be someone",
  CHEATING: "Cheating (fake plantings or proofs)",
  OTHER: "Something else",
};

export const REPORT_DETAILS_MAX = 500;
export const ADMIN_NOTE_MAX = 300;
export const SUSPEND_DAY_OPTIONS = [1, 7, 30] as const;
/** Reports one planter can file per day (stops one person flooding the queue). */
export const REPORTS_PER_DAY = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

type Restrictable = { suspendedUntil: Date | null; bannedAt: Date | null };

/** Whether the account is banned, or suspended right now. */
export function isRestricted(user: Restrictable, now = new Date()) {
  return !!user.bannedAt || (!!user.suspendedUntil && user.suspendedUntil > now);
}

const fmtUntil = (d: Date) =>
  d.toLocaleString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

/** What a suspended or banned planter is told when they try to sign in. */
export function restrictionMessage(user: Restrictable & { moderationReason: string | null }) {
  const reason = user.moderationReason ? ` Reason: ${user.moderationReason}` : "";
  if (user.bannedAt) return `This account has been banned for breaking the EcoQuest PH community rules.${reason}`;
  return `This account is suspended until ${fmtUntil(user.suspendedUntil!)}.${reason}`;
}

type Failure = { ok: false; status: number; error: string };

/** Files a report. A second report of the same planter while one is open updates it instead. */
export async function fileReport(input: {
  reporterId: string;
  reportedId: string;
  reason: unknown;
  details: unknown;
  now?: Date;
}): Promise<{ ok: true; updated: boolean } | Failure> {
  const now = input.now ?? new Date();
  if (typeof input.reason !== "string" || !(input.reason in REPORT_REASONS)) {
    return { ok: false, status: 400, error: "Choose a reason for the report." };
  }
  const reason = input.reason as ReportReason;
  const details = typeof input.details === "string" ? input.details.trim().slice(0, REPORT_DETAILS_MAX) : "";
  if (reason === "OTHER" && !details) return { ok: false, status: 400, error: "Tell us what happened." };
  if (input.reporterId === input.reportedId) return { ok: false, status: 400, error: "You can't report yourself." };

  const reported = await prisma.user.findUnique({ where: { id: input.reportedId }, select: { id: true, name: true, role: true } });
  if (!reported) return { ok: false, status: 404, error: "That planter no longer exists." };
  if (reported.role === "ADMIN") return { ok: false, status: 400, error: "Team accounts can't be reported here. Use Settings → Help instead." };

  const open = await prisma.userReport.findFirst({
    where: { reporterId: input.reporterId, reportedId: reported.id, status: "OPEN" },
    select: { id: true },
  });
  if (open) {
    await prisma.userReport.update({ where: { id: open.id }, data: { reason, details } });
    return { ok: true, updated: true };
  }

  if (!(await hitRateLimit(`report:user:${input.reporterId}`, REPORTS_PER_DAY, DAY_MS, now))) {
    return { ok: false, status: 429, error: "You've sent a lot of reports today. Please try again tomorrow." };
  }
  await prisma.userReport.create({ data: { reporterId: input.reporterId, reportedId: reported.id, reason, details, createdAt: now } });
  await notifyAdmins(prisma, `New report: ${reported.name ?? "A planter"} — ${REPORT_REASONS[reason]}.`, "/admin/reports");
  return { ok: true, updated: false };
}

/** Open reports, one group per reported planter, the most-reported (then newest) first. */
export async function listOpenReportGroups() {
  const reports = await prisma.userReport.findMany({
    where: { status: "OPEN" },
    orderBy: { createdAt: "desc" },
    include: {
      reporter: { select: { id: true, name: true } },
      reported: {
        select: { id: true, name: true, email: true, image: true, createdAt: true, suspendedUntil: true, bannedAt: true },
      },
    },
  });
  const groups = new Map<string, { user: (typeof reports)[number]["reported"]; reports: typeof reports }>();
  for (const r of reports) {
    const g = groups.get(r.reportedId) ?? { user: r.reported, reports: [] };
    g.reports.push(r);
    groups.set(r.reportedId, g);
  }
  // Past decisions about each planter, so the admin can see a repeat offender.
  const ids = [...groups.keys()];
  const history = ids.length
    ? await prisma.userReport.groupBy({
        by: ["reportedId", "action"],
        where: { reportedId: { in: ids }, status: "RESOLVED", action: { not: "DISMISSED" } },
        _count: { _all: true },
      })
    : [];
  return [...groups.values()]
    .map((g) => ({
      ...g,
      pastActions: history
        .filter((h) => h.reportedId === g.user.id)
        .map((h) => ({ action: h.action as ModerationAction, count: h._count._all })),
    }))
    .sort((a, b) => b.reports.length - a.reports.length || +b.reports[0].createdAt - +a.reports[0].createdAt);
}

/** Recently decided reports (the moderation log), newest first. */
export function listResolvedReports(take = 30) {
  return prisma.userReport.findMany({
    where: { status: "RESOLVED" },
    orderBy: { resolvedAt: "desc" },
    take,
    include: {
      reporter: { select: { name: true } },
      reported: { select: { id: true, name: true } },
      resolvedBy: { select: { name: true } },
    },
  });
}

/** Planters who are suspended right now or banned, for the "Restricted Accounts" list. */
export function listRestrictedUsers(now = new Date()) {
  return prisma.user.findMany({
    where: { OR: [{ bannedAt: { not: null } }, { suspendedUntil: { gt: now } }] },
    orderBy: [{ bannedAt: "desc" }, { suspendedUntil: "desc" }],
    select: { id: true, name: true, email: true, suspendedUntil: true, bannedAt: true, moderationReason: true },
  });
}

const ACTION_NOTICE: Record<ModerationAction, string> = {
  DISMISSED: "Thanks for your report. Our team reviewed it and didn't find a rule broken this time.",
  WARNED: "Thanks for your report. Our team reviewed it and took action.",
  SUSPENDED: "Thanks for your report. Our team reviewed it and took action.",
  BANNED: "Thanks for your report. Our team reviewed it and took action.",
};

/**
 * The admin's decision for every open report about `reportedId`. A warning needs a note (it's the
 * message the planter gets); suspending needs a number of days; banning is permanent until lifted.
 */
export async function resolveReports(input: {
  adminId: string;
  reportedId: string;
  action: unknown;
  days?: unknown;
  note?: unknown;
  now?: Date;
}): Promise<{ ok: true; resolved: number } | Failure> {
  const now = input.now ?? new Date();
  const actions: ModerationAction[] = ["DISMISSED", "WARNED", "SUSPENDED", "BANNED"];
  if (typeof input.action !== "string" || !actions.includes(input.action as ModerationAction)) {
    return { ok: false, status: 400, error: "Choose what to do." };
  }
  const action = input.action as ModerationAction;
  const note = typeof input.note === "string" ? input.note.trim().slice(0, ADMIN_NOTE_MAX) : "";
  if (action === "WARNED" && !note) return { ok: false, status: 400, error: "Write the warning the planter will receive." };
  const days = Number(input.days);
  if (action === "SUSPENDED" && !SUSPEND_DAY_OPTIONS.includes(days as (typeof SUSPEND_DAY_OPTIONS)[number])) {
    return { ok: false, status: 400, error: "Choose how long to suspend." };
  }

  const target = await prisma.user.findUnique({ where: { id: input.reportedId }, select: { id: true, role: true } });
  if (!target) return { ok: false, status: 404, error: "That planter no longer exists." };
  if (target.role === "ADMIN") return { ok: false, status: 400, error: "Team accounts can't be suspended or banned here." };

  return prisma.$transaction(async (tx) => {
    const open = await tx.userReport.findMany({
      where: { reportedId: target.id, status: "OPEN" },
      select: { id: true, reporterId: true },
    });
    if (!open.length) return { ok: false as const, status: 409, error: "These reports were already handled." };

    await tx.userReport.updateMany({
      where: { id: { in: open.map((r) => r.id) } },
      data: { status: "RESOLVED", action, adminNote: note || null, resolvedById: input.adminId, resolvedAt: now },
    });

    if (action === "WARNED") {
      await notify(tx, target.id, `Warning from the EcoQuest PH team: ${note}`);
    } else if (action === "SUSPENDED") {
      await tx.user.update({
        where: { id: target.id },
        data: { suspendedUntil: new Date(now.getTime() + days * DAY_MS), moderationReason: note || null, isOnline: false },
      });
    } else if (action === "BANNED") {
      await tx.user.update({ where: { id: target.id }, data: { bannedAt: now, moderationReason: note || null, isOnline: false } });
      // No more phone notifications for an account that can't sign in again.
      await tx.pushSubscription.deleteMany({ where: { userId: target.id } });
    }

    const reporters = [...new Set(open.map((r) => r.reporterId).filter((id): id is string => !!id))];
    for (const id of reporters) await notify(tx, id, ACTION_NOTICE[action]);
    return { ok: true as const, resolved: open.length };
  });
}

/** Ends a suspension or ban early. */
export async function liftRestriction(userId: string) {
  const { count } = await prisma.user.updateMany({
    where: { id: userId, OR: [{ bannedAt: { not: null } }, { suspendedUntil: { not: null } }] },
    data: { bannedAt: null, suspendedUntil: null, moderationReason: null },
  });
  return count > 0;
}
