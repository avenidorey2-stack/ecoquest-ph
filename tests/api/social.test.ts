import { beforeEach, describe, expect, it } from "vitest";
import { GET as search } from "@/app/api/users/search/route";
import { DELETE as unfriend, POST as befriend } from "@/app/api/friends/[userId]/route";
import { GET as thread } from "@/app/api/photos/[id]/route";
import { DELETE as unlike, POST as like } from "@/app/api/photos/[id]/like/route";
import { POST as comment } from "@/app/api/photos/[id]/comments/route";
import { DELETE as deleteComment } from "@/app/api/comments/[id]/route";
import { getPublicProfile } from "@/lib/public-profile";
import { listFriends } from "@/lib/friends";
import { prisma } from "@/lib/prisma";
import type { PhotoVisibility } from "@/generated/prisma/client";
import { createSlot, createUser, ctx, jsonRequest, resetDb, signInAs } from "../helpers";

beforeEach(resetDb);

const req = (url = "http://test.local") => new Request(url);
const add = (id: string) => befriend(req(), ctx({ userId: id }));
const remove = (id: string) => unfriend(req(), ctx({ userId: id }));
const getThread = async (id: string) => thread(req(), ctx({ id }));
const post = (id: string, body: object) => comment(jsonRequest(body), ctx({ id }));
const inbox = (userId: string) => prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });

/** A planter with one approved planting photo (and one still in review). */
async function planterWithPhoto(photoVisibility: PhotoVisibility = "EVERYONE") {
  const owner = await createUser({ name: "Maria Owner", photoVisibility });
  const quest = await prisma.quest.create({ data: { userId: owner.id, slotId: (await createSlot()).id } });
  const photo = await prisma.verification.create({
    data: { questId: quest.id, mediaUrl: `/api/media/${owner.id}.jpg`, mediaType: "image/jpeg", status: "APPROVED", reviewedAt: new Date() },
  });
  const pending = await prisma.verification.create({ data: { questId: quest.id, mediaUrl: `/api/media/${owner.id}-p.jpg`, mediaType: "image/jpeg" } });
  return { owner, photo, pending };
}

async function makeFriends(a: { id: string }, b: { id: string }) {
  signInAs(a);
  await add(b.id);
  signInAs(b);
  await add(a.id);
}

describe("planter search", () => {
  it("finds planters by name, case-insensitive, with friend states; never the viewer or admins", async () => {
    const me = await createUser({ name: "Juan Searcher" });
    const ana = await createUser({ name: "Ana Reyes" });
    const anabel = await createUser({ name: "Anabel Cruz" });
    await createUser({ name: "Ana Admin", role: "ADMIN" });
    signInAs(me);
    await add(anabel.id);

    const res = await search(req("http://test.local/api/users/search?q=ANA"));
    const { results } = await res.json();
    expect(results.map((r: { name: string }) => r.name).sort()).toEqual(["Ana Reyes", "Anabel Cruz"]);
    expect(results.find((r: { id: string }) => r.id === anabel.id).state).toBe("REQUESTED");
    expect(results.find((r: { id: string }) => r.id === ana.id).state).toBe("NONE");
    expect(Object.keys(results[0]).sort()).toEqual(["city", "id", "image", "level", "name", "province", "state"]);
  });

  it("needs two characters and a session", async () => {
    signInAs(await createUser({ name: "Juan" }));
    await createUser({ name: "Ana" });
    expect((await (await search(req("http://test.local/api/users/search?q=a"))).json()).results).toEqual([]);
    signInAs(null);
    expect((await search(req("http://test.local/api/users/search?q=ana"))).status).toBe(401);
  });
});

describe("friend requests", () => {
  it("request → notification → accept → both are friends", async () => {
    const juan = await createUser({ name: "Juan" });
    const ana = await createUser({ name: "Ana" });
    signInAs(juan);
    expect(await (await add(ana.id)).json()).toEqual({ state: "REQUESTED" });
    expect((await inbox(ana.id)).map((n) => [n.message, n.link])).toEqual([["Juan sent you a friend request.", "/friends"]]);
    expect((await listFriends(ana.id)).incoming.map((c) => c.name)).toEqual(["Juan"]);
    expect((await listFriends(juan.id)).outgoing.map((c) => c.name)).toEqual(["Ana"]);

    // Asking again doesn't duplicate; Ana "adding" Juan accepts his request.
    expect(await (await add(ana.id)).json()).toEqual({ state: "REQUESTED" });
    signInAs(ana);
    expect(await (await add(juan.id)).json()).toEqual({ state: "FRIENDS" });
    expect((await inbox(juan.id)).map((n) => [n.message, n.link])).toEqual([["Ana accepted your friend request.", `/planters/${ana.id}`]]);
    expect((await listFriends(juan.id)).friends.map((c) => c.name)).toEqual(["Ana"]);
    expect(await prisma.friendship.count()).toBe(1);
  });

  it("delete cancels, declines or unfriends", async () => {
    const juan = await createUser();
    const ana = await createUser();
    await makeFriends(juan, ana);
    signInAs(juan);
    expect(await (await remove(ana.id)).json()).toEqual({ state: "NONE" });
    expect(await prisma.friendship.count()).toBe(0);
  });

  it("refuses yourself, unknown or non-planter accounts, and unverified users", async () => {
    const me = await createUser();
    const admin = await createUser({ role: "ADMIN" });
    signInAs(me);
    expect((await add(me.id)).status).toBe(400);
    expect((await add(admin.id)).status).toBe(404);
    expect((await add("nope")).status).toBe(404);
    signInAs(await createUser({ emailVerified: null }));
    expect((await add(me.id)).status).toBe(403);
  });
});

describe("photo privacy", () => {
  it("Everyone: any signed-in planter sees the photos, with reaction counts", async () => {
    const { owner, photo } = await planterWithPhoto();
    const visitor = await createUser();
    const profile = await getPublicProfile(owner.id, visitor.id);
    expect(profile?.photosHiddenBy).toBeNull();
    expect(profile?.proofs.map((p) => [p.id, p.likeCount, p.commentCount, p.likedByMe])).toEqual([[photo.id, 0, 0, false]]);
  });

  it("Friends only: hidden from others (profile and thread), shown to friends, the owner and admins", async () => {
    const { owner, photo } = await planterWithPhoto("FRIENDS");
    const stranger = await createUser();
    const friend = await createUser();
    const admin = await createUser({ role: "ADMIN" });
    await makeFriends(owner, friend);

    const hidden = await getPublicProfile(owner.id, stranger.id);
    expect(hidden).toMatchObject({ proofs: [], photosHiddenBy: "FRIENDS", totalProofs: 1 });
    signInAs(stranger);
    expect((await getThread(photo.id)).status).toBe(404);
    expect((await like(req(), ctx({ id: photo.id }))).status).toBe(404);
    expect((await post(photo.id, { body: "hi" })).status).toBe(404);

    for (const viewer of [friend, owner, admin]) {
      expect((await getPublicProfile(owner.id, viewer.id))?.proofs).toHaveLength(1);
    }
  });

  it("Only me: hidden even from friends", async () => {
    const { owner } = await planterWithPhoto("ONLY_ME");
    const friend = await createUser();
    await makeFriends(owner, friend);
    expect(await getPublicProfile(owner.id, friend.id)).toMatchObject({ proofs: [], photosHiddenBy: "ONLY_ME" });
    expect((await getPublicProfile(owner.id, owner.id))?.proofs).toHaveLength(1);
  });
});

describe("likes", () => {
  it("likes once (notifying the owner), unlikes, and shows in the profile", async () => {
    const { owner, photo } = await planterWithPhoto();
    const fan = await createUser({ name: "Fan" });
    signInAs(fan);
    expect(await (await like(req(), ctx({ id: photo.id }))).json()).toEqual({ likeCount: 1, likedByMe: true });
    expect(await (await like(req(), ctx({ id: photo.id }))).json()).toEqual({ likeCount: 1, likedByMe: true });
    expect((await inbox(owner.id)).map((n) => [n.message, n.link])).toEqual([
      ["Fan liked your planting photo.", `/planters/${owner.id}?photo=${photo.id}`],
    ]);
    expect((await getPublicProfile(owner.id, fan.id))?.proofs[0]).toMatchObject({ likeCount: 1, likedByMe: true });

    expect(await (await unlike(req(), ctx({ id: photo.id }))).json()).toEqual({ likeCount: 0, likedByMe: false });
  });

  it("owners can like their own photo without a notification; pending proofs can't be liked", async () => {
    const { owner, photo, pending } = await planterWithPhoto();
    signInAs(owner);
    expect((await like(req(), ctx({ id: photo.id }))).status).toBe(200);
    expect(await inbox(owner.id)).toHaveLength(0);
    expect((await like(req(), ctx({ id: pending.id }))).status).toBe(404);
  });
});

describe("comments and replies", () => {
  it("threads replies under their comment and notifies the owner and the replied-to author", async () => {
    const { owner, photo } = await planterWithPhoto();
    const ana = await createUser({ name: "Ana" });
    const ben = await createUser({ name: "Ben" });

    signInAs(ana);
    const first = await (await post(photo.id, { body: "  Beautiful narra!  " })).json();
    signInAs(ben);
    const reply = await (await post(photo.id, { body: "Agreed", parentId: first.id })).json();
    signInAs(ana);
    // A reply to a reply joins the same thread.
    await post(photo.id, { body: "Thanks Ben", parentId: reply.id });

    const t = await (await getThread(photo.id)).json();
    expect(t.commentCount).toBe(3);
    expect(t.comments).toHaveLength(1);
    expect(t.comments[0]).toMatchObject({ body: "Beautiful narra!", author: { name: "Ana" }, canDelete: true });
    expect(t.comments[0].replies.map((r: { body: string }) => r.body)).toEqual(["Agreed", "Thanks Ben"]);

    expect((await inbox(owner.id)).map((n) => n.message)).toEqual([
      "Ana commented on your planting photo: “Beautiful narra!”",
      "Ben commented on your planting photo: “Agreed”",
      "Ana commented on your planting photo: “Thanks Ben”",
    ]);
    expect((await inbox(ana.id)).map((n) => n.message)).toEqual(["Ben replied to your comment: “Agreed”"]);
    expect((await inbox(ben.id)).map((n) => n.message)).toEqual(["Ana replied to your comment: “Thanks Ben”"]);
  });

  it("validates the text and the reply target", async () => {
    const { photo } = await planterWithPhoto();
    signInAs(await createUser());
    expect((await post(photo.id, { body: "   " })).status).toBe(400);
    expect((await post(photo.id, { body: "x".repeat(501) })).status).toBe(400);
    expect((await post(photo.id, { body: "ok", parentId: "missing" })).status).toBe(404);
    expect((await post(photo.id, { body: "x".repeat(500) })).status).toBe(201);
  });

  it("deletes: author yes, photo owner yes (with replies), strangers no", async () => {
    const { owner, photo } = await planterWithPhoto();
    const ana = await createUser();
    const stranger = await createUser();
    signInAs(ana);
    const { id } = await (await post(photo.id, { body: "Nice" })).json();
    await post(photo.id, { body: "reply", parentId: id });

    signInAs(stranger);
    expect((await deleteComment(req(), ctx({ id }))).status).toBe(403);
    expect((await (await getThread(photo.id)).json()).comments[0].canDelete).toBe(false);
    signInAs(owner);
    expect((await deleteComment(req(), ctx({ id }))).status).toBe(200);
    expect(await prisma.photoComment.count()).toBe(0);
  });
});
