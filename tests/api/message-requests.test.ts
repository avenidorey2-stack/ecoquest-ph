import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as thread, POST as send } from "@/app/api/messages/[userId]/route";
import { DELETE as deleteRequest, POST as acceptRequest } from "@/app/api/messages/[userId]/request/route";
import { GET as inbox } from "@/app/api/messages/route";
import { GET as unread } from "@/app/api/messages/unread/route";
import { GET as chatMediaFile } from "@/app/api/chat-media/[key]/route";
import { POST as befriend } from "@/app/api/friends/[userId]/route";
import { pairKey } from "@/lib/friends";
import { queuePush } from "@/lib/push";
import { prisma } from "@/lib/prisma";
import { createUser, ctx, jpeg, jsonRequest, resetDb, signInAs } from "../helpers";

// Message requests (like Messenger): a first message from a planter who isn't a friend waits
// under the other person's Requests — files hidden, not in the unread badge — until they reply
// or accept. Deleting hides it until a newer message. Friends chat as before.

vi.mock("@/lib/push", async (original) => ({ ...(await original<typeof import("@/lib/push")>()), queuePush: vi.fn() }));

beforeEach(async () => {
  await resetDb();
  vi.mocked(queuePush).mockClear();
});

const req = () => new Request("http://test.local");
const say = (to: string, body: string) => send(jsonRequest({ body }), ctx({ userId: to }));
function sendPhoto(to: string) {
  const f = new FormData();
  f.set("body", "");
  f.set("file", jpeg(2048));
  return send(new Request("http://test.local", { method: "POST", body: f }), ctx({ userId: to }));
}
const rows = async () => (await (await inbox()).json()).conversations as { partner: { id: string }; request?: boolean; pending?: boolean; unread: number; preview: string }[];
const summary = async () => (await (await unread()).json()) as { unread: number; requests: number; latest: unknown };
const openThread = async (other: string) => (await thread(req(), ctx({ userId: other }))).json();
const requestedBy = async (a: string, b: string) => (await prisma.conversation.findUniqueOrThrow({ where: { pairKey: pairKey(a, b) } })).requestedById;

async function strangers() {
  const ana = await createUser({ name: "Ana" });
  const ben = await createUser({ name: "Ben" });
  return { ana, ben };
}

describe("message requests", () => {
  it("a first message to a non-friend waits under their Requests, out of the unread badge", async () => {
    const { ana, ben } = await strangers();
    signInAs(ana);
    expect((await say(ben.id, "Hi! Planting in Busay this Saturday?")).status).toBe(201);
    expect(await requestedBy(ana.id, ben.id)).toBe(ana.id);
    expect(await rows()).toEqual([expect.objectContaining({ partner: expect.objectContaining({ id: ben.id }), pending: true })]);
    // One quiet heads-up, without the stranger's words.
    expect(queuePush).toHaveBeenCalledWith(ben.id, expect.objectContaining({ title: "Ana", body: "Sent you a message request" }));
    vi.mocked(queuePush).mockClear();
    await say(ben.id, "Hello?");
    expect(queuePush).not.toHaveBeenCalled();

    signInAs(ben);
    expect(await rows()).toEqual([expect.objectContaining({ request: true, unread: 2, preview: "Hello?" })]);
    expect(await summary()).toMatchObject({ unread: 0, requests: 1, latest: null });
    const opened = await openThread(ana.id);
    expect(opened.partner).toMatchObject({ friends: false, request: "incoming", canSend: true });

    // The sender doesn't see "Seen" until it's accepted.
    signInAs(ana);
    const mine = await openThread(ben.id);
    expect(mine.partner.request).toBe("outgoing");
    expect(mine.seenAt).toBeNull();
  });

  it("keeps a request's photos hidden from the person it was sent to until they accept", async () => {
    const { ana, ben } = await strangers();
    signInAs(ana);
    const { message } = await (await sendPhoto(ben.id)).json();
    const key = message.media.url.split("/").pop();
    expect((await chatMediaFile(req(), ctx({ key }))).status).toBe(200);
    expect((await rows())[0].preview).toBe("You: Sent a photo");

    signInAs(ben);
    const opened = await openThread(ana.id);
    expect(opened.messages[0]).toMatchObject({ media: null, hiddenMedia: "photo" });
    expect((await chatMediaFile(req(), ctx({ key }))).status).toBe(404);

    expect((await acceptRequest(req(), ctx({ userId: ana.id }))).status).toBe(200);
    expect((await openThread(ana.id)).messages[0].media).toMatchObject({ type: "image/jpeg" });
    expect((await chatMediaFile(req(), ctx({ key }))).status).toBe(200);
  });

  it("replying accepts the request: it becomes a normal chat for both", async () => {
    const { ana, ben } = await strangers();
    signInAs(ana);
    await say(ben.id, "Hi!");
    signInAs(ben);
    expect((await say(ana.id, "Hello! Sure.")).status).toBe(201);
    expect(await requestedBy(ana.id, ben.id)).toBeNull();
    expect(await rows()).toEqual([expect.not.objectContaining({ request: true })]);
    expect(queuePush).toHaveBeenLastCalledWith(ana.id, expect.objectContaining({ body: "Hello! Sure." }));

    signInAs(ana);
    expect(await rows()).toEqual([expect.not.objectContaining({ pending: true })]);
    expect(await summary()).toMatchObject({ unread: 1, requests: 0 });
    expect((await openThread(ben.id)).partner.request).toBeNull();
  });

  it("only the person asked can accept or delete a request", async () => {
    const { ana, ben } = await strangers();
    signInAs(ana);
    await say(ben.id, "Hi!");
    expect((await acceptRequest(req(), ctx({ userId: ben.id }))).status).toBe(404);
    expect((await deleteRequest(req(), ctx({ userId: ben.id }))).status).toBe(404);
    expect(await requestedBy(ana.id, ben.id)).toBe(ana.id);
    signInAs(await createUser());
    expect((await acceptRequest(req(), ctx({ userId: ana.id }))).status).toBe(404);
  });

  it("deleting a request hides it until a newer message (the sender isn't told)", async () => {
    const { ana, ben } = await strangers();
    signInAs(ana);
    await say(ben.id, "Hi!");
    signInAs(ben);
    expect((await deleteRequest(req(), ctx({ userId: ana.id }))).status).toBe(200);
    expect(await rows()).toEqual([]);
    expect(await summary()).toMatchObject({ unread: 0, requests: 0 });

    signInAs(ana);
    expect(await rows()).toEqual([expect.objectContaining({ pending: true })]);
    await say(ben.id, "Are you there?");
    signInAs(ben);
    expect(await rows()).toEqual([expect.objectContaining({ request: true, unread: 1, preview: "Are you there?" })]);
    expect((await summary()).requests).toBe(1);
  });

  it("becoming friends turns the request into a chat", async () => {
    const { ana, ben } = await strangers();
    signInAs(ana);
    await say(ben.id, "Hi!");
    expect((await befriend(req(), ctx({ userId: ben.id }))).status).toBe(200);
    signInAs(ben);
    expect((await befriend(req(), ctx({ userId: ana.id }))).status).toBe(200); // accepts Ana's friend request
    expect(await requestedBy(ana.id, ben.id)).toBeNull();
    expect((await rows())[0].request).toBeUndefined();
    expect((await summary()).unread).toBe(1);
  });

  it("respects 'Message Requests' off: no new requests, but replies to their own request still work", async () => {
    const { ana, ben } = await strangers();
    await prisma.user.update({ where: { id: ben.id }, data: { allowMessageRequests: false } });
    signInAs(ana);
    expect((await say(ben.id, "Hi!")).status).toBe(403);
    expect((await openThread(ben.id)).partner.canSend).toBe(false);

    // Ben wrote to Ana first, then turned requests off: Ana can still reply (which accepts it).
    await prisma.user.update({ where: { id: ben.id }, data: { allowMessageRequests: true } });
    signInAs(ben);
    await say(ana.id, "Hi Ana!");
    await prisma.user.update({ where: { id: ben.id }, data: { allowMessageRequests: false } });
    signInAs(ana);
    expect((await say(ben.id, "Hello Ben!")).status).toBe(201);
    expect(await requestedBy(ana.id, ben.id)).toBeNull();
  });

  it("caps new requests per day, but not chats with friends or requests already started", async () => {
    const me = await createUser({ name: "Mo" });
    signInAs(me);
    const people = await prisma.user.createManyAndReturn({ data: Array.from({ length: 21 }, (_, i) => ({ name: `P${i}`, email: `p${i}@test.ph` })) });
    for (const p of people.slice(0, 20)) expect((await say(p.id, "hi")).status).toBe(201);
    const capped = await say(people[20].id, "hi");
    expect(capped.status).toBe(429);
    expect((await capped.json()).error).toMatch(/new chats today/);
    expect((await say(people[0].id, "one more")).status).toBe(201);
    const pal = await createUser({ name: "Pal" });
    await prisma.friendship.create({ data: { pairKey: pairKey(me.id, pal.id), requesterId: me.id, addresseeId: pal.id, status: "ACCEPTED", acceptedAt: new Date() } });
    expect((await say(pal.id, "hi friend")).status).toBe(201);
    expect(await requestedBy(me.id, pal.id)).toBeNull();
  });

  it("blocking ends a request for both", async () => {
    const { ana, ben } = await strangers();
    signInAs(ana);
    await say(ben.id, "Hi!");
    await prisma.block.create({ data: { blockerId: ben.id, blockedId: ana.id } });
    expect((await say(ben.id, "Hello?")).status).toBe(404);
    signInAs(ben);
    expect(await rows()).toEqual([]);
    expect((await summary()).requests).toBe(0);
    expect((await acceptRequest(req(), ctx({ userId: ana.id }))).status).toBe(404);
  });
});
