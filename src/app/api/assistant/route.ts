import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/authz";
import { hitRateLimit } from "@/lib/rate-limit";
import { runCommand } from "@/lib/assistant/commands";
import { MAX_QUESTION_LENGTH } from "@/lib/assistant/command-list";
import { AssistantUnavailable, askAssistant, type ChatTurn } from "@/lib/assistant/ai";

// Claude can take a while when it looks things up (a few tool rounds).
export const maxDuration = 60;

/** Earlier turns sent along for context; older ones are dropped. */
const HISTORY_TURNS = 12;
const MAX_REPLY_LENGTH = 4000;
const HOUR = 60 * 60 * 1000;
/** Commands are cheap database reads; AI answers cost money, so they get a tighter budget. */
const COMMAND_LIMIT = { count: 120, windowMs: HOUR };
const AI_LIMITS = [
  { key: "hour", count: 20, windowMs: HOUR },
  { key: "day", count: 60, windowMs: 24 * HOUR },
];

function parseHistory(body: unknown): ChatTurn[] | null {
  const raw = (body as { messages?: unknown } | null)?.messages;
  if (!Array.isArray(raw) || !raw.length) return null;
  const turns: ChatTurn[] = [];
  for (const item of raw.slice(-HISTORY_TURNS)) {
    const { role, text } = (item ?? {}) as { role?: unknown; text?: unknown };
    if ((role !== "user" && role !== "assistant") || typeof text !== "string" || !text.trim()) return null;
    // Earlier replies only add context, so long ones are trimmed rather than rejected.
    turns.push({ role, text: role === "assistant" ? text.slice(0, MAX_REPLY_LENGTH) : text.trim() });
  }
  // The conversation sent to Claude must start with the planter.
  while (turns.length && turns[0].role === "assistant") turns.shift();
  const last = turns.at(-1);
  if (!last || last.role !== "user") return null;
  return turns;
}

// POST /api/assistant — body: { messages: [{ role: "user" | "assistant", text }] }, newest last.
// A "/command" is answered from live data; anything else goes to the AI.
export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const history = parseHistory(await req.json().catch(() => null));
  if (!history) return NextResponse.json({ error: "Send a message." }, { status: 400 });
  const question = history.at(-1)!.text;
  if (question.length > MAX_QUESTION_LENGTH) {
    return NextResponse.json({ error: `Keep it under ${MAX_QUESTION_LENGTH} characters.` }, { status: 400 });
  }

  if (question.startsWith("/")) {
    if (!(await hitRateLimit(`assistant-cmd:${me.id}`, COMMAND_LIMIT.count, COMMAND_LIMIT.windowMs))) {
      return NextResponse.json({ error: "That's a lot of commands. Please wait a bit and try again." }, { status: 429 });
    }
    const reply = await runCommand(me.id, question);
    return NextResponse.json({ reply });
  }

  for (const limit of AI_LIMITS) {
    if (!(await hitRateLimit(`assistant-ai-${limit.key}:${me.id}`, limit.count, limit.windowMs))) {
      return NextResponse.json(
        { error: `You've asked a lot of questions this ${limit.key}. Commands like /slots and /prices still work.` },
        { status: 429 },
      );
    }
  }
  try {
    const text = await askAssistant(me.id, history);
    return NextResponse.json({ reply: { text } });
  } catch (err) {
    if (!(err instanceof AssistantUnavailable)) throw err;
    console.error("assistant unavailable:", err.message);
    return NextResponse.json(
      { error: "I can't answer questions right now. Commands like /slots and /prices still work — type /help." },
      { status: 503 },
    );
  }
}
