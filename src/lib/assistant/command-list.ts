// The assistant's slash commands. Shared by the chat box (suggestions while typing "/") and the
// server (src/lib/assistant/commands.ts), so keep it free of server-only imports.

/** Longest message the planter can send. */
export const MAX_QUESTION_LENGTH = 500;

export type AssistantCommand = {
  name: string;
  /** Shown after the name in suggestions, e.g. "[tree]". */
  args?: string;
  description: string;
};

export const ASSISTANT_COMMANDS: AssistantCommand[] = [
  { name: "slots", description: "Open planting slots in your city" },
  { name: "prices", args: "[tree]", description: "Seedling prices in the shop" },
  { name: "rewards", description: "GCash, Maya & vouchers you can redeem" },
  { name: "points", description: "Your points, level and weekly rank" },
  { name: "quests", description: "Your claimed slots and deadlines" },
  { name: "missions", description: "Today's daily quests and side quests" },
  { name: "orders", description: "Your latest seedling orders" },
  { name: "trees", args: "[name]", description: "Look up a native tree" },
  { name: "guide", description: "How EcoQuest PH works" },
  { name: "help", description: "List every command" },
  { name: "clear", description: "Start a new chat" },
];

/** Commands to suggest while the planter types a "/" word; empty once they've typed past the name. */
export function suggestCommands(input: string): AssistantCommand[] {
  const match = /^\/(\S*)$/.exec(input.trimStart());
  if (!match) return [];
  const typed = match[1].toLowerCase();
  return ASSISTANT_COMMANDS.filter((c) => c.name.startsWith(typed));
}

/** "/Prices  narra " → { name: "prices", arg: "narra" }; null when it isn't a command. */
export function parseCommand(input: string): { name: string; arg: string } | null {
  const match = /^\/(\S+)\s*([\s\S]*)$/.exec(input.trim());
  if (!match) return null;
  return { name: match[1].toLowerCase(), arg: match[2].trim() };
}
