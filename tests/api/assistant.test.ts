import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/assistant/route";
import { prisma } from "@/lib/prisma";
import { CODES, createSlot, createUser, jsonRequest, resetDb, signInAs } from "../helpers";

// Claude is faked: each test scripts what the model "returns".
const create = vi.hoisted(() => vi.fn());
vi.mock("@anthropic-ai/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@anthropic-ai/sdk")>();
  class FakeAnthropic extends actual.default {
    constructor(opts: ConstructorParameters<typeof actual.default>[0]) {
      super({ ...opts, apiKey: "test-key" });
      Object.assign(this, { beta: { messages: { create } } });
    }
  }
  return { ...actual, default: FakeAnthropic };
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
  process.env.ANTHROPIC_API_KEY = "test-key";
});
afterEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
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
    expect(create).not.toHaveBeenCalled();
  });
});

describe("POST /api/assistant — AI questions", () => {
  const textReply = (text: string) => ({ stop_reason: "end_turn", content: [{ type: "text", text }] });

  it("answers through Claude with the conversation so far", async () => {
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
    const request = create.mock.calls[0][0];
    expect(request.model).toBe("claude-opus-5-5");
    expect(request.messages).toEqual([
      { role: "user", content: "/rewards" },
      { role: "assistant", content: "Rewards you can redeem: …" },
      { role: "user", content: "What is the national tree?" },
    ]);
  });

  it("runs lookups for the asking planter only and feeds the results back", async () => {
    const user = await createUser({ points: 777 });
    await createUser({ points: 99_999 });
    signInAs(user);
    create
      .mockResolvedValueOnce({ stop_reason: "tool_use", content: [{ type: "tool_use", id: "t1", name: "get_my_stats", input: {} }] })
      .mockResolvedValueOnce(textReply("You have 777 pts."));
    const { body } = await ask("How many points do I have?");
    expect(body.reply.text).toBe("You have 777 pts.");

    const followUp = create.mock.calls[1][0].messages;
    const result = followUp.at(-1).content[0];
    expect(result).toMatchObject({ type: "tool_result", tool_use_id: "t1" });
    expect(JSON.parse(result.content)).toMatchObject({ points: 777, homeCity: "Quezon City, Metro Manila" });
  });

  it("reports a failed lookup to the model instead of crashing", async () => {
    signInAs(await createUser());
    create
      .mockResolvedValueOnce({ stop_reason: "tool_use", content: [{ type: "tool_use", id: "t1", name: "delete_everything", input: {} }] })
      .mockResolvedValueOnce(textReply("Sorry, I couldn't look that up."));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { status } = await ask("Do something");
    expect(status).toBe(200);
    expect(create.mock.calls[1][0].messages.at(-1).content[0]).toMatchObject({ is_error: true });
  });

  it("stops after a few lookup rounds", async () => {
    signInAs(await createUser());
    create.mockResolvedValue({ stop_reason: "tool_use", content: [{ type: "tool_use", id: "t", name: "get_rewards", input: {} }] });
    const { body } = await ask("Loop forever");
    expect(create).toHaveBeenCalledTimes(5);
    expect(body.reply.text).toMatch(/too many steps/);
  });

  it("gives a polite answer when the model declines", async () => {
    signInAs(await createUser());
    create.mockResolvedValueOnce({ stop_reason: "refusal", content: [] });
    expect((await ask("Something off-limits")).body.reply.text).toMatch(/can't help with that/);
  });

  it("is unavailable (503) without an API key, while commands keep working", async () => {
    signInAs(await createUser());
    delete process.env.ANTHROPIC_API_KEY;
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { status, body } = await ask("What is EcoQuest?");
    expect(status).toBe(503);
    expect(body.error).toMatch(/Commands like \/slots/);
    expect((await ask("/help")).status).toBe(200);
    expect(create).not.toHaveBeenCalled();
  });

  it("limits AI questions per planter", async () => {
    const user = await createUser();
    signInAs(user);
    await prisma.rateLimit.create({ data: { key: `assistant-ai-hour:${user.id}`, count: 20, windowStart: new Date() } });
    const { status, body } = await ask("One more?");
    expect(status).toBe(429);
    expect(body.error).toMatch(/this hour/);
    expect(create).not.toHaveBeenCalled();
  });
});
