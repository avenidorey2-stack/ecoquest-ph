import { beforeEach, describe, expect, it } from "vitest";
import { POST as review } from "@/app/api/admin/verifications/[id]/review/route";
import { POST as celebrationsRoute } from "@/app/api/celebrations/route";
import { evaluateAchievements, getAchievementBoard } from "@/lib/achievements";
import { getPendingCelebrations } from "@/lib/celebrations";
import { levelForXp } from "@/lib/levels";
import { prisma } from "@/lib/prisma";
import { weekStart } from "@/lib/week";
import { createSlot, createUser, ctx, jsonRequest, resetDb, signInAs } from "../helpers";

beforeEach(resetDb);

async function pendingSubmission(userId: string, plantCount: number, plantType = "Narra") {
  const slot = await createSlot({ requiredPlantType: plantType, pointsPerPlant: 10 });
  const quest = await prisma.quest.create({ data: { userId, slotId: slot.id, status: "PENDING_VERIFICATION" } });
  return prisma.verification.create({
    data: { questId: quest.id, mediaUrl: `/api/media/${crypto.randomUUID()}.jpg`, mediaType: "image/jpeg", plantCount },
  });
}

async function approve(verificationId: string) {
  signInAs(await createUser({ role: "ADMIN", email: `admin-${crypto.randomUUID()}@test.ph` }));
  const res = await review(jsonRequest({ action: "approve" }), ctx({ id: verificationId }));
  expect(res.status).toBe(200);
  return res.json();
}

const unlockedKeys = async (userId: string) =>
  (await prisma.userAchievement.findMany({ where: { userId }, select: { achievement: { select: { key: true } } } }))
    .map((u) => u.achievement.key)
    .sort();

describe("approving a planting", () => {
  it("awards shop points AND XP, and raises the level", async () => {
    const user = await createUser();
    const body = await approve((await pendingSubmission(user.id, 6)).id);

    // 6 plants × 20 XP = 120 XP → level 2 from planting alone.
    expect(body).toMatchObject({ pointsAwarded: 60, xpAwarded: 120, level: 2, leveledUp: true });

    // Badges unlocked by this approval add their own XP on top (as the only ranked planter,
    // they also top the city and national boards).
    const badgeXp = body.achievements.reduce((sum: number, a: { xpReward: number }) => sum + a.xpReward, 0);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after).toMatchObject({ points: 60, totalPlants: 6, xp: 120 + badgeXp });
    expect(after.level).toBe(levelForXp(120 + badgeXp));
    expect(after.points).toBe(60); // XP never touches spendable points
  });

  it("unlocks achievements and reports them", async () => {
    const user = await createUser();
    const body = await approve((await pendingSubmission(user.id, 2, "Bakawan (mangrove)")).id);
    const keys = body.achievements.map((a: { key: string }) => a.key);
    expect(keys).toEqual(expect.arrayContaining(["first-tree", "mangrove", "city-top-10", "city-champion", "national-top-10"]));
    expect(await unlockedKeys(user.id)).toEqual([...keys].sort());
  });
});

describe("evaluateAchievements", () => {
  it("is idempotent — badges and their XP are granted once", async () => {
    const user = await createUser({ totalPlants: 12 });
    const first = await evaluateAchievements(user.id);
    expect(first.map((a) => a.key)).toEqual(["first-tree", "trees-10"]);
    const xpAfterFirst = (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).xp;
    expect(xpAfterFirst).toBe(150); // 50 + 100 badge XP

    expect(await evaluateAchievements(user.id)).toEqual([]);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).xp).toBe(150);
  });

  it("chains: badge XP can unlock a level badge in the same pass", async () => {
    // 900 XP = level 4; the 100-trees path grants 50+100+250+500 = 900 more → 1800 XP = level 6.
    const user = await createUser({ totalPlants: 100, xp: 900, level: 4 });
    const keys = (await evaluateAchievements(user.id)).map((a) => a.key);
    expect(keys).toEqual(expect.arrayContaining(["trees-100", "level-5"]));
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).level).toBe(6);
  });

  it("names city badges after the city at unlock", async () => {
    const user = await createUser({ weeklyPoints: 50, weeklyPointsWeekStart: weekStart() });
    const unlocked = await evaluateAchievements(user.id);
    expect(unlocked.find((a) => a.key === "city-top-10")?.name).toBe("Quezon City Top 10");
    expect(unlocked.find((a) => a.key === "city-champion")?.name).toBe("Quezon City Champion");
  });

  it("re-creates the catalogue after it's emptied", async () => {
    await prisma.achievement.deleteMany();
    const user = await createUser({ totalPlants: 1 });
    expect((await evaluateAchievements(user.id)).map((a) => a.key)).toEqual(["first-tree"]);
  });

  it("the board shows progress for locked badges", async () => {
    const user = await createUser({ totalPlants: 37 });
    const { badges } = await getAchievementBoard(user.id);
    expect(badges.find((b) => b.key === "trees-50")).toMatchObject({ unlockedAt: null, progress: { current: 37, target: 50 } });
    expect(badges.find((b) => b.key === "trees-10")?.unlockedAt).not.toBeNull();
  });
});

describe("celebrations", () => {
  const ack = (kind: unknown) => celebrationsRoute(jsonRequest({ kind }));

  it("shows a level-up once, until acknowledged", async () => {
    const user = await createUser({ level: 3, lastLevelSeen: 1, xp: 300 });
    expect((await getPendingCelebrations(user.id)).levelUp).toEqual({ from: 1, to: 3, title: "Sapling" });

    signInAs(user);
    expect((await ack("level")).status).toBe(200);
    expect((await getPendingCelebrations(user.id)).levelUp).toBeNull();
  });

  it("queues unseen badges until acknowledged", async () => {
    const user = await createUser({ totalPlants: 1 });
    await evaluateAchievements(user.id);
    expect((await getPendingCelebrations(user.id)).achievements.map((a) => a.key)).toEqual(["first-tree"]);

    signInAs(user);
    await ack("achievements");
    expect((await getPendingCelebrations(user.id)).achievements).toEqual([]);
  });

  it("detects a leaderboard climb and names who was overtaken", async () => {
    const wk = weekStart();
    const me = await createUser({ name: "Rey", weeklyPoints: 100, weeklyPointsWeekStart: wk });
    const maria = await createUser({ name: "Maria", weeklyPoints: 200, weeklyPointsWeekStart: wk });

    // First look sets the baseline (#2) silently.
    expect((await getPendingCelebrations(me.id)).rankUp).toBeNull();
    expect((await prisma.user.findUniqueOrThrow({ where: { id: me.id } })).lastRankSeen).toBe(2);

    await prisma.user.update({ where: { id: me.id }, data: { weeklyPoints: 300 } });
    expect((await getPendingCelebrations(me.id)).rankUp).toEqual({
      scope: "local",
      from: 2,
      to: 1,
      passed: "Maria",
      place: "Quezon City",
    });

    signInAs(me);
    await ack("rank");
    expect((await getPendingCelebrations(me.id)).rankUp).toBeNull();
    void maria;
  });

  it("a drop or a new week resets the baseline silently", async () => {
    const wk = weekStart();
    const me = await createUser({ weeklyPoints: 100, weeklyPointsWeekStart: wk, lastRankSeen: 1, lastRankWeekStart: wk });
    await createUser({ weeklyPoints: 500, weeklyPointsWeekStart: wk });
    expect((await getPendingCelebrations(me.id)).rankUp).toBeNull(); // fell to #2
    expect((await prisma.user.findUniqueOrThrow({ where: { id: me.id } })).lastRankSeen).toBe(2);

    const lastWeek = new Date(wk.getTime() - 7 * 86_400_000);
    await prisma.user.update({ where: { id: me.id }, data: { lastRankSeen: 9, lastRankWeekStart: lastWeek } });
    expect((await getPendingCelebrations(me.id)).rankUp).toBeNull(); // different week
  });

  it("validates the kind and requires a session", async () => {
    signInAs(await createUser());
    expect((await ack("confetti")).status).toBe(400);
    signInAs(null);
    expect((await ack("level")).status).toBe(401);
  });
});
