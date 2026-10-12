import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE as deleteChat, GET as thread, POST as send } from "@/app/api/messages/[userId]/route";
import { GET as inbox } from "@/app/api/messages/route";
import { GET as unread } from "@/app/api/messages/unread/route";
import { pairKey } from "@/lib/friends";
import { prisma } from "@/lib/prisma";
import { createUser, ctx, jsonRequest, resetDb, signInAs } from "../helpers";

// Deleting a chat (like Messenger's "Delete chat"): it leaves the planter's list and its messages
// are cleared for them only. The other person keeps theirs and isn't told. A newer message brings
// the chat back, starting from that message.

vi.mock("@/lib/push", async (original) => ({ ...(await original<typeof import("@/lib/push")>()), queuePush: vi.fn() }));

beforeEach(resetDb);

const req = (method = "GET") => new Request("http://test.local", { method });
const say = (to: string, body: string) => send(jsonRequest({ body }), ctx({ userId: to }));
const remove = (other: string) => deleteChat(req("DELETE"), ctx({ userId: other }));
const bodies = async (other: string) => ((await (await thread(req(), ctx({ userId: other }))).json()).messages as { body: string }[]).map((m) => m.body);
const listed = async () => ((await (await inbox()).json()).conversations as { partner: { id: string } }[]).map((c) => c.partner.id);

async function chatting() {
  const ana = await createUser({ name: "Ana" });
  const ben = await createUser({ name: "Ben" });
  await prisma.friendship.create({ data: { pairKey: pairKey(ana.id, ben.id), requesterId: ana.id, addresseeId: ben.id, status: "ACCEPTED", acceptedAt: new Date() } });
  signInAs(ana);
  await say(ben.id, "Hi Ben");
  signInAs(ben);
  await say(ana.id, "Hi Ana");
  return { ana, ben };
}

describe("delete chat", () => {
  it("clears the chat for the planter only; the other person keeps theirs", async () => {
    const { ana, ben } = await chatting();
    signInAs(ana);
    const res = await remove(ben.id);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: true });
    expect(await listed()).toEqual([]);
    expect(await bodies(ben.id)).toEqual([]);
    expect((await (await unread()).json()).unread).toBe(0);

    signInAs(ben);
    expect(await listed()).toEqual([ana.id]);
    expect(await bodies(ana.id)).toEqual(["Hi Ben", "Hi Ana"]);
  });

  it("a newer message brings it back, starting from that message", async () => {
    const { ana, ben } = await chatting();
    signInAs(ana);
    await remove(ben.id);
    signInAs(ben);
    await say(ana.id, "Still there?");
    signInAs(ana);
    expect(await listed()).toEqual([ben.id]);
    expect(await bodies(ben.id)).toEqual(["Still there?"]);
    // Writing again yourself works the same way.
    await remove(ben.id);
    await say(ben.id, "Yes!");
    expect(await listed()).toEqual([ben.id]);
    expect(await bodies(ben.id)).toEqual(["Yes!"]);
  });

  it("404 without a chat; 401 signed out", async () => {
    const ana = await createUser({ name: "Ana" });
    const ben = await createUser({ name: "Ben" });
    signInAs(ana);
    expect((await remove(ben.id)).status).toBe(404);
    signInAs(null);
    expect((await remove(ben.id)).status).toBe(401);
  });
});
