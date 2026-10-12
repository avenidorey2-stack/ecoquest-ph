import { AssistantBusy, AssistantUnavailable } from "./ai";

// Voice questions for EcoBot: the recording is turned into text by Whisper on Groq (same
// GROQ_API_KEY as the chat), then asked like a typed question. The audio isn't stored.

const GROQ_TRANSCRIBE_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
/** Fast multilingual Whisper (English, Filipino, Taglish). Override with GROQ_STT_MODEL. */
const DEFAULT_STT_MODEL = "whisper-large-v3-turbo";
const TIMEOUT_MS = 30_000;
/**
 * Words Whisper should expect, so app and tree names come out spelled right. Whisper uses this
 * as context only (it isn't an instruction).
 */
const VOCABULARY = "EcoQuest PH, EcoBot, Narra, Molave, Apitong, Kamagong, Banaba, Ipil, Salingbobog, slots, quests, proof, GCash, Maya, Taglish.";

/** The words in `audio`, trimmed; "" when nothing was said. */
export async function transcribe(audio: File): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new AssistantUnavailable("GROQ_API_KEY is not set.");
  const form = new FormData();
  form.set("file", audio, audio.name);
  form.set("model", process.env.GROQ_STT_MODEL?.trim() || DEFAULT_STT_MODEL);
  form.set("response_format", "json");
  form.set("temperature", "0");
  form.set("prompt", VOCABULARY);

  let res: Response;
  try {
    res = await fetch(GROQ_TRANSCRIBE_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new AssistantUnavailable(`Groq transcription failed: ${(err as Error).message}`);
  }
  if (res.status === 429) throw new AssistantBusy(`Groq transcription rate limit: ${(await res.text().catch(() => "")).slice(0, 300)}`);
  if (!res.ok) throw new AssistantUnavailable(`Groq transcription error ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`);
  const text = ((await res.json().catch(() => ({}))) as { text?: unknown }).text;
  return typeof text === "string" ? text.trim() : "";
}
