import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as send } from "@/app/api/messages/[userId]/route";
import { POST as startUpload } from "@/app/api/messages/[userId]/upload/route";
import { PUT as react } from "@/app/api/messages/[userId]/[messageId]/reaction/route";
import { GET as inbox } from "@/app/api/messages/route";
import { GET as chatMediaFile } from "@/app/api/chat-media/[key]/route";
import { POST as startProofUpload } from "@/app/api/quests/[id]/verifications/upload/route";
import { POST as submitProof } from "@/app/api/quests/[id]/verifications/route";
import { POST as transcribeRoute } from "@/app/api/assistant/transcribe/route";
import { pairKey } from "@/lib/friends";
import { prisma } from "@/lib/prisma";
import { CHAT_MEDIA_RULES, MEDIA_RULES, baseType, mediaKind, mediaLabel, mediaRuleError } from "@/lib/media-rules";
import { createSlot, createUser, ctx, jsonRequest, resetDb, signInAs } from "../helpers";

// Voice messages: chats (friends and problem reports) take recorded audio; planting proof never
// does. EcoBot turns a voice question into text with Whisper on Groq (faked here).

const voice = (type = "audio/webm", bytes = 3000, name = "voice-message.weba") => new File([new Uint8Array(bytes)], name, { type });
function form(fields: Record<string, string | File>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return new Request("http://test.local", { method: "POST", body: f });
}
async function friends() {
  const a = await createUser({ name: "Ana" });
  const b = await createUser({ name: "Ben" });
  await prisma.friendship.create({ data: { pairKey: pairKey(a.id, b.id), requesterId: a.id, addresseeId: b.id, status: "ACCEPTED", acceptedAt: new Date() } });
  return { a, b };
}

describe("voice media rules", () => {
  it("allows recorded audio in chats only", () => {
    for (const type of ["audio/mp4", "audio/webm", "audio/ogg"]) {
      expect(mediaRuleError({ type, size: 1000 }, CHAT_MEDIA_RULES)).toBeNull();
      expect(mediaRuleError({ type, size: 1000 })).toBe("Voice messages can only be sent in chats.");
      expect(MEDIA_RULES[type]).toBeUndefined();
    }
    expect(mediaRuleError({ type: "audio/wav", size: 1000 }, CHAT_MEDIA_RULES)).toMatch(/format isn't supported/);
    expect(mediaRuleError({ type: "audio/mp4", size: 11 * 1024 * 1024 }, CHAT_MEDIA_RULES)).toMatch(/too large/);
    // Photos and videos are still fine in chats.
    expect(mediaRuleError({ type: "image/jpeg", size: 1000 }, CHAT_MEDIA_RULES)).toBeNull();
  });

  it("names media for previews", () => {
    expect(baseType("audio/webm;codecs=opus")).toBe("audio/webm");
    expect([mediaKind("audio/mp4"), mediaKind("video/mp4"), mediaKind("image/png")]).toEqual(["voice", "video", "photo"]);
    expect(mediaLabel("audio/ogg")).toBe("Voice Message");
  });
});

describe("voice messages between friends (local disk)", () => {
  beforeEach(resetDb);

  it("sends a voice message the friend can play, with voice previews", async () => {
    const { a, b } = await friends();
    signInAs(a);
    expect(await (await startUpload(jsonRequest({ type: "audio/mp4", size: 3000 }), ctx({ userId: b.id }))).json()).toEqual({ upload: null });
    const res = await send(form({ body: "", file: voice() }), ctx({ userId: b.id }));
    expect(res.status).toBe(201);
    const { message } = await res.json();
    expect(message.media.type).toBe("audio/webm");
    expect(message.media.url).toMatch(/\.weba$/);
    const key = message.media.url.split("/").pop();

    signInAs(b);
    const got = await chatMediaFile(new Request("http://test.local"), ctx({ key }));
    expect(got.status).toBe(200);
    expect(got.headers.get("content-type")).toBe("audio/webm");
    // Seeking in a voice message (Safari needs range requests to play audio at all).
    expect((await chatMediaFile(new Request("http://test.local", { headers: { range: "bytes=0-99" } }), ctx({ key }))).status).toBe(206);
    expect((await (await inbox()).json()).conversations[0].preview).toBe("Sent a voice message");
    expect((await react(jsonRequest({ emoji: "❤️" }, "PUT"), ctx({ userId: a.id, messageId: message.id }))).status).toBe(200);

    signInAs(await createUser({ name: "Nosy" }));
    expect((await chatMediaFile(new Request("http://test.local"), ctx({ key }))).status).toBe(404);
  });

  it("rejects audio formats it doesn't know", async () => {
    const { a, b } = await friends();
    signInAs(a);
    expect((await startUpload(jsonRequest({ type: "audio/wav", size: 3000 }), ctx({ userId: b.id }))).status).toBe(400);
    expect((await send(form({ body: "", file: voice("audio/wav", 3000, "x.wav") }), ctx({ userId: b.id }))).status).toBe(400);
  });

  it("never takes a voice message as planting proof", async () => {
    const user = await createUser();
    const quest = await prisma.quest.create({ data: { userId: user.id, slotId: (await createSlot()).id } });
    signInAs(user);
    const start = await startProofUpload(jsonRequest({ type: "audio/mp4", size: 3000 }), ctx({ id: quest.id }));
    expect(start.status).toBe(400);
    expect((await start.json()).error).toBe("Voice messages can only be sent in chats.");
    const f = new FormData();
    f.set("file", voice("audio/mp4", 3000, "x.m4a"));
    f.set("plantCount", "1");
    expect((await submitProof(new Request("http://test.local", { method: "POST", body: f }), ctx({ id: quest.id }))).status).toBe(400);
    expect(await prisma.verification.count()).toBe(0);
  });
});

describe("POST /api/assistant/transcribe", () => {
  const groq = vi.fn();
  beforeEach(async () => {
    await resetDb();
    groq.mockReset();
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => groq(url, init)));
    process.env.GROQ_API_KEY = "test-key";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GROQ_API_KEY;
    delete process.env.GROQ_STT_MODEL;
  });
  const ask = (file?: File) => transcribeRoute(form(file ? { file } : {}));

  it("needs a session and a supported recording", async () => {
    signInAs(null);
    expect((await ask(voice())).status).toBe(401);
    signInAs(await createUser());
    expect((await ask()).status).toBe(400);
    expect((await ask(voice("audio/wav", 3000, "x.wav"))).status).toBe(400);
    expect((await ask(voice("audio/webm", 4 * 1024 * 1024 + 1))).status).toBe(413);
    expect(groq).not.toHaveBeenCalled();
  });

  it("sends the audio to Whisper with the right model and file name, and returns the words", async () => {
    signInAs(await createUser());
    groq.mockResolvedValueOnce(Response.json({ text: "  Magkano ang Narra seedlings?  " }));
    const res = await ask(voice("audio/webm;codecs=opus"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ text: "Magkano ang Narra seedlings?" });
    const [url, init] = groq.mock.calls[0];
    expect(url).toBe("https://api.groq.com/openai/v1/audio/transcriptions");
    expect(init.headers).toEqual({ Authorization: "Bearer test-key" });
    const sent = init.body as FormData;
    expect(sent.get("model")).toBe("whisper-large-v3-turbo");
    expect((sent.get("file") as File).name).toBe("question.webm");
    expect(sent.get("prompt")).toMatch(/Narra/);

    process.env.GROQ_STT_MODEL = "whisper-large-v3";
    groq.mockResolvedValueOnce(Response.json({ text: "Hi" }));
    await ask(voice("audio/mp4", 3000, "voice-message.m4a"));
    expect((groq.mock.calls[1][1].body as FormData).get("model")).toBe("whisper-large-v3");
    expect(((groq.mock.calls[1][1].body as FormData).get("file") as File).name).toBe("question.m4a");
  });

  it("cuts a long transcript at a word so it fits a question", async () => {
    signInAs(await createUser());
    groq.mockResolvedValueOnce(Response.json({ text: "word ".repeat(150) }));
    const { text } = await (await ask(voice())).json();
    expect(text.length).toBeLessThanOrEqual(500);
    expect(text.endsWith("word")).toBe(true);
  });

  it("says when nothing was heard, when Groq is busy, and when voice is unavailable", async () => {
    signInAs(await createUser());
    vi.spyOn(console, "error").mockImplementation(() => {});
    groq.mockResolvedValueOnce(Response.json({ text: "   " }));
    expect((await ask(voice())).status).toBe(422);
    groq.mockResolvedValueOnce(new Response("rate limited", { status: 429 }));
    const busy = await ask(voice());
    expect(busy.status).toBe(503);
    expect((await busy.json()).error).toMatch(/busy/);
    groq.mockResolvedValueOnce(new Response("boom", { status: 500 }));
    expect((await (await ask(voice())).json()).error).toMatch(/Voice isn't available/);
    delete process.env.GROQ_API_KEY;
    expect((await ask(voice())).status).toBe(503);
  });

  it("limits voice questions per planter", async () => {
    const user = await createUser();
    signInAs(user);
    await prisma.rateLimit.create({ data: { key: `assistant-voice-hour:${user.id}`, count: 30, windowStart: new Date() } });
    const res = await ask(voice());
    expect(res.status).toBe(429);
    expect(groq).not.toHaveBeenCalled();
  });
});
