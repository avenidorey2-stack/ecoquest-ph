import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/assistant/route";
import { prisma } from "@/lib/prisma";
import { pairKey } from "@/lib/friends";
import { deleteChat, sendDirectMessage } from "@/lib/messages";
import { weekStart } from "@/lib/week";
import { CODES, createSlot, createUser, jsonRequest, resetDb, signInAs } from "../helpers";

// EcoBot's chat, comment and logout actions, and its tree-stats and leaderboard lookups. As with
// the other actions, the tools only build cards; nothing changes until the planter allows it.
// Groq is faked: each test scripts one tool call, then a short reply.

vi.mock("@/lib/push", async (original) => ({ ...(await original<typeof import("@/lib/push")>()), queuePush: vi.fn() }));

const create = vi.fn();
const fetchMock = vi.fn(async (_url: string, init: RequestInit) => Response.json(await create(JSON.parse(init.body as string))));
const textReply = (text: string) => ({ choices: [{ finish_reason: "stop", message: { role: "assistant", content: text } }] });
const toolReply = (name: string, args: object) => ({
  choices: [{ finish_reason: "tool_calls", message: { role: "assistant", content: null, tool_calls: [{ id: "t1", type: "function", function: { name, arguments: JSON.stringify(args) } }] } }],
});

/** Asks with the model scripted to call `name` with `args`; returns the reply and what the tool told the model. */
async function act(name: string, args: object = {}, question = "please do it") {
  create.mockReset();
  create.mockResolvedValueOnce(toolReply(name, args)).mockResolvedValueOnce(textReply("Tap the card below."));
  const res = await POST(jsonRequest({ messages: [{ role: "user", text: question }] }));
  const body = await res.json();
  return { reply: body.reply, tool: JSON.parse(create.mock.calls[1][0].messages.at(-1).content) };
}

const befriend = (a: string, b: string) =>
  prisma.friendship.create({ data: { pairKey: pairKey(a, b), requesterId: a, addresseeId: b, status: "ACCEPTED", acceptedAt: new Date() } });
const say = async (from: string, to: string, body: string) => {
  const r = await sendDirectMessage(from, to, body, null);
  if (!r.ok) throw new Error(r.error);
  return r.message;
};
async function approvedPhoto(userId: string) {
  const quest = await prisma.quest.create({ data: { userId, slotId: (await createSlot()).id } });
  return prisma.verification.create({ data: { questId: quest.id, mediaUrl: `/api/media/${quest.id}.jpg`, mediaType: "image/jpeg", plantCount: 1, status: "APPROVED", reviewedAt: new Date() } });
}

beforeEach(async () => {
  await resetDb();
  vi.stubGlobal("fetch", fetchMock);
  process.env.GROQ_API_KEY = "test-key";
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GROQ_API_KEY;
});

describe("EcoBot — chats", () => {
  it("delete_chat: a card for that chat (for the planter only); only people they have a chat with", async () => {
    const me = await createUser({ name: "Juan" });
    const demana = await createUser({ name: "Demana Cruz" });
    await createUser({ name: "Ben" }); // a planter, but no chat with them
    await befriend(me.id, demana.id);
    await say(me.id, demana.id, "Hi!");
    signInAs(me);

    const { reply } = await act("people_action", { action: "delete_chat", names: ["Demana"] }, "i want you to clear my conversation with demana");
    expect(reply.actions).toEqual([expect.objectContaining({ kind: "delete_chat", userId: demana.id, name: "Demana Cruz" })]);
    expect((await act("people_action", { action: "delete_chat", names: ["Ben"] })).tool.reason).toMatch(/couldn't find anyone called "Ben".*Looked among your chats/);
    // Nothing deleted until the planter allows it.
    expect(await prisma.conversationMember.count({ where: { clearedAt: { not: null } } })).toBe(0);
  });

  it("delete_chat group=chats: one card for every chat", async () => {
    const me = await createUser({ name: "Juan" });
    const ana = await createUser({ name: "Ana" });
    const ben = await createUser({ name: "Ben" });
    await befriend(me.id, ana.id);
    await befriend(me.id, ben.id);
    await say(me.id, ana.id, "Hi Ana");
    await say(ben.id, me.id, "Hi Juan");
    signInAs(me);
    const { tool, reply } = await act("people_action", { action: "delete_chat", group: "chats" }, "delete all my conversations");
    expect(tool).toMatchObject({ shown: true, card: { kind: "batch", count: 2, of: "delete_chat" } });
    expect(reply.actions[0].items.map((i: { name: string }) => i.name).sort()).toEqual(["Ana", "Ben"]);
  });

  it("unsend_message: the latest by default, by words, or all — only the planter's own, not ones they deleted", async () => {
    const me = await createUser({ name: "Juan" });
    const ana = await createUser({ name: "Ana" });
    await befriend(me.id, ana.id);
    await say(me.id, ana.id, "old one before deleting");
    await deleteChat(me.id, ana.id);
    await new Promise((r) => setTimeout(r, 5));
    const hello = await say(me.id, ana.id, "Hello Ana");
    await say(ana.id, me.id, "Hello Juan"); // hers: can't be unsent by me
    const plant = await say(me.id, ana.id, "Let's plant on Saturday");
    signInAs(me);

    const latest = await act("people_action", { action: "unsend_message", names: ["Ana"] }, "unsend my last message to Ana");
    expect(latest.reply.actions).toEqual([expect.objectContaining({ kind: "unsend_message", messageId: plant.id, preview: "Let's plant on Saturday", userId: ana.id })]);

    const byWords = await act("people_action", { action: "unsend_message", names: ["Ana"], text: "hello" });
    expect(byWords.reply.actions).toEqual([expect.objectContaining({ kind: "unsend_message", messageId: hello.id })]);

    const all = await act("people_action", { action: "unsend_message", names: ["Ana"], all: true }, "delete all my messages to Ana");
    expect(all.tool).toMatchObject({ shown: true, card: { kind: "batch", count: 2, of: "unsend_message" } });
    expect(all.reply.actions[0].items.map((i: { messageId: string }) => i.messageId)).toEqual([plant.id, hello.id]);

    expect((await act("people_action", { action: "unsend_message", names: ["Ana"], text: "banana" })).tool.reason).toBe(`You haven't sent Ana a message with "banana".`);
    expect(await prisma.directMessage.count({ where: { deletedAt: { not: null } } })).toBe(0);
  });

  it("accept / delete message requests: only people who sent the planter one", async () => {
    const me = await createUser({ name: "Juan" });
    const stranger = await createUser({ name: "Carla" });
    const friend = await createUser({ name: "Dina" });
    await befriend(me.id, friend.id);
    await say(stranger.id, me.id, "Hi, can we plant together?");
    await say(friend.id, me.id, "Hey");
    signInAs(me);

    const accept = await act("people_action", { action: "accept_message_request", names: ["Carla"] });
    expect(accept.reply.actions).toEqual([expect.objectContaining({ kind: "message_request", accept: true, userId: stranger.id })]);
    const del = await act("people_action", { action: "delete_message_request", group: "message_requests" }, "delete all message requests");
    expect(del.reply.actions).toEqual([expect.objectContaining({ kind: "message_request", accept: false, userId: stranger.id })]);
    expect((await act("people_action", { action: "accept_message_request", names: ["Dina"] })).tool.reason).toMatch(/Looked among your message requests/);
  });

  it("get_my_chats lists chats with unread counts and requests", async () => {
    const me = await createUser({ name: "Juan" });
    const stranger = await createUser({ name: "Carla" });
    await say(stranger.id, me.id, "Hi!");
    signInAs(me);
    const { tool } = await act("get_my_chats");
    expect(tool).toEqual({ chats: [expect.objectContaining({ user_id: stranger.id, name: "Carla", lastMessage: "Hi!", unread: 1, messageRequest: true })], total: 1 });
  });
});

describe("EcoBot — comments, logout, notifications", () => {
  it("delete_comment: the planter's comments on their photos, and theirs on the planter's", async () => {
    const me = await createUser({ name: "Juan" });
    const ana = await createUser({ name: "Ana" });
    const herPhoto = await approvedPhoto(ana.id);
    const myPhoto = await approvedPhoto(me.id);
    const mine = await prisma.photoComment.create({ data: { verificationId: herPhoto.id, authorId: me.id, body: "Beautiful narra!" } });
    const hers = await prisma.photoComment.create({ data: { verificationId: myPhoto.id, authorId: ana.id, body: "Nice spot" } });
    signInAs(me);

    const one = await act("people_action", { action: "delete_comment", names: ["Ana"], text: "narra" });
    expect(one.reply.actions).toEqual([expect.objectContaining({ kind: "delete_comment", commentId: mine.id, mine: true, body: "Beautiful narra!" })]);
    const all = await act("people_action", { action: "delete_comment", names: ["Ana"], all: true });
    expect(all.reply.actions[0].items).toEqual(
      expect.arrayContaining([expect.objectContaining({ commentId: mine.id, mine: true }), expect.objectContaining({ commentId: hers.id, mine: false })]),
    );
    expect(await prisma.photoComment.count()).toBe(2);
  });

  it("account_action logout makes a Log Out card", async () => {
    signInAs(await createUser());
    const { reply } = await act("account_action", { action: "logout" }, "log me out");
    expect(reply.actions).toEqual([{ kind: "logout" }]);
  });

  it("get_my_notifications returns the latest and the unread count", async () => {
    const me = await createUser();
    await prisma.notification.createMany({ data: [{ userId: me.id, message: "Proof approved", isRead: true }, { userId: me.id, message: "New friend request" }] });
    signInAs(me);
    const { tool } = await act("get_my_notifications");
    expect(tool.unread).toBe(1);
    expect(tool.latest.map((n: { message: string }) => n.message).sort()).toEqual(["New friend request", "Proof approved"]);
  });
});

describe("EcoBot — tree stats and leaderboard", () => {
  it("get_tree_stats: most planted first, planted in the home city, and trees not planted yet", async () => {
    const me = await createUser();
    const species = (slug: string, name: string, totalPlanted: number) =>
      prisma.treeSpecies.create({ data: { slug, name, scientificName: name, category: "National and Cultural Trees", description: "x", imageUrl: "/x.png", totalPlanted } });
    const narra = await species("narra", "Narra", 12);
    await species("molave", "Molave", 30);
    await species("kamagong", "Kamagong", 0);
    const v = await approvedPhoto(me.id);
    await prisma.plantedTree.create({ data: { userId: me.id, speciesId: narra.id, psgcCode: CODES.quezonCity, count: 5, verificationId: v.id } });
    signInAs(me);

    const { tool } = await act("get_tree_stats", {}, "what is the most planted tree?");
    expect(tool.trees.map((t: { name: string }) => t.name)).toEqual(["Molave", "Narra", "Kamagong"]);
    expect(tool.trees[1]).toMatchObject({ plantedNationwide: 12, plantedInYourCity: 5 });
    expect(tool).toMatchObject({ homeCity: "Quezon City", totalPlantedNationwide: 42, notPlantedYet: ["Kamagong"] });
  });

  it("get_leaderboard: this week's top planters and the planter's rank", async () => {
    const week = weekStart(new Date());
    const me = await createUser({ name: "Juan", weeklyPoints: 40, weeklyPointsWeekStart: week });
    await createUser({ name: "Ana", weeklyPoints: 90, weeklyPointsWeekStart: week });
    signInAs(me);
    const { tool } = await act("get_leaderboard", { scope: "local" });
    expect(tool).toMatchObject({ scope: "local", city: "Quezon City", rankedPlanters: 2, you: { rank: 2, weeklyPoints: 40 } });
    expect(tool.top).toEqual([expect.objectContaining({ rank: 1, name: "Ana" }), expect.objectContaining({ rank: 2, name: "Juan", you: true })]);
  });
});
