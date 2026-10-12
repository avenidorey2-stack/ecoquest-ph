import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/assistant/route";
import { prisma } from "@/lib/prisma";
import { pairKey } from "@/lib/friends";
import { CODES, createSlot, createUser, jsonRequest, resetDb, signInAs } from "../helpers";

// EcoBot's action tools: each only builds cards from the planter's own records — nothing changes
// until the planter allows it on the card (which calls the normal routes, tested elsewhere).
// Groq is faked: each test scripts one tool call, then a short reply.

const create = vi.fn();
const fetchMock = vi.fn(async (_url: string, init: RequestInit) => Response.json(await create(JSON.parse(init.body as string))));
const textReply = (text: string) => ({ choices: [{ finish_reason: "stop", message: { role: "assistant", content: text } }] });
const toolReply = (name: string, args: object) => ({
  choices: [{ finish_reason: "tool_calls", message: { role: "assistant", content: null, tool_calls: [{ id: "t1", type: "function", function: { name, arguments: JSON.stringify(args) } }] } }],
});

/** Asks with the model scripted to call `name` with `args`; returns the reply and what the tool told the model. */
async function act(name: string, args: object, question = "please do it") {
  create.mockReset();
  create.mockResolvedValueOnce(toolReply(name, args)).mockResolvedValueOnce(textReply("Tap the card below."));
  const res = await POST(jsonRequest({ messages: [{ role: "user", text: question }] }));
  const body = await res.json();
  return { reply: body.reply, tool: JSON.parse(create.mock.calls[1][0].messages.at(-1).content) };
}

const friends = (a: string, b: string) => prisma.friendship.create({ data: { pairKey: pairKey(a, b), requesterId: a, addresseeId: b, status: "ACCEPTED", acceptedAt: new Date() } });
const request = (from: string, to: string) => prisma.friendship.create({ data: { pairKey: pairKey(from, to), requesterId: from, addresseeId: to } });
async function approvedPhoto(userId: string) {
  const quest = await prisma.quest.create({ data: { userId, slotId: (await createSlot()).id } });
  return prisma.verification.create({ data: { questId: quest.id, mediaUrl: "/api/media/p.jpg", mediaType: "image/jpeg", plantCount: 1, status: "APPROVED", reviewedAt: new Date() } });
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

describe("EcoBot — bulk claims and redemptions", () => {
  it("claim_slot all=true puts every claimable slot in one card, and claims nothing", async () => {
    const me = await createUser();
    signInAs(me);
    const narra = await createSlot({ requiredPlantType: "Narra", pointsPerPlant: 30 });
    const ipil = await createSlot({ requiredPlantType: "Ipil", pointsPerPlant: 20 });
    const mine = await createSlot({ requiredPlantType: "Molave" });
    await prisma.quest.create({ data: { userId: me.id, slotId: mine.id, expiresAt: new Date(Date.now() + 86_400_000) } });
    await createSlot({ requiredPlantType: "Banaba", status: "FULL" });
    await createSlot({ requiredPlantType: "Kamagong", city: "City of Makati", cityCode: CODES.makati });

    const { reply, tool } = await act("claim_slot", { all: true }, "claim all available slots");
    expect(reply.actions).toHaveLength(1);
    expect(reply.actions[0].kind).toBe("batch");
    expect(reply.actions[0].items.map((i: { slotId: string }) => i.slotId)).toEqual([narra.id, ipil.id]);
    // The model gets a short summary, not the whole card.
    expect(tool).toMatchObject({ shown: true, card: { kind: "batch", count: 2, of: "claim_slot", items: ["Narra", "Ipil"] } });
    expect(await prisma.quest.count()).toBe(1);
  });

  it("a single slot stays a normal card, and named slots that can't be claimed are reported", async () => {
    const me = await createUser();
    signInAs(me);
    const narra = await createSlot({ requiredPlantType: "Narra" });
    const mine = await createSlot({ requiredPlantType: "Molave", barangay: "Lahug" });
    await prisma.quest.create({ data: { userId: me.id, slotId: mine.id, expiresAt: new Date(Date.now() + 86_400_000) } });
    const { reply, tool } = await act("claim_slot", { slot_ids: [narra.id, mine.id] });
    expect(reply.actions).toEqual([expect.objectContaining({ kind: "claim_slot", slotId: narra.id })]);
    expect(tool.left_out).toEqual(["Molave (Lahug): you already claimed it."]);
  });

  it("claim_slot all=true with nothing open says so", async () => {
    signInAs(await createUser());
    const { reply, tool } = await act("claim_slot", { all: true });
    expect(tool).toEqual({ shown: false, reason: "No open slots you can claim in Quezon City, Metro Manila right now." });
    expect(reply.actions).toBeUndefined();
  });

  it("redeem_reward keeps a running balance across several rewards", async () => {
    const me = await createUser({ points: 1200 });
    signInAs(me);
    const grab = await prisma.reward.create({ data: { rewardType: "VOUCHER", brand: "Grab", costPoints: 500, valuePesos: 50 } });
    const { reply, tool } = await act("redeem_reward", { reward_ids: [grab.id, grab.id, grab.id] }, "redeem grab 50 three times");
    expect(reply.actions[0]).toMatchObject({ kind: "batch", items: [{ rewardId: grab.id }, { rewardId: grab.id }] });
    expect(tool.left_out).toEqual(["Grab ₱50: you need 300 more pts."]);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: me.id } })).points).toBe(1200);
  });
});

describe("EcoBot — people", () => {
  it("messages a friend by name with their exact words", async () => {
    const me = await createUser({ name: "Juan" });
    const demana = await createUser({ name: "Demana Reyes", city: "City of Cebu" });
    await friends(me.id, demana.id);
    signInAs(me);
    const { reply } = await act("people_action", { action: "message", names: ["demana"], text: "boss, kamusta, nag lulu paka?" });
    expect(reply.actions).toEqual([
      { kind: "send_message", text: "boss, kamusta, nag lulu paka?", userId: demana.id, name: "Demana Reyes", image: null, city: "City of Cebu" },
    ]);
    expect(await prisma.directMessage.count()).toBe(0);
  });

  it("messages a non-friend as a message request, unless they only take messages from friends", async () => {
    const me = await createUser();
    const ana = await createUser({ name: "Ana Cruz" });
    await request(me.id, ana.id);
    signInAs(me);
    const { reply } = await act("people_action", { action: "message", names: ["Ana"], text: "hi" });
    expect(reply.actions).toEqual([expect.objectContaining({ kind: "send_message", userId: ana.id, text: "hi", request: true })]);

    await prisma.user.update({ where: { id: ana.id }, data: { allowMessageRequests: false } });
    const closed = await act("people_action", { action: "message", names: ["Ana"], text: "hi" });
    expect(closed.tool.reason).toBe("Ana Cruz only gets messages from friends. Add them as a friend to chat.");
    expect(closed.reply.actions).toBeUndefined();
    expect(closed.reply.links).toEqual([{ label: "Open Profile", href: `/planters/${ana.id}` }]);
    expect(await prisma.directMessage.count()).toBe(0);
  });

  it("asks which one when a name fits several planters, then takes a user_id", async () => {
    const me = await createUser();
    const a = await createUser({ name: "Ana Cruz" });
    const b = await createUser({ name: "Ana Reyes", city: "City of Makati", cityCode: CODES.makati });
    signInAs(me);
    const { tool } = await act("people_action", { action: "add_friend", names: ["Ana"] });
    expect(tool.shown).toBe(false);
    expect(tool.choices).toEqual(
      expect.arrayContaining([expect.objectContaining({ user_id: a.id, name: "Ana Cruz" }), expect.objectContaining({ user_id: b.id, city: "City of Makati" })]),
    );
    const { reply } = await act("people_action", { action: "add_friend", user_ids: [b.id] });
    expect(reply.actions).toEqual([expect.objectContaining({ kind: "add_friend", accept: false, userId: b.id })]);
  });

  it("messages all friends at once in one card (and only friends)", async () => {
    const me = await createUser();
    const pals = await Promise.all(["Ben", "Carla", "Dino"].map((name) => createUser({ name })));
    for (const p of pals) await friends(me.id, p.id);
    const stranger = await createUser({ name: "Eve" });
    await request(stranger.id, me.id);
    signInAs(me);
    const { reply, tool } = await act("people_action", { action: "message", group: "friends", text: "Planting on Saturday!" });
    expect(reply.actions[0].kind).toBe("batch");
    expect(reply.actions[0].items.map((i: { name: string }) => i.name).sort()).toEqual(["Ben", "Carla", "Dino"]);
    expect(reply.actions[0].items.every((i: { text: string }) => i.text === "Planting on Saturday!")).toBe(true);
    expect(tool.card).toMatchObject({ count: 3, of: "send_message" });
  });

  it("caps a group message at 30 friends (the per-minute sending limit)", async () => {
    const me = await createUser();
    const many = await prisma.user.createManyAndReturn({ data: Array.from({ length: 32 }, (_, i) => ({ name: `Pal ${i}`, email: `pal${i}@test.ph` })) });
    for (const p of many) await friends(me.id, p.id);
    signInAs(me);
    const { reply, tool } = await act("people_action", { action: "message", group: "friends", text: "hi" });
    expect(reply.actions[0].items).toHaveLength(30);
    expect(tool.left_out).toEqual(["2 more left out: at most 30 at a time. Ask again after these."]);
  });

  it("accepts all friend requests at once", async () => {
    const me = await createUser();
    const a = await createUser({ name: "Ana" });
    const b = await createUser({ name: "Ben" });
    await request(a.id, me.id);
    await request(b.id, me.id);
    signInAs(me);
    const { reply } = await act("people_action", { action: "add_friend", group: "requests_to_me" });
    expect(reply.actions[0].items).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "add_friend", accept: true, userId: a.id }), expect.objectContaining({ userId: b.id })]));
  });

  it("remove_friend only works on friends and requests; unblock only on people they blocked", async () => {
    const me = await createUser();
    const pal = await createUser({ name: "Ben" });
    const other = await createUser({ name: "Benny" });
    await friends(me.id, pal.id);
    signInAs(me);
    const { reply } = await act("people_action", { action: "remove_friend", names: ["Ben"] });
    expect(reply.actions).toEqual([expect.objectContaining({ kind: "remove_friend", state: "FRIENDS", userId: pal.id })]);

    await prisma.block.create({ data: { blockerId: other.id, blockedId: me.id } });
    const { tool } = await act("people_action", { action: "unblock", names: ["Benny"] });
    expect(tool.shown).toBe(false);
    await prisma.block.create({ data: { blockerId: me.id, blockedId: pal.id } });
    const unblock = await act("people_action", { action: "unblock", names: ["Ben"] });
    expect(unblock.reply.actions).toEqual([expect.objectContaining({ kind: "block_user", block: false, userId: pal.id })]);
  });

  it("can't reach a planter who blocked them, even by id", async () => {
    const me = await createUser();
    const blocker = await createUser({ name: "Gil" });
    await prisma.block.create({ data: { blockerId: blocker.id, blockedId: me.id } });
    signInAs(me);
    for (const action of ["add_friend", "message", "report", "like_photo"]) {
      const { reply, tool } = await act("people_action", { action, user_ids: [blocker.id], text: "x" });
      expect(tool.shown).toBe(false);
      expect(reply.actions).toBeUndefined();
    }
  });

  it("reports one planter at a time, with the reason prefilled", async () => {
    const me = await createUser();
    const spam = await createUser({ name: "Spammy" });
    await createUser({ name: "Other" });
    signInAs(me);
    const one = await act("people_action", { action: "report", names: ["Spammy"], reason: "SPAM", text: "Sends scam links" });
    expect(one.reply.actions).toEqual([expect.objectContaining({ kind: "report_user", userId: spam.id, reason: "SPAM", details: "Sends scam links" })]);
    expect(one.reply.actions[0].reasons).toContainEqual({ value: "SPAM", label: "Spam or scam" });
    const two = await act("people_action", { action: "report", names: ["Spammy", "Other"] });
    expect(two.tool.reason).toMatch(/one planter at a time/);
    expect(await prisma.userReport.count()).toBe(0);
  });

  it("likes and comments on a planter's latest photo they can see, respecting privacy and comment settings", async () => {
    const me = await createUser();
    const ana = await createUser({ name: "Ana" });
    signInAs(me);
    expect((await act("people_action", { action: "like_photo", names: ["Ana"] })).tool.reason).toBe("Ana has no planting photos you can see.");
    const photo = await approvedPhoto(ana.id);
    const like = await act("people_action", { action: "like_photo", names: ["Ana"] });
    expect(like.reply.actions).toEqual([expect.objectContaining({ kind: "like_photo", liked: true, photoId: photo.id, mediaUrl: "/api/media/p.jpg", isVideo: false })]);
    expect(await prisma.photoLike.count()).toBe(0);

    await prisma.user.update({ where: { id: ana.id }, data: { allowComments: false } });
    expect((await act("people_action", { action: "comment_photo", names: ["Ana"], text: "Nice!" })).tool.reason).toBe("Ana has turned off comments on their photos.");
    await prisma.user.update({ where: { id: ana.id }, data: { photoVisibility: "ONLY_ME" } });
    expect((await act("people_action", { action: "like_photo", names: ["Ana"] })).tool.reason).toBe("Ana has no planting photos you can see.");
  });
});

describe("EcoBot — shop and account", () => {
  it("order_seedlings pre-fills the order form, last address included", async () => {
    const me = await createUser({ name: "Juan", points: 900 });
    signInAs(me);
    const narra = await prisma.treeSpecies.create({ data: { slug: "narra", name: "Narra", scientificName: "Pterocarpus indicus", category: "National and Cultural Trees", description: "x", imageUrl: "/x.png" } });
    const product = await prisma.seedlingProduct.create({ data: { speciesId: narra.id, priceInPoints: 60, priceInPesos: 45, stockQuantity: 8 } });
    const { reply } = await act("order_seedlings", { tree: "narra", quantity: 20, pay: "PESOS" }, "order 20 narra, cash on delivery");
    expect(reply.actions).toEqual([
      expect.objectContaining({
        kind: "order_seedlings",
        product: { id: product.id, name: "Narra", priceInPoints: 60, priceInPesos: 45, stockQuantity: 8 },
        balance: 900,
        quantity: 8, // only 8 in stock
        currency: "PESOS",
        deliveryDefaults: { recipientName: "Juan", cityProvince: "Quezon City, Metro Manila" },
      }),
    ]);
    await prisma.seedlingProduct.update({ where: { id: product.id }, data: { stockQuantity: 0 } });
    expect((await act("order_seedlings", { tree: "Narra" })).tool.reason).toBe("Narra is sold out right now.");
    expect(await prisma.order.count()).toBe(0);
  });

  it("order_seedlings finds a tree whose name was misheard (voice: \"Red Lawn\")", async () => {
    signInAs(await createUser({ name: "Juan", points: 900 }));
    const species = await prisma.treeSpecies.create({ data: { slug: "red-lauan", name: "Red Lauan", scientificName: "Shorea negrosensis", category: "Philippine Mahogany and Timber Groups", description: "x", imageUrl: "/x.png" } });
    const product = await prisma.seedlingProduct.create({ data: { speciesId: species.id, priceInPoints: 50, priceInPesos: 35, stockQuantity: 20 } });
    for (const tree of ["Red Lawn", "red lawan"]) {
      const { reply } = await act("order_seedlings", { tree, quantity: 2 }, `order 2 ${tree}`);
      expect(reply.actions).toEqual([expect.objectContaining({ kind: "order_seedlings", product: expect.objectContaining({ id: product.id, name: "Red Lauan" }) })]);
    }
  });

  it("change_name and change_city build cards; ambiguous cities ask which", async () => {
    const me = await createUser({ name: "Juan" });
    signInAs(me);
    expect((await act("account_action", { action: "change_name", value: "Juan dela Cruz" })).reply.actions).toEqual([{ kind: "change_name", current: "Juan", name: "Juan dela Cruz" }]);
    const city = await act("account_action", { action: "change_city", value: "Makati" });
    expect(city.reply.actions).toEqual([{ kind: "change_city", cityCode: CODES.makati, city: "City of Makati", province: "Metro Manila", current: "Quezon City, Metro Manila" }]);
    const ambiguous = await act("account_action", { action: "change_city", value: "San Jose" });
    expect(ambiguous.tool.shown).toBe(false);
    expect(ambiguous.tool.choices).toEqual(expect.arrayContaining([expect.objectContaining({ city_code: CODES.sanJoseBatangas }), expect.objectContaining({ city_code: CODES.sanJoseTarlac })]));
    const picked = await act("account_action", { action: "change_city", city_code: CODES.sanJoseTarlac });
    expect(picked.reply.actions[0]).toMatchObject({ kind: "change_city", cityCode: CODES.sanJoseTarlac });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: me.id } })).name).toBe("Juan");
  });

  it("settings lists only real changes and refuses fields it can't change", async () => {
    signInAs(await createUser({ notifyLikes: true }));
    const { reply } = await act("account_action", { action: "settings", settings: { photoVisibility: "FRIENDS", notifyLikes: true, showActiveStatus: false } });
    expect(reply.actions).toEqual([
      {
        kind: "update_settings",
        changes: [
          { field: "photoVisibility", value: "FRIENDS", label: "Who can see your planting photos: Friends Only" },
          { field: "showActiveStatus", value: false, label: "Show When You're Active: Off" },
        ],
      },
    ]);
    expect((await act("account_action", { action: "settings", settings: { role: "ADMIN" } })).tool.reason).toMatch(/can't change "role"/);
    expect((await act("account_action", { action: "settings", settings: { passwordHash: "x" } })).tool.shown).toBe(false);
  });

  it("invite codes, problem reports, profile photo and notifications", async () => {
    const me = await createUser();
    const friend = await createUser({ name: "Lito" });
    signInAs(me);
    expect((await act("account_action", { action: "invite_code", value: friend.referralCode })).reply.actions).toEqual([{ kind: "invite_code", code: friend.referralCode, referrerName: "Lito" }]);
    expect((await act("account_action", { action: "invite_code", value: me.referralCode })).tool.reason).toBe("That's your own invite code.");
    expect((await act("account_action", { action: "invite_code", value: "nope" })).tool.shown).toBe(false);

    const report = await act("account_action", { action: "report_problem", text: "The map won't load. It stays blank." });
    expect(report.reply.actions).toEqual([{ kind: "report_problem", subject: "The map won't load", message: "The map won't load. It stays blank." }]);

    expect((await act("account_action", { action: "set_photo" })).reply.actions).toEqual([{ kind: "profile_photo", remove: false, current: null }]);
    expect((await act("account_action", { action: "remove_photo" })).tool.reason).toBe("You haven't uploaded a profile picture.");

    expect((await act("account_action", { action: "read_notifications" })).tool.reason).toBe("You have no unread notifications.");
    await prisma.notification.create({ data: { userId: me.id, message: "hi" } });
    expect((await act("account_action", { action: "read_notifications" })).reply.actions).toEqual([{ kind: "read_notifications", unread: 1 }]);
    expect(await prisma.supportTicket.count()).toBe(0);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: me.id } })).referredByUserId).toBeNull();
  });

  it("lookups: friends and account (with invite link)", async () => {
    const me = await createUser({ name: "Juan" });
    const pal = await createUser({ name: "Ben", city: "City of Cebu" });
    await friends(me.id, pal.id);
    signInAs(me);
    create.mockReset();
    create.mockResolvedValueOnce(toolReply("get_my_friends", {})).mockResolvedValueOnce(toolReply("get_my_account", {})).mockResolvedValueOnce(textReply("ok"));
    await POST(jsonRequest({ messages: [{ role: "user", text: "who are my friends and what's my invite link?" }] }));
    const friendsResult = JSON.parse(create.mock.calls[1][0].messages.at(-1).content);
    expect(friendsResult).toEqual({ friends: [{ user_id: pal.id, name: "Ben", city: "City of Cebu" }], requestsToYou: [], requestsYouSent: [], blockedCount: 0 });
    const account = JSON.parse(create.mock.calls[2][0].messages.at(-1).content);
    expect(account).toMatchObject({ name: "Juan", homeCity: "Quezon City, Metro Manila", invite: { code: me.referralCode, link: expect.stringContaining(`/r/${me.referralCode}`) } });
    expect(account).not.toHaveProperty("passwordHash");
  });

  it("the prompt keeps passwords out of the chat and treats in-app actions as in scope", async () => {
    signInAs(await createUser());
    create.mockReset();
    create.mockResolvedValueOnce(textReply("ok"));
    await POST(jsonRequest({ messages: [{ role: "user", text: "hi" }] }));
    const { messages, tools } = create.mock.calls[0][0];
    expect(messages[0].content).toMatch(/never ask for a password/);
    expect(messages[0].content).toMatch(/Requests to DO something in the app \(e\.g\. message a friend, claim slots\) are in scope/);
    expect(tools.map((t: { function: { name: string } }) => t.function.name)).toEqual(
      expect.arrayContaining(["people_action", "account_action", "order_seedlings", "get_my_friends", "get_my_account"]),
    );
  });
});
