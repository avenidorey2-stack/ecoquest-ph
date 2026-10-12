import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/assistant/route";
import { prisma } from "@/lib/prisma";
import { CODES, createSlot, createUser, jsonRequest, resetDb, signInAs } from "../helpers";

// Groq is faked: each test scripts what the model "returns" (request body in, response JSON out).
const create = vi.fn();
const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
  const reply = await create(JSON.parse(init.body as string));
  return reply instanceof Response ? reply : Response.json(reply);
});
const textReply = (text: string) => ({ choices: [{ finish_reason: "stop", message: { role: "assistant", content: text } }] });
const toolReply = (name: string, id = "t1", args = "{}") => ({
  choices: [{ finish_reason: "tool_calls", message: { role: "assistant", content: null, tool_calls: [{ id, type: "function", function: { name, arguments: args } }] } }],
});

type Turn = { role: "user" | "assistant"; text: string };
const ask = async (messages: Turn[] | string) => {
  const res = await POST(jsonRequest({ messages: typeof messages === "string" ? [{ role: "user", text: messages }] : messages }));
  return { status: res.status, body: await res.json() };
};

async function createSpecies(name: string, category = "National and Cultural Trees") {
  return prisma.treeSpecies.create({
    data: {
      slug: name.toLowerCase().replace(/\s+/g, "-"),
      name,
      scientificName: `${name}us testus`,
      category,
      description: `${name} is a native tree.`,
      benefits: ["Shade", "Erosion control"],
      imageUrl: "/x.png",
    },
  });
}

beforeEach(async () => {
  await resetDb();
  create.mockReset();
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  process.env.GROQ_API_KEY = "test-key";
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GROQ_API_KEY;
  delete process.env.GROQ_MODEL;
});

describe("POST /api/assistant — validation", () => {
  it("requires a session", async () => {
    signInAs(null);
    expect((await ask("/help")).status).toBe(401);
  });

  it("rejects empty or malformed conversations", async () => {
    signInAs(await createUser());
    expect((await ask([])).status).toBe(400);
    expect((await ask([{ role: "system" as "user", text: "hi" }])).status).toBe(400);
    expect((await ask([{ role: "user", text: "   " }])).status).toBe(400);
    // The newest message must be the planter's.
    expect((await ask([{ role: "user", text: "hi" }, { role: "assistant", text: "hello" }])).status).toBe(400);
  });

  it("rejects over-long questions", async () => {
    signInAs(await createUser());
    expect((await ask("x".repeat(501))).status).toBe(400);
  });
});

describe("POST /api/assistant — commands", () => {
  it("/slots asks for a home city first", async () => {
    signInAs(await createUser({ cityCode: null, city: null, province: null, region: null }));
    const { body } = await ask("/slots");
    expect(body.reply.text).toMatch(/home city/);
    expect(body.reply.links).toEqual([{ label: "Set Home City", href: "/profile" }]);
  });

  it("/slots lists only claimable slots in the planter's own city", async () => {
    const user = await createUser();
    signInAs(user);
    await createSlot({ requiredPlantType: "Narra", pointsPerPlant: 30, barangay: "Bagong Silang" });
    await createSlot({ requiredPlantType: "Molave", status: "CLOSED" });
    await createSlot({ requiredPlantType: "Banaba", status: "FULL" });
    await createSlot({ requiredPlantType: "Ipil", maxParticipants: 1 }).then((s) =>
      prisma.quest.create({ data: { userId: user.id, slotId: s.id } }),
    );
    await createSlot({ requiredPlantType: "Kamagong", city: "City of Makati", cityCode: CODES.makati });

    const { status, body } = await ask("/slots");
    expect(status).toBe(200);
    const text: string = body.reply.text;
    expect(text).toContain("1 open slot you can claim in Quezon City, Metro Manila");
    expect(text).toContain("• Narra · Bagong Silang — 30 pts/plant · 20 spots left");
    // Their own claim shows, marked as theirs; closed, full and other cities don't.
    expect(text).toContain("Ipil");
    expect(text).toContain("You claimed this");
    expect(text).not.toMatch(/Molave|Banaba|Kamagong/);
    expect(body.reply.links).toEqual([{ label: "Open Slot Map", href: "/dashboard" }]);
  });

  it("/slots says when nothing is open", async () => {
    signInAs(await createUser());
    await createSlot({ status: "FULL" });
    const { body } = await ask("/slots");
    expect(body.reply.text).toMatch(/^No open slots in Quezon City, Metro Manila right now \(1 slot full or closed\)/);
  });

  it("/prices lists seedlings with points, COD pesos and sold-out stock, and filters by name", async () => {
    signInAs(await createUser());
    const narra = await createSpecies("Narra");
    const molave = await createSpecies("Molave");
    const hidden = await createSpecies("Hidden Tree");
    await prisma.seedlingProduct.create({ data: { speciesId: narra.id, priceInPoints: 60, priceInPesos: 45, stockQuantity: 10 } });
    await prisma.seedlingProduct.create({ data: { speciesId: molave.id, priceInPoints: 50, priceInPesos: 0, stockQuantity: 0 } });
    await prisma.seedlingProduct.create({ data: { speciesId: hidden.id, priceInPoints: 5, stockQuantity: 5, isActive: false } });

    const all = (await ask("/prices")).body.reply.text;
    expect(all).toContain("• Narra — 60 pts or ₱45.00 COD");
    expect(all).toContain("• Molave — 50 pts · Sold Out");
    expect(all).not.toContain("Hidden");

    const one = (await ask("/prices NARRA")).body.reply.text;
    expect(one).toContain("Narra");
    expect(one).not.toContain("Molave");

    expect((await ask("/prices acacia")).body.reply.text).toMatch(/No seedling in the shop matches "acacia"/);
  });

  it("/rewards lists active rewards cheapest first", async () => {
    signInAs(await createUser());
    await prisma.reward.createMany({
      data: [
        { rewardType: "EWALLET_CASH", brand: "GCash", costPoints: 1000, valuePesos: 100 },
        { rewardType: "VOUCHER", brand: "Grab", costPoints: 500, valuePesos: 50 },
        { rewardType: "VOUCHER", brand: "Shopee", costPoints: 1, valuePesos: 1, isActive: false },
      ],
    });
    const text: string = (await ask("/rewards")).body.reply.text;
    expect(text).toBe("Rewards you can redeem:\n• Grab ₱50.00 voucher — 500 pts\n• GCash ₱100.00 e-wallet cash — 1,000 pts");
  });

  it("/points shows the planter's own balance and level", async () => {
    signInAs(await createUser({ points: 1250, xp: 320, totalPlants: 16 }));
    const text: string = (await ask("/points")).body.reply.text;
    expect(text).toContain("Points: 1,250 pts");
    expect(text).toContain("Level 3 · Sapling — 320 XP (280 XP to the next level)");
    expect(text).toContain("Approved plants: 16");
  });

  it("/quests, /orders and /missions handle a brand-new planter", async () => {
    signInAs(await createUser());
    expect((await ask("/quests")).body.reply.text).toMatch(/no claimed slots/);
    expect((await ask("/orders")).body.reply.text).toMatch(/haven't ordered/);
    expect((await ask("/missions")).body.reply.text).toMatch(/no daily or side quests/);
  });

  it("/quests shows a claim with its progress", async () => {
    const user = await createUser();
    signInAs(user);
    const slot = await createSlot({ requiredPlantType: "Narra", barangay: "Bagong Silang" });
    await prisma.quest.create({ data: { userId: user.id, slotId: slot.id, plantCount: 1, targetPlants: 3, expiresAt: new Date(Date.now() + 86_400_000) } });
    const text: string = (await ask("/quests")).body.reply.text;
    expect(text).toMatch(/• Narra \(Bagong Silang, Quezon City\) — active, 1\/3 plants approved · claim ends /);
  });

  it("/trees looks a species up by name", async () => {
    signInAs(await createUser());
    await createSpecies("Narra");
    const text: string = (await ask("/trees narra")).body.reply.text;
    expect(text).toContain("Narra (Narraus testus) — National and Cultural Trees");
    expect(text).toContain("Benefits: Shade; Erosion control");
    expect((await ask("/trees")).body.reply.text).toContain("Trees in the directory:\nNarra");
  });

  it("suggests the closest command for a typo, and never calls the AI for commands", async () => {
    signInAs(await createUser());
    expect((await ask("/slot")).body.reply.text).toBe("I don't know /slot. Did you mean /slots? Type /help to see every command.");
    expect((await ask("/xyzzy")).body.reply.text).toBe("I don't know /xyzzy. Type /help to see every command.");
    expect((await ask("/help")).body.reply.text).toContain("/slots — Open planting slots in your city");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/assistant — AI questions", () => {
  it("answers through Groq with the conversation so far", async () => {
    signInAs(await createUser());
    create.mockResolvedValueOnce(textReply("Narra is the national tree."));
    const { status, body } = await ask([
      { role: "assistant", text: "Hi! (old greeting, dropped)" },
      { role: "user", text: "/rewards" },
      { role: "assistant", text: "Rewards you can redeem: …" },
      { role: "user", text: "What is the national tree?" },
    ]);
    expect(status).toBe(200);
    expect(body.reply).toEqual({ text: "Narra is the national tree." });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
    const request = create.mock.calls[0][0];
    expect(request).toMatchObject({ model: "openai/gpt-oss-120b", tool_choice: "auto", reasoning_effort: "low", include_reasoning: false });
    expect(request.messages[0]).toMatchObject({ role: "system" });
    expect(request.messages.slice(1)).toEqual([
      { role: "user", content: "/rewards" },
      { role: "assistant", content: "Rewards you can redeem: …" },
      { role: "user", content: "What is the national tree?" },
    ]);
  });

  it("uses GROQ_MODEL when set (and only sends gpt-oss options to gpt-oss)", async () => {
    signInAs(await createUser());
    process.env.GROQ_MODEL = "llama-3.3-70b-versatile";
    create.mockResolvedValueOnce(textReply("Hi"));
    await ask("Hello");
    const request = create.mock.calls[0][0];
    expect(request.model).toBe("llama-3.3-70b-versatile");
    expect(request).not.toHaveProperty("reasoning_effort");
  });

  it("runs lookups for the asking planter only and feeds the results back", async () => {
    const user = await createUser({ points: 777 });
    await createUser({ points: 99_999 });
    signInAs(user);
    create.mockResolvedValueOnce(toolReply("get_my_stats")).mockResolvedValueOnce(textReply("You have 777 pts."));
    const { body } = await ask("How many points do I have?");
    expect(body.reply.text).toBe("You have 777 pts.");

    const followUp = create.mock.calls[1][0].messages;
    expect(followUp.at(-2)).toMatchObject({ role: "assistant", tool_calls: [{ id: "t1" }] });
    const result = followUp.at(-1);
    expect(result).toMatchObject({ role: "tool", tool_call_id: "t1" });
    expect(JSON.parse(result.content)).toMatchObject({ points: 777, homeCity: "Quezon City, Metro Manila" });
  });

  it("passes the model's tool arguments through", async () => {
    signInAs(await createUser());
    const narra = await createSpecies("Narra");
    const molave = await createSpecies("Molave");
    await prisma.seedlingProduct.create({ data: { speciesId: narra.id, priceInPoints: 60, priceInPesos: 45, stockQuantity: 10 } });
    await prisma.seedlingProduct.create({ data: { speciesId: molave.id, priceInPoints: 50, stockQuantity: 10 } });
    create.mockResolvedValueOnce(toolReply("get_seedling_prices", "t1", JSON.stringify({ tree: "narra" }))).mockResolvedValueOnce(textReply("60 pts"));
    await ask("How much is narra?");
    const rows = JSON.parse(create.mock.calls[1][0].messages.at(-1).content);
    expect(rows).toEqual([expect.objectContaining({ name: "Narra", points: 60, pesos: 45 })]);
  });

  it("retries when the model ends its turn with an empty reply", async () => {
    signInAs(await createUser());
    create.mockResolvedValueOnce(textReply("")).mockResolvedValueOnce(textReply("Salingbobog is described as a small tree."));
    const { body } = await ask("Which tree is the smallest?");
    expect(body.reply.text).toBe("Salingbobog is described as a small tree.");
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("gives up politely after repeated empty replies", async () => {
    signInAs(await createUser());
    create.mockResolvedValue(textReply(""));
    const { body } = await ask("Which tree is the smallest?");
    expect(body.reply.text).toMatch(/couldn't come up with an answer/);
    expect(create).toHaveBeenCalledTimes(3);
  });

  it("gives the model the whole directory with descriptions to compare trees", async () => {
    signInAs(await createUser());
    await createSpecies("Narra");
    await createSpecies("Salingbobog", "Food and Fruit Trees");
    create.mockResolvedValueOnce(toolReply("find_trees")).mockResolvedValueOnce(textReply("Salingbobog."));
    await ask("Which tree is the smallest?");
    const { all } = JSON.parse(create.mock.calls[1][0].messages.at(-1).content);
    expect(all).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Salingbobog", description: "Salingbobog is a native tree.", scientificName: "Salingbobogus testus" })]),
    );
    expect(all).toHaveLength(2);
  });

  it("reports a failed lookup to the model instead of crashing", async () => {
    signInAs(await createUser());
    create.mockResolvedValueOnce(toolReply("delete_everything")).mockResolvedValueOnce(textReply("Sorry, I couldn't look that up."));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { status } = await ask("Do something");
    expect(status).toBe(200);
    expect(create.mock.calls[1][0].messages.at(-1).content).toMatch(/^Error: this lookup failed/);
  });

  it("stops after a few lookup rounds", async () => {
    signInAs(await createUser());
    create.mockResolvedValue(toolReply("get_rewards"));
    const { body } = await ask("Loop forever");
    expect(create).toHaveBeenCalledTimes(5);
    expect(body.reply.text).toMatch(/too many steps/);
  });

  it("is unavailable (503) when Groq errors, while commands keep working", async () => {
    signInAs(await createUser());
    vi.spyOn(console, "error").mockImplementation(() => {});
    create.mockResolvedValueOnce(new Response("server error", { status: 500 }));
    const failed = await ask("What is EcoQuest?");
    expect(failed.status).toBe(503);
    expect(failed.body.error).toMatch(/can't answer questions right now/);
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    expect((await ask("What is EcoQuest?")).status).toBe(503);
    expect((await ask("/help")).status).toBe(200);
  });

  it("waits out a short Groq rate limit, then answers", async () => {
    signInAs(await createUser());
    create.mockResolvedValueOnce(new Response("slow down", { status: 429, headers: { "retry-after": "0" } })).mockResolvedValueOnce(textReply("Here you go."));
    const { status, body } = await ask("Hi");
    expect(status).toBe(200);
    expect(body.reply.text).toBe("Here you go.");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("says EcoBot is busy when the rate limit wait is too long", async () => {
    signInAs(await createUser());
    vi.spyOn(console, "error").mockImplementation(() => {});
    create.mockResolvedValueOnce(new Response("slow down", { status: 429, headers: { "retry-after": "60" } }));
    const { status, body } = await ask("Hi");
    expect(status).toBe(503);
    expect(body.error).toMatch(/EcoBot is busy right now/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("is unavailable (503) without an API key", async () => {
    signInAs(await createUser());
    delete process.env.GROQ_API_KEY;
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { status, body } = await ask("What is EcoQuest?");
    expect(status).toBe(503);
    expect(body.error).toMatch(/Commands like \/slots/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("limits AI questions per planter", async () => {
    const user = await createUser();
    signInAs(user);
    await prisma.rateLimit.create({ data: { key: `assistant-ai-hour:${user.id}`, count: 20, windowStart: new Date() } });
    const { status, body } = await ask("One more?");
    expect(status).toBe(429);
    expect(body.error).toMatch(/this hour/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
