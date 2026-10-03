import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as startUpload } from "@/app/api/quests/[id]/verifications/upload/route";
import { POST as submitProof } from "@/app/api/quests/[id]/verifications/route";
import { GET as getMedia } from "@/app/api/media/[key]/route";
import { prisma } from "@/lib/prisma";
import { createSlot, createUser, ctx, jpeg, jsonRequest, resetDb, signInAs, uploadRequest } from "../helpers";

// A minimal fake of the Supabase Storage endpoints the app uses (same paths and response
// shapes as @supabase/storage-js), so the direct-upload flow runs end to end.
const SUPABASE_URL = "https://fake-project.supabase.co";
const BASE = `${SUPABASE_URL}/storage/v1`;
const objects = new Map<string, { size: number; type: string }>(); // "uploads/<key>" → stored file
const calls: { method: string; path: string; auth: string | null }[] = [];

function reply(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

function fakeStorage(input: RequestInfo | URL, init: RequestInit = {}) {
  const method = init.method ?? "GET";
  const path = String(input).replace(BASE, "");
  calls.push({ method, path, auth: new Headers(init.headers).get("authorization") });
  let m: RegExpMatchArray | null;
  if (method === "POST" && path === "/bucket") return reply({ name: "ecoquest" });
  if (method === "POST" && (m = path.match(/^\/object\/upload\/sign\/ecoquest\/(.+)$/))) {
    return reply({ url: `/object/upload/sign/ecoquest/${m[1]}?token=upload-token` });
  }
  if (method === "GET" && (m = path.match(/^\/object\/info\/ecoquest\/(.+)$/))) {
    const file = objects.get(m[1]);
    return file
      ? reply({ name: m[1], size: file.size, content_type: file.type })
      : reply({ statusCode: "404", error: "not_found", message: "Object not found" }, 400);
  }
  if (method === "POST" && (m = path.match(/^\/object\/sign\/ecoquest\/(.+)$/))) {
    return reply({ signedURL: `/object/sign/ecoquest/${m[1]}?token=download-token` });
  }
  if (method === "DELETE" && path === "/object/ecoquest") {
    for (const prefix of JSON.parse(String(init.body)).prefixes as string[]) objects.delete(prefix);
    return reply([]);
  }
  return reply({ error: `unexpected ${method} ${path}` }, 500);
}

const MB = 1024 * 1024;

async function setup() {
  const user = await createUser();
  const slot = await createSlot();
  const quest = await prisma.quest.create({ data: { userId: user.id, slotId: slot.id } });
  signInAs(user);
  return { user, quest };
}

async function start(questId: string, file: { type: string; size: number } = { type: "image/jpeg", size: 6 * MB }) {
  return startUpload(jsonRequest(file), ctx({ id: questId }));
}

/** Gets a signed upload, then plays the browser's PUT by storing the file in the fake bucket. */
async function uploadDirect(questId: string, stored: { type: string; size: number } = { type: "image/jpeg", size: 6 * MB }) {
  const res = await start(questId, stored);
  expect(res.status).toBe(200);
  const { upload } = await res.json();
  objects.set(`uploads/${upload.key}`, stored);
  return upload as { url: string; key: string; token: string };
}

function finalize(questId: string, body: object) {
  return submitProof(jsonRequest(body), ctx({ id: questId }));
}

describe("direct uploads to Supabase Storage", () => {
  beforeAll(() => {
    vi.stubEnv("SUPABASE_URL", SUPABASE_URL);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
    vi.stubEnv("AUTH_SECRET", "test-secret");
    vi.stubGlobal("fetch", vi.fn(fakeStorage));
  });
  afterAll(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  beforeEach(async () => {
    await resetDb();
    objects.clear();
    calls.length = 0;
  });

  it("issues a signed storage URL, then records the proof from what storage holds", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const { quest } = await setup();
    const upload = await uploadDirect(quest.id, { type: "image/jpeg", size: 6 * MB }); // > Vercel's 4.5 MB

    expect(upload.url).toBe(`${BASE}/object/upload/sign/ecoquest/uploads/${upload.key}?token=upload-token`);
    expect(upload.key).toMatch(/^[0-9a-f-]{36}\.jpg$/);
    expect(calls.every((c) => c.auth === "Bearer service-key")).toBe(true);

    const res = await finalize(quest.id, { key: upload.key, token: upload.token, plantCount: 3 });
    expect(res.status).toBe(201);
    const { verification } = await res.json();
    expect(verification).toMatchObject({ mediaUrl: `/api/media/${upload.key}`, mediaType: "image/jpeg", plantCount: 3 });
    expect((await prisma.quest.findUniqueOrThrow({ where: { id: quest.id } })).status).toBe("PENDING_VERIFICATION");
    expect(await prisma.notification.count({ where: { userId: admin.id, link: "/admin/verifications" } })).toBe(1);
  });

  it("accepts a 50 MB video", async () => {
    const { quest } = await setup();
    const upload = await uploadDirect(quest.id, { type: "video/mp4", size: 50 * MB });
    expect(upload.key).toMatch(/\.mp4$/);
    const res = await finalize(quest.id, { key: upload.key, token: upload.token, plantCount: 1 });
    expect(res.status).toBe(201);
    expect((await res.json()).verification.mediaType).toBe("video/mp4");
  });

  it("serves stored proof through a short-lived signed link", async () => {
    const { quest } = await setup();
    const upload = await uploadDirect(quest.id);
    await finalize(quest.id, { key: upload.key, token: upload.token, plantCount: 1 });

    const res = await getMedia(new Request("http://test.local"), ctx({ key: upload.key }));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`${BASE}/object/sign/ecoquest/uploads/${upload.key}?token=download-token`);
    expect(calls.find((c) => c.path.startsWith("/object/sign/"))).toBeTruthy();

    // The access check still runs first: a stranger can't see pending proof.
    signInAs(await createUser());
    expect((await getMedia(new Request("http://test.local"), ctx({ key: upload.key }))).status).toBe(404);
  });

  it("rejects bad or foreign tokens", async () => {
    const { user, quest } = await setup();
    const otherQuest = await prisma.quest.create({ data: { userId: user.id, slotId: (await createSlot()).id } });
    const upload = await uploadDirect(quest.id);

    expect((await finalize(quest.id, { key: upload.key, token: "forged", plantCount: 1 })).status).toBe(400);
    expect((await finalize(quest.id, { key: upload.key, plantCount: 1 })).status).toBe(400);
    // A token is only valid for the quest it was issued for.
    expect((await finalize(otherQuest.id, { key: upload.key, token: upload.token, plantCount: 1 })).status).toBe(400);
    expect(await prisma.verification.count()).toBe(0);
  });

  it("hides other users' quests, even with a valid token", async () => {
    const { quest } = await setup();
    const upload = await uploadDirect(quest.id);
    signInAs(await createUser());
    expect((await finalize(quest.id, { key: upload.key, token: upload.token, plantCount: 1 })).status).toBe(404);
    expect((await start(quest.id)).status).toBe(404);
  });

  it("checks the stored file, not the browser's claims, and deletes bad uploads", async () => {
    const { quest } = await setup();

    // Never uploaded.
    const missing = await (await start(quest.id)).json();
    const res = await finalize(quest.id, { key: missing.upload.key, token: missing.upload.token, plantCount: 1 });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/didn't arrive/);

    // Declared a small JPG, stored something bigger than allowed.
    const big = await (await start(quest.id, { type: "image/jpeg", size: MB })).json();
    objects.set(`uploads/${big.upload.key}`, { type: "image/jpeg", size: 11 * MB });
    expect((await finalize(quest.id, { key: big.upload.key, token: big.upload.token, plantCount: 1 })).status).toBe(400);
    expect(objects.has(`uploads/${big.upload.key}`)).toBe(false);

    // Declared a JPG, stored a different type.
    const swapped = await (await start(quest.id)).json();
    objects.set(`uploads/${swapped.upload.key}`, { type: "text/html", size: 100 });
    expect((await finalize(quest.id, { key: swapped.upload.key, token: swapped.upload.token, plantCount: 1 })).status).toBe(400);
    expect(objects.has(`uploads/${swapped.upload.key}`)).toBe(false);

    // Allowed type, but not the one the key was issued for.
    const mismatch = await (await start(quest.id)).json();
    objects.set(`uploads/${mismatch.upload.key}`, { type: "video/mp4", size: MB });
    expect((await finalize(quest.id, { key: mismatch.upload.key, token: mismatch.upload.token, plantCount: 1 })).status).toBe(400);

    // Empty file.
    const empty = await (await start(quest.id)).json();
    objects.set(`uploads/${empty.upload.key}`, { type: "image/jpeg", size: 0 });
    expect((await finalize(quest.id, { key: empty.upload.key, token: empty.upload.token, plantCount: 1 })).status).toBe(400);

    expect(await prisma.verification.count()).toBe(0);
    expect((await prisma.quest.findUniqueOrThrow({ where: { id: quest.id } })).status).toBe("ACTIVE");
  });

  it("won't reuse an upload that was already submitted, and keeps its file", async () => {
    const { quest } = await setup();
    const upload = await uploadDirect(quest.id);
    expect((await finalize(quest.id, { key: upload.key, token: upload.token, plantCount: 1 })).status).toBe(201);

    // e.g. the proof was rejected and the quest is awaiting proof again
    await prisma.quest.update({ where: { id: quest.id }, data: { status: "ACTIVE" } });
    expect((await finalize(quest.id, { key: upload.key, token: upload.token, plantCount: 1 })).status).toBe(409);
    expect(objects.has(`uploads/${upload.key}`)).toBe(true);
    expect(await prisma.verification.count()).toBe(1);
  });

  it("validates the planned file and quest before signing", async () => {
    const { quest } = await setup();
    expect((await start(quest.id, { type: "image/gif", size: MB })).status).toBe(400);
    expect((await start(quest.id, { type: "image/jpeg", size: 11 * MB })).status).toBe(400);
    expect((await start(quest.id, { type: "video/mp4", size: 51 * MB })).status).toBe(400);
    expect((await start(quest.id, { type: "image/jpeg", size: 0 })).status).toBe(400);
    expect(calls.some((c) => c.path.startsWith("/object/upload/sign/"))).toBe(false);

    await prisma.quest.update({ where: { id: quest.id }, data: { status: "PENDING_VERIFICATION" } });
    expect((await start(quest.id)).status).toBe(409);
  });

  it("rate-limits signed upload URLs per user", async () => {
    const { quest } = await setup();
    for (let i = 0; i < 30; i++) expect((await start(quest.id)).status).toBe(200);
    expect((await start(quest.id)).status).toBe(429);
  });

  it("validates the plant count", async () => {
    const { quest } = await setup();
    const upload = await uploadDirect(quest.id);
    for (const plantCount of [0, 501, 1.5, "abc"]) {
      expect((await finalize(quest.id, { key: upload.key, token: upload.token, plantCount })).status).toBe(400);
    }
  });
});

describe("local-disk storage (no Supabase configured)", () => {
  beforeEach(resetDb);

  it("tells the browser to post the file to the API instead", async () => {
    const { quest } = await setup();
    const res = await start(quest.id);
    expect(res.status).toBe(200);
    expect((await res.json()).upload).toBeNull();

    const posted = await submitProof(uploadRequest(jpeg(), 2), ctx({ id: quest.id }));
    expect(posted.status).toBe(201);
  });
});
