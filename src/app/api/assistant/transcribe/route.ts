import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/authz";
import { hitRateLimit } from "@/lib/rate-limit";
import { baseType, MB, VOICE_RULES } from "@/lib/media-rules";
import { MAX_QUESTION_LENGTH } from "@/lib/assistant/command-list";
import { AssistantBusy, AssistantUnavailable } from "@/lib/assistant/ai";
import { transcribe } from "@/lib/assistant/transcribe";

export const maxDuration = 60;

/** 30 seconds of voice is well under this (recorded at 64 kbps); Vercel caps bodies at 4.5 MB. */
const MAX_BYTES = 4 * MB;
const HOUR = 60 * 60 * 1000;
const LIMITS = [
  { key: "hour", count: 30, windowMs: HOUR },
  { key: "day", count: 100, windowMs: 24 * HOUR },
];

// POST /api/assistant/transcribe — multipart `file`: a voice question for EcoBot (≤ 30 seconds).
// Returns { text }: what was said, for the chat to send as the question. The audio isn't kept.
export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const file = (await req.formData().catch(() => null))?.get("file");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Record a voice message first." }, { status: 400 });
  const type = baseType(file.type);
  const rule = VOICE_RULES[type];
  if (!rule) return NextResponse.json({ error: "That recording format isn't supported. Try another browser." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "That recording is too long. Keep it under 30 seconds." }, { status: 413 });

  for (const limit of LIMITS) {
    if (!(await hitRateLimit(`assistant-voice-${limit.key}:${me.id}`, limit.count, limit.windowMs))) {
      return NextResponse.json({ error: `You've sent a lot of voice questions this ${limit.key}. You can still type.` }, { status: 429 });
    }
  }

  try {
    // Whisper goes by the file name's extension, so give it the right one.
    const text = await transcribe(new File([file], `question.${rule.ext === "weba" ? "webm" : rule.ext}`, { type }));
    if (!text) return NextResponse.json({ error: "I couldn't hear anything. Try again a little closer to the mic." }, { status: 422 });
    // Questions are capped at MAX_QUESTION_LENGTH: cut a long one at a word, not mid-word.
    const fits = text.length <= MAX_QUESTION_LENGTH ? text : text.slice(0, MAX_QUESTION_LENGTH).replace(/\s+\S*$/, "");
    return NextResponse.json({ text: fits });
  } catch (err) {
    if (!(err instanceof AssistantUnavailable)) throw err;
    console.error("transcription unavailable:", err.message);
    return NextResponse.json(
      { error: err instanceof AssistantBusy ? "EcoBot is busy right now — try again in a minute, or type your question." : "Voice isn't available right now. Please type your question." },
      { status: 503 },
    );
  }
}
