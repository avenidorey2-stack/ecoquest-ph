import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as thread, POST as send } from "@/app/api/messages/[userId]/route";
import { POST as startUpload } from "@/app/api/messages/[userId]/upload/route";
import { DELETE as unsend } from "@/app/api/messages/[userId]/[messageId]/route";
import { DELETE as unreact, PUT as react } from "@/app/api/messages/[userId]/[messageId]/reaction/route";
import { POST as presence } from "@/app/api/presence/route";
import { DELETE as unsubscribePush, POST as subscribePush } from "@/app/api/push/route";
import { GET as inbox } from "@/app/api/messages/route";
import { GET as unread } from "@/app/api/messages/unread/route";
import { GET as chatMediaFile } from "@/app/api/chat-media/[key]/route";
import { POST as reportMessage } from "@/app/api/support/[id]/messages/route";
import { DELETE as unsendReport } from "@/app/api/support/[id]/messages/[messageId]/route";
import { POST as startReportUpload } from "@/app/api/support/[id]/upload/route";
import { POST as block } from "@/app/api/blocks/[userId]/route";
import { POST as deleteAccount } from "@/app/api/settings/delete-account/route";
import { pairKey } from "@/lib/friends";
import { getTicket } from "@/lib/support";
import { chatMedia } from "@/lib/storage";
import { getPublicProfile } from "@/lib/public-profile";
import { prisma } from "@/lib/prisma";
import { createUser, ctx, jpeg, jsonRequest, resetDb, signInAs } from "../helpers";

beforeEach(resetDb);

const req = (url = "http://test.local") => new Request(url);

async function friends() {
  const a = await createUser({ name: "Ana" });
  const b = await createUser({ name: "Ben" });
  await prisma.friendship.create({ data: { pairKey: pairKey(a.id, b.id), requesterId: a.id, addresseeId: b.id, status: "ACCEPTED", acceptedAt: new Date() } });
  return { a, b };
}

function form(fields: Record<string, string | File>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return new Request("http://test.local", { method: "POST", body: f });
}

const say = (to: string, body: string) => send(jsonRequest({ body }), ctx({ userId: to }));
const keyOf = (url: string) => url.split("/").pop()!;

describe("messages between friends", () => {
  it("sends text, counts unread chats, and marks them read when opened", async () => {
    const { a, b } = await friends();
    signInAs(a);
    const res = await say(b.id, "  Hi Ben!  ");
    expect(res.status).toBe(201);
    expect((await res.json()).message).toMatchObject({ body: "Hi Ben!", mine: true, deleted: false, media: null });
    await say(b.id, "Planting on Saturday?");

    signInAs(b);
    const summary = await (await unread()).json();
    expect(summary.unread).toBe(1);
    expect(summary.latest).toMatchObject({ fromId: a.id, fromName: "Ana", preview: "Planting on Saturday?" });
    const list = (await (await inbox()).json()).conversations;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ partner: { id: a.id, name: "Ana" }, unread: 2, preview: "Planting on Saturday?" });

    const opened = await (await thread(req(), ctx({ userId: a.id }))).json();
    expect(opened.messages.map((m: { body: string; mine: boolean }) => [m.body, m.mine])).toEqual([
      ["Hi Ben!", false],
      ["Planting on Saturday?", false],
    ]);
    expect((await (await unread()).json()).unread).toBe(0);

    // Ana sees that Ben read it.
    signInAs(a);
    const mine = await (await thread(req(), ctx({ userId: b.id }))).json();
    expect(mine.seenAt).not.toBeNull();
  });

  it("only friends can message; blocked planters can't even open the chat", async () => {
    const { a, b } = await friends();
    const stranger = await createUser({ name: "Cy" });
    signInAs(a);
    expect((await say(stranger.id, "hello")).status).toBe(403);
    expect((await say(a.id, "me")).status).toBe(404);
    expect((await say(b.id, "   ")).status).toBe(400);
    expect((await say(b.id, "x".repeat(2001))).status).toBe(400);
    await say(b.id, "before the block");

    signInAs(b);
    expect((await block(req(), ctx({ userId: a.id }))).status).toBe(200);
    expect((await thread(req(), ctx({ userId: a.id }))).status).toBe(404);
    expect((await (await inbox()).json()).conversations).toEqual([]);
    expect((await (await unread()).json()).unread).toBe(0);
    signInAs(a);
    expect((await say(b.id, "still there?")).status).toBe(404);
  });

  it("keeps the history readable after unfriending, but sending stops", async () => {
    const { a, b } = await friends();
    signInAs(a);
    await say(b.id, "hi");
    await prisma.friendship.deleteMany();
    const data = await (await thread(req(), ctx({ userId: b.id }))).json();
    expect(data.partner.canSend).toBe(false);
    expect(data.messages).toHaveLength(1);
    expect((await say(b.id, "hi again")).status).toBe(403);
  });

  it("sends a photo that only the two of them can open", async () => {
    const { a, b } = await friends();
    signInAs(a);
    // Local disk: no signed upload, the file goes with the message.
    expect(await (await startUpload(jsonRequest({ type: "image/jpeg", size: 2048 }), ctx({ userId: b.id }))).json()).toEqual({ upload: null });
    expect((await startUpload(jsonRequest({ type: "application/pdf", size: 2048 }), ctx({ userId: b.id }))).status).toBe(400);

    const res = await send(form({ body: "", file: jpeg(2048) }), ctx({ userId: b.id }));
    expect(res.status).toBe(201);
    const { message } = await res.json();
    expect(message.media.type).toBe("image/jpeg");
    const key = keyOf(message.media.url);

    signInAs(b);
    const got = await chatMediaFile(req(), ctx({ key }));
    expect(got.status).toBe(200);
    expect(got.headers.get("content-type")).toBe("image/jpeg");
    expect((await chatMediaFile(new Request("http://test.local", { headers: { range: "bytes=0-99" } }), ctx({ key }))).status).toBe(206);
    expect((await (await inbox()).json()).conversations[0].preview).toBe("Sent a photo");

    signInAs(await createUser({ name: "Nosy" }));
    expect((await chatMediaFile(req(), ctx({ key }))).status).toBe(404);
  });

  it("rejects a forged upload token", async () => {
    vi.stubEnv("AUTH_SECRET", "test-secret");
    const { a, b } = await friends();
    signInAs(a);
    const res = await send(jsonRequest({ body: "", key: "0".repeat(8) + "-0000-0000-0000-" + "0".repeat(12) + ".jpg", token: "forged" }), ctx({ userId: b.id }));
    expect(res.status).toBe(400);
    vi.unstubAllEnvs();
  });

  it("lets only the sender unsend: text and file are wiped for both, unread drops", async () => {
    const { a, b } = await friends();
    signInAs(a);
    const { message } = await (await send(form({ body: "oops", file: jpeg() }), ctx({ userId: b.id }))).json();
    const key = keyOf(message.media.url);
    expect(await chatMedia.read(key)).not.toBeNull();

    signInAs(b);
    expect((await unsend(req(), ctx({ userId: a.id, messageId: message.id }))).status).toBe(404);

    signInAs(a);
    expect((await unsend(req(), ctx({ userId: b.id, messageId: message.id }))).status).toBe(200);
    expect(await chatMedia.read(key)).toBeNull();
    const row = await prisma.directMessage.findUniqueOrThrow({ where: { id: message.id } });
    expect(row).toMatchObject({ body: "", mediaKey: null });
    expect(row.deletedAt).not.toBeNull();

    signInAs(b);
    expect((await (await unread()).json()).unread).toBe(0);
    const data = await (await thread(req(), ctx({ userId: a.id }))).json();
    expect(data.messages[0]).toMatchObject({ deleted: true, body: "", media: null });
  });

  it("pages older messages", async () => {
    const { a, b } = await friends();
    const convo = await prisma.conversation.create({
      data: { pairKey: pairKey(a.id, b.id), members: { create: [{ userId: a.id }, { userId: b.id }] } },
    });
    await prisma.directMessage.createMany({
      data: Array.from({ length: 55 }, (_, i) => ({ conversationId: convo.id, senderId: a.id, body: `m${i}`, createdAt: new Date(Date.UTC(2026, 9, 1, 0, i)) })),
    });
    signInAs(b);
    const first = await (await thread(req(), ctx({ userId: a.id }))).json();
    expect(first.messages).toHaveLength(50);
    expect(first.messages[0].body).toBe("m5");
    expect(first.hasMore).toBe(true);
    const older = await (await thread(req(`http://test.local?before=${first.messages[0].id}`), ctx({ userId: a.id }))).json();
    expect(older.messages.map((m: { body: string }) => m.body)).toEqual(["m0", "m1", "m2", "m3", "m4"]);
    expect(older.hasMore).toBe(false);
  });
});

describe("replies and reactions", () => {
  const reactTo = (to: string, messageId: string, emoji: string) => react(jsonRequest({ emoji }, "PUT"), ctx({ userId: to, messageId }));

  it("replies quote the earlier message, only within the same chat", async () => {
    const { a, b } = await friends();
    const c = await createUser({ name: "Cy" });
    await prisma.friendship.create({ data: { pairKey: pairKey(a.id, c.id), requesterId: a.id, addresseeId: c.id, status: "ACCEPTED" } });
    signInAs(a);
    const first = (await (await say(b.id, "Plant at 7?")).json()).message;
    const other = (await (await say(c.id, "Hi Cy")).json()).message;

    signInAs(b);
    const res = await send(jsonRequest({ body: "Yes!", replyTo: first.id }), ctx({ userId: a.id }));
    expect(res.status).toBe(201);
    expect((await res.json()).message.replyTo).toMatchObject({ id: first.id, mine: false, preview: "Plant at 7?", deleted: false });
    // A message from another chat can't be quoted.
    expect((await send(jsonRequest({ body: "?", replyTo: other.id }), ctx({ userId: a.id }))).status).toBe(404);

    signInAs(a);
    const t = await (await thread(req(), ctx({ userId: b.id }))).json();
    expect(t.messages.at(-1).replyTo).toMatchObject({ id: first.id, mine: true, preview: "Plant at 7?" });
    // Unsending the original leaves "Message unsent" in the quote.
    await unsend(req(), ctx({ userId: b.id, messageId: first.id }));
    const after = await (await thread(req(), ctx({ userId: b.id }))).json();
    expect(after.messages.at(-1).replyTo).toMatchObject({ deleted: true, preview: "Message unsent", media: null });
  });

  it("one reaction per person per message: change it, remove it; photos too; friends only", async () => {
    const { a, b } = await friends();
    signInAs(a);
    const photoMsg = (await (await send(form({ body: "", file: jpeg() }), ctx({ userId: b.id }))).json()).message;

    signInAs(b);
    expect((await (await reactTo(a.id, photoMsg.id, "❤️")).json()).reactions).toEqual([{ emoji: "❤️", mine: true }]);
    expect((await (await reactTo(a.id, photoMsg.id, "😆")).json()).reactions).toEqual([{ emoji: "😆", mine: true }]);
    expect((await reactTo(a.id, photoMsg.id, "🍕")).status).toBe(400);
    // The "+" list (lib/reactions) works too.
    expect((await (await reactTo(a.id, photoMsg.id, "🌱")).json()).reactions).toEqual([{ emoji: "🌱", mine: true }]);
    await reactTo(a.id, photoMsg.id, "😆");

    signInAs(a);
    await reactTo(b.id, photoMsg.id, "👍");
    const t = await (await thread(req(), ctx({ userId: b.id }))).json();
    expect(t.messages[0].reactions).toEqual([
      { emoji: "😆", mine: false },
      { emoji: "👍", mine: true },
    ]);
    const removed = await (await unreact(req(), ctx({ userId: b.id, messageId: photoMsg.id }))).json();
    expect(removed.reactions).toEqual([{ emoji: "😆", mine: false }]);

    // Unfriended: no more reacting. Unsent messages lose their reactions.
    await prisma.friendship.deleteMany();
    signInAs(b);
    expect((await reactTo(a.id, photoMsg.id, "❤️")).status).toBe(403);
    await prisma.friendship.create({ data: { pairKey: pairKey(a.id, b.id), requesterId: a.id, addresseeId: b.id, status: "ACCEPTED" } });
    signInAs(a);
    await unsend(req(), ctx({ userId: b.id, messageId: photoMsg.id }));
    expect(await prisma.messageReaction.count()).toBe(0);
    signInAs(b);
    expect((await reactTo(a.id, photoMsg.id, "❤️")).status).toBe(404);
  });

  it("can't react to a message in someone else's chat", async () => {
    const { a, b } = await friends();
    const c = await createUser();
    await prisma.friendship.create({ data: { pairKey: pairKey(c.id, b.id), requesterId: c.id, addresseeId: b.id, status: "ACCEPTED" } });
    signInAs(a);
    const msg = (await (await say(b.id, "private")).json()).message;
    signInAs(c);
    expect((await reactTo(b.id, msg.id, "❤️")).status).toBe(404);
  });
});

describe("phone notifications", () => {
  const sub = (endpoint: string) => ({ endpoint, keys: { p256dh: "BNcR".padEnd(87, "x"), auth: "tBHI".padEnd(22, "y") } });

  it("saves this device's subscription, moves it to whoever signs in there, and forgets it", async () => {
    const { a, b } = await friends();
    signInAs(a);
    expect((await subscribePush(jsonRequest(sub("https://push.example.com/abc")))).status).toBe(201);
    expect((await subscribePush(jsonRequest(sub("http://insecure.example.com/x")))).status).toBe(400);
    expect((await subscribePush(jsonRequest({ endpoint: "https://push.example.com/y" }))).status).toBe(400);
    signInAs(b);
    await subscribePush(jsonRequest(sub("https://push.example.com/abc")));
    expect(await prisma.pushSubscription.findMany({ select: { userId: true } })).toEqual([{ userId: b.id }]);
    // Someone else can't remove it.
    signInAs(a);
    await unsubscribePush(jsonRequest({ endpoint: "https://push.example.com/abc" }, "DELETE"));
    expect(await prisma.pushSubscription.count()).toBe(1);
    signInAs(b);
    await unsubscribePush(jsonRequest({ endpoint: "https://push.example.com/abc" }, "DELETE"));
    expect(await prisma.pushSubscription.count()).toBe(0);
  });
});

describe("active status", () => {
  it("shows Active Now while open, and counts up the moment they leave", async () => {
    const { a, b } = await friends();
    signInAs(b);
    await unread(); // the app's check-in
    signInAs(a);
    let partner = (await (await thread(req(), ctx({ userId: b.id }))).json()).partner;
    expect(partner.online).toBe(true);

    signInAs(b);
    expect((await presence(jsonRequest({ state: "away" }))).status).toBe(204);
    signInAs(a);
    partner = (await (await thread(req(), ctx({ userId: b.id }))).json()).partner;
    expect(partner.online).toBe(false);
    expect(partner.activeAt).not.toBeNull();

    // Back again: online right away, even within the check-in throttle.
    signInAs(b);
    await presence(jsonRequest({ state: "active" }));
    signInAs(a);
    expect((await (await thread(req(), ctx({ userId: b.id }))).json()).partner.online).toBe(true);
    signInAs(b);
    expect((await presence(jsonRequest({ state: "bogus" }))).status).toBe(400);
  });

  it("is recorded while the app is open and shown to friends only, unless turned off", async () => {
    const { a, b } = await friends();
    const stranger = await createUser();
    signInAs(b);
    await unread(); // the header's check-in
    expect((await prisma.user.findUniqueOrThrow({ where: { id: b.id } })).lastActiveAt).not.toBeNull();

    signInAs(a);
    expect((await (await thread(req(), ctx({ userId: b.id }))).json()).partner.activeAt).not.toBeNull();
    expect((await getPublicProfile(b.id, a.id))?.activeAt).not.toBeNull();
    expect((await getPublicProfile(b.id, stranger.id))?.activeAt).toBeNull();

    await prisma.user.update({ where: { id: b.id }, data: { showActiveStatus: false } });
    expect((await (await thread(req(), ctx({ userId: b.id }))).json()).partner.activeAt).toBeNull();
  });
});

describe("problem report attachments", () => {
  async function report() {
    const user = await createUser({ name: "Rey" });
    const admin = await createUser({ role: "ADMIN", name: "Team Mate" });
    const ticket = await prisma.supportTicket.create({ data: { userId: user.id, subject: "Map won't load", messages: { create: { authorId: user.id, body: "Help" } } } });
    return { user, admin, ticket };
  }

  it("lets the reporter send a screenshot the team can open, and unsend it", async () => {
    const { user, admin, ticket } = await report();
    signInAs(user);
    expect(await (await startReportUpload(jsonRequest({ type: "image/png", size: 4096 }), ctx({ id: ticket.id }))).json()).toEqual({ upload: null });
    const png = new File([new Uint8Array(4096)], "shot.png", { type: "image/png" });
    expect((await reportMessage(form({ body: "Here", file: png }), ctx({ id: ticket.id }))).status).toBe(201);
    const view = await getTicket(ticket.id, { id: user.id, role: "USER" });
    const sent = view!.messages.at(-1)!;
    expect(sent).toMatchObject({ body: "Here", own: true, deleted: false });
    const key = keyOf(sent.media!.url);

    signInAs(admin);
    expect((await chatMediaFile(req(), ctx({ key }))).status).toBe(200);
    // The team can't unsend the planter's message.
    expect((await unsendReport(req(), ctx({ id: ticket.id, messageId: sent.id }))).status).toBe(404);

    signInAs(await createUser());
    expect((await chatMediaFile(req(), ctx({ key }))).status).toBe(404);
    expect((await reportMessage(form({ body: "hi" }), ctx({ id: ticket.id }))).status).toBe(404);

    signInAs(user);
    expect((await unsendReport(req(), ctx({ id: ticket.id, messageId: sent.id }))).status).toBe(200);
    expect(await chatMedia.read(key)).toBeNull();
    expect((await getTicket(ticket.id, { id: user.id, role: "USER" }))!.messages.at(-1)).toMatchObject({ deleted: true, body: "", media: null });
  });

  it("still accepts plain JSON text replies", async () => {
    const { user, ticket } = await report();
    signInAs(user);
    expect((await reportMessage(jsonRequest({ body: "Any news?" }), ctx({ id: ticket.id }))).status).toBe(201);
    expect((await reportMessage(jsonRequest({ body: "" }), ctx({ id: ticket.id }))).status).toBe(400);
  });
});

describe("deleting an account", () => {
  it("removes their chats and the files in them", async () => {
    const { a, b } = await friends();
    signInAs(b);
    const { message } = await (await send(form({ body: "pic", file: jpeg() }), ctx({ userId: a.id }))).json();
    const key = keyOf(message.media.url);

    signInAs(a);
    await say(b.id, "nice");
    expect((await deleteAccount(jsonRequest({ confirm: "DELETE" }))).status).toBe(200);
    expect(await prisma.conversation.count()).toBe(0);
    expect(await prisma.directMessage.count()).toBe(0);
    expect(await chatMedia.read(key)).toBeNull();
  });
});
