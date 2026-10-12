import { formatDate, formatPesos, formatPoints } from "@/lib/format";
import { ASSISTANT_COMMANDS, parseCommand } from "./command-list";
import { GUIDE } from "./knowledge";
import { findTrees, myMissions, myOrders, myQuests, myStats, openSlotsNearMe, rewardList, seedlingPrices } from "./data";
import { proofAction, type AssistantAction } from "./actions";

export type AssistantLink = { label: string; href: string };
/** `actions` are cards the planter confirms in the chat (src/lib/assistant/actions.ts). */
export type AssistantReply = { text: string; links?: AssistantLink[]; actions?: AssistantAction[] };

const ORDER_STATUS: Record<string, string> = {
  PENDING: "Pending",
  PACKED: "Packed",
  OUT_FOR_DELIVERY: "Out for Delivery",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};
const plural = (n: number, word: string) => `${n.toLocaleString("en-PH")} ${word}${n === 1 ? "" : "s"}`;

function help(): AssistantReply {
  const lines = ASSISTANT_COMMANDS.map((c) => `/${c.name}${c.args ? ` ${c.args}` : ""} — ${c.description}`);
  return {
    text: [
      "Here's what I can do:",
      ...lines,
      "",
      "Or just ask me anything about EcoQuest PH, its trees, prices and rewards.",
      'I can also help you do things, like "claim the Narra slot", "claim my daily reward" or "redeem GCash ₱50". Nothing happens until you confirm.',
    ].join("\n"),
  };
}

async function slots(userId: string): Promise<AssistantReply> {
  const { city, slots, available, full } = await openSlotsNearMe(userId);
  if (!city) {
    return {
      text: "Set your home city first — you can only claim slots in your own city.",
      links: [{ label: "Set Home City", href: "/profile" }],
    };
  }
  const links = [{ label: "Open Slot Map", href: "/dashboard" }];
  if (!slots.length) {
    return {
      text: `No open slots in ${city} right now${full ? ` (${plural(full, "slot")} full or closed)` : ""}. You'll get a notification when a new one opens.`,
      links,
    };
  }
  const lines = slots.map((s) => {
    const where = s.barangay ? ` · ${s.barangay}` : "";
    const goal = s.plantsPerQuest > 1 ? ` · ${s.plantsPerQuest} plants per quest` : "";
    const spots = s.youClaimedIt ? "You claimed this" : `${plural(s.spotsLeft, "spot")} left`;
    return `• ${s.plant}${where} — ${formatPoints(s.pointsPerPlant)}/plant${goal} · ${spots}`;
  });
  const head = available
    ? `${plural(available, "open slot")} you can claim in ${city}:`
    : `Your claimed slots in ${city} (none left to claim):`;
  const more = available > slots.filter((s) => !s.youClaimedIt).length ? "\nShowing the top ones — see them all on the map." : "";
  return { text: `${head}\n${lines.join("\n")}${more}`, links };
}

async function prices(arg: string): Promise<AssistantReply> {
  const rows = await seedlingPrices(arg);
  const links = [{ label: "Open Shop", href: "/shop" }];
  if (!rows.length) {
    return { text: arg ? `No seedling in the shop matches "${arg}". Try /prices on its own for the full list.` : "The shop has no seedlings for sale right now.", links };
  }
  const lines = rows.map((p) => {
    const pesos = p.pesos !== null ? ` or ${formatPesos(p.pesos)} COD` : "";
    const stock = p.inStock > 0 ? "" : " · Sold Out";
    return `• ${p.name} — ${formatPoints(p.points)}${pesos}${stock}`;
  });
  return { text: `Seedling prices (each):\n${lines.join("\n")}\nCOD = cash on delivery.`, links };
}

async function rewards(): Promise<AssistantReply> {
  const rows = await rewardList();
  const links = [{ label: "Open Rewards", href: "/rewards" }];
  if (!rows.length) return { text: "No rewards are available right now. Check back soon!", links };
  const lines = rows.map((r) => `• ${r.brand} ${formatPesos(r.valuePesos)} ${r.type} — ${formatPoints(r.costPoints)}`);
  return { text: `Rewards you can redeem:\n${lines.join("\n")}`, links };
}

async function points(userId: string): Promise<AssistantReply> {
  const s = await myStats(userId);
  if (!s) return { text: "I couldn't find your account." };
  const rank = (r: number | null) => (r ? `#${r}` : "not ranked yet");
  const lines = [
    `Points: ${formatPoints(s.points)}`,
    `Level ${s.level} · ${s.levelTitle} — ${s.xp.toLocaleString("en-PH")} XP (${s.xpToNextLevel.toLocaleString("en-PH")} XP to the next level)`,
    `Approved plants: ${s.approvedPlants.toLocaleString("en-PH")}`,
    `This week: ${formatPoints(s.weeklyPoints)} · National ${rank(s.nationalRank)}${s.homeCity ? ` · Local ${rank(s.localRank)}` : ""}`,
  ];
  return { text: lines.join("\n"), links: [{ label: "Open Leaderboard", href: "/leaderboard" }] };
}

async function quests(userId: string): Promise<AssistantReply> {
  const rows = await myQuests(userId);
  const links = [{ label: "Open Dashboard", href: "/dashboard" }];
  if (!rows.length) return { text: "You have no claimed slots right now. Type /slots to find one near you.", links };
  const lines = rows.map((q) => {
    const deadline = q.expiresAt && q.status === "active" ? ` · claim ends ${formatDate(q.expiresAt)}` : "";
    return `• ${q.plant}${q.place ? ` (${q.place})` : ""} — ${q.status}, ${q.progress}${deadline}`;
  });
  return { text: `Your quests:\n${lines.join("\n")}`, links };
}

async function missions(userId: string): Promise<AssistantReply> {
  const { daily, side } = await myMissions(userId);
  const links = [{ label: "Open Dashboard", href: "/dashboard" }];
  if (!daily.length && !side.length) return { text: "There are no daily or side quests running right now.", links };
  const line = (m: (typeof daily)[number]) =>
    `• ${m.title} — ${m.progress} · ${m.status} · +${formatPoints(m.reward.points)}${m.reward.xp ? `, +${m.reward.xp} XP` : ""}`;
  const parts = [];
  if (daily.length) parts.push(`Daily quests (reset at midnight):\n${daily.map(line).join("\n")}`);
  if (side.length) parts.push(`Side quests:\n${side.map(line).join("\n")}`);
  return { text: parts.join("\n\n"), links };
}

async function orders(userId: string): Promise<AssistantReply> {
  const rows = await myOrders(userId);
  const links = [{ label: "Open Transactions", href: "/transactions" }];
  if (!rows.length) return { text: "You haven't ordered any seedlings yet. Type /prices to see what's in the shop.", links: [{ label: "Open Shop", href: "/shop" }] };
  const lines = rows.map((o) => {
    const total = o.currency === "PESOS" ? `${formatPesos(o.total)} COD` : formatPoints(o.total);
    return `• ${o.quantity} × ${o.seedling} — ${total} · ${ORDER_STATUS[o.status] ?? o.status} · ${formatDate(o.orderedAt)}`;
  });
  return { text: `Your latest orders:\n${lines.join("\n")}`, links };
}

async function upload(userId: string): Promise<AssistantReply> {
  const outcome = await proofAction(userId);
  if ("error" in outcome) return { text: outcome.error, links: outcome.links };
  const many = outcome.action.kind === "upload_proof" && outcome.action.quests.length > 1;
  return {
    text: `Here's your proof form${many ? " — pick the quest first" : ""}. Add a photo or video of what you planted, then submit it for review.`,
    actions: [outcome.action],
  };
}

async function trees(arg: string): Promise<AssistantReply> {
  const { matches, all } = await findTrees(arg);
  const links = [{ label: "Open Tree Directory", href: "/trees" }];
  if (!arg) {
    return { text: `Trees in the directory:\n${all.map((t) => t.name).join(", ")}\n\nType /trees followed by a name, e.g. /trees narra.`, links };
  }
  if (!matches.length) return { text: `No tree in the directory matches "${arg}". Type /trees to see them all.`, links };
  const text = matches
    .map((t) =>
      [
        `${t.name} (${t.scientificName}) — ${t.category}`,
        t.description,
        t.benefits.length ? `Benefits: ${t.benefits.join("; ")}` : "",
        `Planted on EcoQuest: ${t.totalPlanted.toLocaleString("en-PH")} of ${t.plantingGoal.toLocaleString("en-PH")} goal`,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");
  return { text, links: [...links, { label: "Shop Seedlings", href: "/shop" }] };
}

/** Closest command name for a typo (shared prefix or one edit away), so "/slot" suggests /slots. */
function closest(name: string) {
  const near = (a: string, b: string) => {
    if (a.startsWith(b) || b.startsWith(a)) return true;
    if (Math.abs(a.length - b.length) > 1) return false;
    let i = 0;
    while (i < a.length && a[i] === b[i]) i++;
    let j = 0;
    while (j < a.length - i && a.at(-1 - j) === b.at(-1 - j)) j++;
    return Math.max(a.length, b.length) - i - j <= 1;
  };
  return ASSISTANT_COMMANDS.find((c) => near(name, c.name))?.name ?? null;
}

/**
 * Answers a slash command from live data, or returns null when `input` isn't one. "/clear" is
 * handled by the chat box itself and never reaches here.
 */
export async function runCommand(userId: string, input: string): Promise<AssistantReply | null> {
  const command = parseCommand(input);
  if (!command) return null;
  const { name, arg } = command;
  switch (name) {
    case "help":
      return help();
    case "guide":
      return { text: GUIDE, links: [{ label: "Open Dashboard", href: "/dashboard" }] };
    case "slots":
      return slots(userId);
    case "prices":
      return prices(arg);
    case "rewards":
      return rewards();
    case "points":
      return points(userId);
    case "quests":
      return quests(userId);
    case "missions":
      return missions(userId);
    case "orders":
      return orders(userId);
    case "trees":
      return trees(arg);
    case "upload":
      return upload(userId);
    case "clear":
      return { text: "Chat cleared." };
    default: {
      const guess = closest(name);
      return { text: `I don't know /${name}.${guess ? ` Did you mean /${guess}?` : ""} Type /help to see every command.` };
    }
  }
}
