// Message reactions, shared by the chat (client) and the server's check. Client-safe: no imports.

/** The quick row, like Messenger's. */
export const QUICK_REACTIONS = ["❤️", "😆", "😮", "😢", "😠", "👍"] as const;

/** Behind the "+" button: more faces and gestures, plus a few for planters. */
export const MORE_REACTIONS = [
  "😀", "😂", "🤣", "😊", "😍", "🥰", "😘", "😎",
  "🤩", "🥳", "😅", "😉", "🤔", "🙄", "😴", "🥺",
  "😭", "😡", "🤯", "😱", "🤗", "🙏", "👏", "🙌",
  "💪", "👌", "✌️", "👎", "🔥", "✨", "💯", "🎉",
  "💚", "💔", "🌱", "🌳", "🌿", "🍃", "🌏", "☀️",
] as const;

const ALLOWED = new Set<string>([...QUICK_REACTIONS, ...MORE_REACTIONS]);

/** Whether `emoji` is one of the reactions the app offers (the server accepts only these). */
export function isReaction(emoji: unknown): emoji is string {
  return typeof emoji === "string" && ALLOWED.has(emoji);
}
