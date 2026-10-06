import bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it } from "vitest";
import { PATCH as patchSettings } from "@/app/api/settings/route";
import { POST as changePassword } from "@/app/api/settings/password/route";
import { POST as deleteAccount } from "@/app/api/settings/delete-account/route";
import { DELETE as unblock, POST as block } from "@/app/api/blocks/[userId]/route";
import { POST as befriend } from "@/app/api/friends/[userId]/route";
import { GET as search } from "@/app/api/users/search/route";
import { POST as like } from "@/app/api/photos/[id]/like/route";
import { POST as comment } from "@/app/api/photos/[id]/comments/route";
import { POST as report } from "@/app/api/support/route";
import { POST as message } from "@/app/api/support/[id]/messages/route";
import { PATCH as setStatus } from "@/app/api/admin/support/[id]/route";
import { getPublicProfile } from "@/lib/public-profile";
import { listBlocked } from "@/lib/blocks";
import { getTicket, listMyTickets, listTickets } from "@/lib/support";
import { prisma } from "@/lib/prisma";
import { createSlot, createUser, ctx, jsonRequest, resetDb, signInAs } from "../helpers";

beforeEach(resetDb);

const req = (url = "http://test.local") => new Request(url);
const inbox = (userId: string) => prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });

async function photoOf(owner: { id: string }) {
  const quest = await prisma.quest.create({ data: { userId: owner.id, slotId: (await createSlot()).id } });
  return prisma.verification.create({
    data: { questId: quest.id, mediaUrl: `/api/media/${owner.id}.jpg`, mediaType: "image/jpeg", status: "APPROVED", reviewedAt: new Date() },
  });
}

describe("privacy and notification settings", () => {
  it("saves photo privacy and notification switches, rejecting bad values", async () => {
    const me = await createUser();
    signInAs(me);
    const res = await patchSettings(jsonRequest({ photoVisibility: "FRIENDS", notifyLikes: false }, "PATCH"));
    expect((await res.json()).settings).toEqual({
      photoVisibility: "FRIENDS",
      notifyFriendRequests: true,
      notifyLikes: false,
      notifyComments: true,
      showActiveStatus: true,
      allowComments: true,
    });
    expect((await patchSettings(jsonRequest({ photoVisibility: "PUBLIC" }, "PATCH"))).status).toBe(400);
    expect((await patchSettings(jsonRequest({ notifyComments: "no" }, "PATCH"))).status).toBe(400);
    expect((await patchSettings(jsonRequest({}, "PATCH"))).status).toBe(400);
  });

  it("switched-off notifications aren't sent (the action still happens)", async () => {
    const owner = await createUser({ notifyLikes: false, notifyComments: false, notifyFriendRequests: false });
    const photo = await photoOf(owner);
    signInAs(await createUser());
    expect((await like(req(), ctx({ id: photo.id }))).status).toBe(200);
    expect((await comment(jsonRequest({ body: "Nice" }), ctx({ id: photo.id }))).status).toBe(201);
    expect((await befriend(req(), ctx({ userId: owner.id }))).status).toBe(200);
    expect(await inbox(owner.id)).toHaveLength(0);
    expect(await prisma.photoLike.count()).toBe(1);
  });
});

describe("change password", () => {
  it("needs the current password, then switches to the new one", async () => {
    const me = await createUser({ passwordHash: await bcrypt.hash("old-password", 4) });
    signInAs(me);
    expect((await changePassword(jsonRequest({ current: "wrong-one", next: "new-password1" }))).status).toBe(400);
    expect((await changePassword(jsonRequest({ current: "old-password", next: "short" }))).status).toBe(400);
    expect((await changePassword(jsonRequest({ current: "old-password", next: "old-password" }))).status).toBe(400);
    expect((await changePassword(jsonRequest({ current: "old-password", next: "new-password1" }))).status).toBe(200);
    const { passwordHash } = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
    expect(await bcrypt.compare("new-password1", passwordHash!)).toBe(true);
  });

  it("lets a Google-only account set a first password", async () => {
    const me = await createUser({ passwordHash: null });
    signInAs(me);
    expect((await changePassword(jsonRequest({ next: "first-password" }))).status).toBe(200);
  });
});

describe("delete account", () => {
  const del = (body: object) => deleteAccount(jsonRequest(body));

  it("requires DELETE and the password, then removes everything and rolls back species totals", async () => {
    const species = await prisma.treeSpecies.create({
      data: { slug: "narra", name: "Narra", scientificName: "Pterocarpus indicus", category: "Native", description: "", imageUrl: "", totalPlanted: 10 },
    });
    const me = await createUser({ passwordHash: await bcrypt.hash("my-password", 4) });
    const invited = await createUser({ referredByUserId: me.id });
    const photo = await photoOf(me);
    await prisma.plantedTree.create({ data: { userId: me.id, speciesId: species.id, psgcCode: "137404000", count: 4, verificationId: photo.id } });
    signInAs(me);

    expect((await del({ confirm: "delete", password: "my-password" })).status).toBe(400);
    expect((await del({ confirm: "DELETE", password: "nope-nope" })).status).toBe(400);
    expect((await del({ confirm: "DELETE", password: "my-password" })).status).toBe(200);

    expect(await prisma.user.findUnique({ where: { id: me.id } })).toBeNull();
    expect(await prisma.verification.count()).toBe(0);
    expect((await prisma.treeSpecies.findUniqueOrThrow({ where: { id: species.id } })).totalPlanted).toBe(6);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: invited.id } })).referredByUserId).toBeNull();
  });

  it("waits while a cash-out is in progress, and isn't available to admins", async () => {
    const me = await createUser({ passwordHash: null });
    const reward = await prisma.reward.create({ data: { rewardType: "EWALLET_CASH", brand: "GCash", costPoints: 100, valuePesos: 50 } });
    await prisma.redemptionHistory.create({ data: { userId: me.id, rewardId: reward.id, pointsSpent: 100 } });
    signInAs(me);
    expect((await del({ confirm: "DELETE" })).status).toBe(409);
    signInAs(await createUser({ role: "ADMIN" }));
    expect((await del({ confirm: "DELETE" })).status).toBe(403);
  });
});

describe("blocking", () => {
  it("works both ways: no search, profile, requests or photos; ends the friendship; unblock restores", async () => {
    const me = await createUser({ name: "Juan Blocker" });
    const them = await createUser({ name: "Pedro Blocked" });
    const photo = await photoOf(them);
    signInAs(me);
    await befriend(req(), ctx({ userId: them.id }));

    expect((await block(req(), ctx({ userId: them.id }))).status).toBe(200);
    expect(await prisma.friendship.count()).toBe(0);
    expect((await listBlocked(me.id)).map((b) => b.name)).toEqual(["Pedro Blocked"]);

    const find = async (q: string) => (await (await search(req(`http://test.local/api/users/search?q=${q}`))).json()).results;
    expect(await find("pedro")).toEqual([]);
    expect(await getPublicProfile(them.id, me.id)).toBeNull();
    expect((await like(req(), ctx({ id: photo.id }))).status).toBe(404);

    // The blocked side can't reach the blocker either.
    signInAs(them);
    expect(await find("juan")).toEqual([]);
    expect(await getPublicProfile(me.id, them.id)).toBeNull();
    expect((await befriend(req(), ctx({ userId: me.id }))).status).toBe(404);

    signInAs(me);
    await unblock(req(), ctx({ userId: them.id }));
    expect((await find("pedro")).map((r: { name: string }) => r.name)).toEqual(["Pedro Blocked"]);
  });
});

describe("report a problem", () => {
  it("is a chat: admins are told about reports and replies; the user about team replies and resolution", async () => {
    const user = await createUser({ name: "Maria" });
    const admin = await createUser({ name: "Ops", role: "ADMIN" });
    const other = await createUser();

    signInAs(user);
    expect((await report(jsonRequest({ subject: " ", body: "x" }))).status).toBe(400);
    const { id } = await (await report(jsonRequest({ subject: "Map won't load", body: "It stays blank on my phone." }))).json();
    expect((await inbox(admin.id)).map((n) => [n.message, n.link])).toEqual([
      ["New problem report from Maria: “Map won't load”", `/admin/support/${id}`],
    ]);
    expect(await listTickets("OPEN")).toMatchObject([{ id, unread: true, userName: "Maria", messages: 1 }]);

    // Others can't see or post to it.
    expect(await getTicket(id, { id: other.id, role: "USER" })).toBeNull();
    signInAs(other);
    expect((await message(jsonRequest({ body: "hi" }), ctx({ id }))).status).toBe(404);

    // The team replies; the user is notified and sees "EcoQuest Team".
    signInAs(admin);
    expect((await getTicket(id, admin))?.messages).toHaveLength(1);
    expect((await listTickets("OPEN"))[0].unread).toBe(false);
    await message(jsonRequest({ body: "Try updating Chrome." }), ctx({ id }));
    expect((await inbox(user.id)).map((n) => n.message)).toEqual(["Our team replied to your report “Map won't load”."]);
    expect((await listMyTickets(user.id))[0].userUnread).toBe(true);
    const seen = await getTicket(id, user);
    expect(seen?.messages.map((m) => [m.authorName, m.body])).toEqual([
      ["Maria", "It stays blank on my phone."],
      ["EcoQuest Team", "Try updating Chrome."],
    ]);

    // Resolve; a user reply reopens it and tells the team.
    expect((await setStatus(jsonRequest({ status: "CLOSED" }, "PATCH"), ctx({ id }))).status).toBe(200);
    expect((await inbox(user.id)).at(-1)?.message).toContain("marked your report “Map won't load” as resolved");
    signInAs(user);
    expect((await setStatus(jsonRequest({ status: "OPEN" }, "PATCH"), ctx({ id }))).status).toBe(403);
    await message(jsonRequest({ body: "Still blank." }), ctx({ id }));
    expect((await prisma.supportTicket.findUniqueOrThrow({ where: { id } })).status).toBe("OPEN");
    expect((await inbox(admin.id)).at(-1)?.message).toBe("Maria replied to “Map won't load”.");
  });
});
