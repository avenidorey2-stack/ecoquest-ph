import { prisma } from "@/lib/prisma";
import { displayAvatar } from "@/lib/avatar-url";
import { blockedIds, isBlockedEitherWay, listBlocked } from "@/lib/blocks";
import { canSeePhotos, friendState, listFriends, nameMatchRank, pairKey, searchPlanters, type FriendState } from "@/lib/friends";
import { REPORT_REASONS } from "@/lib/moderation";
import { chatPartner, listConversations, MESSAGE_MAX, previewText } from "@/lib/messages";
import { COMMENT_MAX } from "@/lib/photo-social";
import { bundle, type ActionOutcome, type AssistantAction, type BatchItem, type PersonRef, type PhotoRef } from "./actions";

// Action cards about other planters: messages (send, unsend, delete a chat, message requests),
// friends, blocks, reports, and likes and comments on planting photos. The planter names someone ("message Demana"); the name is matched only
// among the people they could act on, and when it fits more than one, the choices go back to
// the AI to ask which one. Nothing is sent until the planter confirms on the card.

export const PERSON_ACTIONS = [
  "message",
  "unsend_message",
  "delete_chat",
  "accept_message_request",
  "delete_message_request",
  "add_friend",
  "remove_friend",
  "block",
  "unblock",
  "report",
  "like_photo",
  "unlike_photo",
  "comment_photo",
  "delete_comment",
] as const;
export type PersonAction = (typeof PERSON_ACTIONS)[number];

/** `all`: for unsend_message / delete_comment, every match instead of only the latest. */
export type PersonInput = { action: string; names?: string[]; userIds?: string[]; group?: string; text?: string; reason?: string; all?: boolean };
/** One person to find: by id, or by name. */
type PersonQuery = { name?: string; userId?: string };

type Found = PersonRef & { state: FriendState };
type ReportCard = Extract<AssistantAction, { kind: "report_user" }>;
type Candidate = { id: string; name: string | null; image: string | null; city: string | null; state: FriendState };
const profileLink = (id: string) => [{ label: "Open Profile", href: `/planters/${id}` }];

/**
 * The one person `name` (or `userId`) means among `pool`. Whole-name and start-of-name matches win
 * over matches inside a name; a tie means it's ambiguous, and the choices go back to the AI.
 */
function pick(pool: Candidate[], input: PersonQuery): { person: Found } | { error: string; choices?: unknown[] } {
  if (input.userId) {
    const hit = pool.find((p) => p.id === input.userId);
    return hit ? { person: toRef(hit) } : { error: "I couldn't find that planter." };
  }
  const q = (input.name ?? "").trim();
  if (!q) return { error: "Who? Ask the planter for the person's name." };
  const ranked = pool
    .filter((p) => (p.name ?? "").toLowerCase().includes(q.toLowerCase()))
    .map((p) => ({ p, rank: nameMatchRank(p.name ?? "", q) }))
    .sort((a, b) => a.rank - b.rank);
  if (!ranked.length) return { error: `I couldn't find anyone called "${q}".` };
  const best = ranked.filter((r) => r.rank === ranked[0].rank);
  if (best.length > 1) {
    return {
      error: `More than one planter is called "${q}". Ask which one (e.g. by city), then use their user_id.`,
      choices: ranked.slice(0, 6).map(({ p }) => ({ user_id: p.id, name: p.name, city: p.city, friend: p.state === "FRIENDS" })),
    };
  }
  return { person: toRef(best[0].p) };
}

const toRef = (p: Candidate): Found => ({ userId: p.id, name: p.name ?? "Anonymous Planter", image: p.image, city: p.city, state: p.state });

/** Planters the viewer can find: everyone in search (no blocks either way), plus friends and requests. */
async function anyone(viewerId: string, input: PersonQuery): Promise<Candidate[]> {
  if (input.userId) {
    if (input.userId === viewerId || (await isBlockedEitherWay(viewerId, input.userId))) return [];
    const u = await prisma.user.findFirst({
      where: { id: input.userId, role: "USER", bannedAt: null },
      select: { id: true, name: true, image: true, avatarUrl: true, city: true },
    });
    return u ? [{ id: u.id, name: u.name, image: displayAvatar(u), city: u.city, state: await friendState(viewerId, u.id) }] : [];
  }
  return searchPlanters(viewerId, input.name ?? "");
}

/** Friends and pending requests either way. */
async function circle(viewerId: string): Promise<Candidate[]> {
  const { friends, incoming, outgoing } = await listFriends(viewerId);
  return [...friends, ...incoming, ...outgoing];
}

/** People the viewer has a chat with (`requestsOnly`: message requests to them), with their friend state. */
async function chats(viewerId: string, requestsOnly = false): Promise<Candidate[]> {
  const [rows, { friends, incoming, outgoing }] = await Promise.all([listConversations(viewerId), listFriends(viewerId)]);
  const state = (id: string): FriendState =>
    friends.some((f) => f.id === id) ? "FRIENDS" : incoming.some((f) => f.id === id) ? "INCOMING" : outgoing.some((f) => f.id === id) ? "REQUESTED" : "NONE";
  return rows.filter((r) => !requestsOnly || r.request).map((r) => ({ id: r.partner.id, name: r.partner.name, image: r.partner.image, city: null, state: state(r.partner.id) }));
}

/** Whose chats each action looks in, instead of everyone the planter can find. */
const CHAT_ACTIONS: PersonAction[] = ["unsend_message", "delete_chat"];
const REQUEST_ACTIONS: PersonAction[] = ["accept_message_request", "delete_message_request"];

/** Most messages or comments one card offers to remove. */
const REMOVE_MAX = 50;
const clip = (s: string, n = 80) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * The planter's own messages to `person` (in what they can still see): those containing `text`,
 * every one (`all`), or else just the latest. Unsending removes them for both people.
 */
async function myMessages(viewerId: string, person: Found, text?: string, all?: boolean): Promise<BatchItem[] | string> {
  const convo = await prisma.conversation.findUnique({
    where: { pairKey: pairKey(viewerId, person.userId) },
    select: { id: true, members: { where: { userId: viewerId }, select: { clearedAt: true } } },
  });
  if (!convo) return `You have no chat with ${person.name}.`;
  const cleared = convo.members[0]?.clearedAt;
  const q = text?.trim();
  const rows = await prisma.directMessage.findMany({
    where: {
      conversationId: convo.id,
      senderId: viewerId,
      deletedAt: null,
      ...(cleared ? { createdAt: { gt: cleared } } : {}),
      ...(q ? { body: { contains: q, mode: "insensitive" as const } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: q || all ? REMOVE_MAX : 1,
    select: { id: true, body: true, mediaType: true, deletedAt: true, createdAt: true },
  });
  if (!rows.length) return q ? `You haven't sent ${person.name} a message with "${q}".` : `You have no messages to ${person.name} to unsend.`;
  const ref = strip(person);
  return rows.map((m) => ({ kind: "unsend_message", messageId: m.id, preview: clip(previewText(m, false)), sentAt: m.createdAt.toISOString(), ...ref }));
}

/**
 * Comments between the planter and `person` on planting photos: the planter's on theirs, and
 * theirs on the planter's (a photo's owner may delete any comment on it). Filtered like myMessages.
 */
async function commentsWith(viewerId: string, person: Found, text?: string, all?: boolean): Promise<BatchItem[] | string> {
  const q = text?.trim();
  const rows = await prisma.photoComment.findMany({
    where: {
      OR: [
        { authorId: viewerId, verification: { quest: { userId: person.userId } } },
        { authorId: person.userId, verification: { quest: { userId: viewerId } } },
      ],
      ...(q ? { body: { contains: q, mode: "insensitive" as const } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: q || all ? REMOVE_MAX : 1,
    select: { id: true, body: true, authorId: true },
  });
  if (!rows.length) return q ? `There's no comment with "${q}" between you and ${person.name}.` : `There are no comments between you and ${person.name} to delete.`;
  const ref = strip(person);
  return rows.map((c) => ({ kind: "delete_comment", commentId: c.id, body: clip(c.body), mine: c.authorId === viewerId, ...ref }));
}

/** The planter's latest approved planting photo the viewer may see. */
async function latestPhoto(viewerId: string, person: Found): Promise<{ photo: PhotoRef; liked: boolean; allowComments: boolean } | null> {
  const [owner, viewer] = await Promise.all([
    prisma.user.findUnique({ where: { id: person.userId }, select: { id: true, photoVisibility: true, allowComments: true } }),
    prisma.user.findUnique({ where: { id: viewerId }, select: { id: true, role: true } }),
  ]);
  if (!owner || !viewer || !(await canSeePhotos(owner, viewer))) return null;
  const v = await prisma.verification.findFirst({
    where: { status: "APPROVED", quest: { userId: owner.id } },
    orderBy: [{ reviewedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    select: { id: true, mediaUrl: true, mediaType: true, likes: { where: { userId: viewerId }, select: { userId: true } } },
  });
  if (!v) return null;
  return {
    photo: { photoId: v.id, ownerId: owner.id, ownerName: person.name, mediaUrl: v.mediaUrl, isVideo: v.mediaType.startsWith("video/") },
    liked: v.likes.length > 0,
    allowComments: owner.allowComments,
  };
}

/** Group targets: everyone in it, instead of naming people. requests_* are friend requests. */
export const PERSON_GROUPS = ["friends", "requests_to_me", "requests_i_sent", "chats", "message_requests"] as const;
export type PersonGroup = (typeof PERSON_GROUPS)[number];

/** Most people per card: kept under each route's rate limit so a batch can't trip it. */
const CAPS: Partial<Record<PersonAction, number>> = { message: 30, add_friend: 20, comment_photo: 20 };

/**
 * Cards for one action on one or more planters: named ones (`names` / `userIds`) or a whole
 * `group`. Two or more become one "allow all" card. A report is about one planter at a time.
 */
export async function personAction(viewerId: string, input: PersonInput): Promise<ActionOutcome> {
  const action = input.action as PersonAction;
  if (!PERSON_ACTIONS.includes(action)) return { error: `Unknown action. Use one of: ${PERSON_ACTIONS.join(", ")}.` };
  const aboutChats = CHAT_ACTIONS.includes(action) || REQUEST_ACTIONS.includes(action);
  const links = [aboutChats ? { label: "Open Messages", href: "/messages" } : { label: "Open Friends", href: "/friends" }];

  // Who it's about: a group, or each name / id given.
  const targets: Found[] = [];
  const skipped: string[] = [];
  const choices: unknown[] = [];
  if (input.group) {
    if (!PERSON_GROUPS.includes(input.group as PersonGroup)) return { error: `Unknown group. Use one of: ${PERSON_GROUPS.join(", ")}.` };
    let group: Candidate[];
    if (input.group === "chats" || input.group === "message_requests") {
      group = await chats(viewerId, input.group === "message_requests");
    } else {
      const { friends, incoming, outgoing } = await listFriends(viewerId);
      group = input.group === "friends" ? friends : input.group === "requests_to_me" ? incoming : outgoing;
    }
    if (!group.length) {
      const what = {
        friends: "You have no friends on EcoQuest yet.",
        requests_to_me: "No one has sent you a friend request.",
        requests_i_sent: "You have no friend requests waiting.",
        chats: "You have no chats.",
        message_requests: "You have no message requests.",
      }[input.group as PersonGroup];
      return { error: what, links };
    }
    targets.push(...group.map(toRef));
  } else {
    const refs = [...(input.userIds ?? []).map((userId) => ({ userId })), ...(input.names ?? []).map((name) => ({ name }))];
    if (!refs.length) return { error: "Who? Ask the planter for the person's name." };
    if (action === "report" && refs.length > 1) return { error: "Reports are one planter at a time. Ask which one to report first." };
    const blocked =
      action === "unblock" ? (await listBlocked(viewerId)).map((b): Candidate => ({ id: b.id, name: b.name, image: b.image, city: null, state: "NONE" })) : null;
    const mine = action === "remove_friend" ? await circle(viewerId) : null;
    const talked = CHAT_ACTIONS.includes(action) ? await chats(viewerId) : REQUEST_ACTIONS.includes(action) ? await chats(viewerId, true) : null;
    for (const ref of refs) {
      // Unblocking: only people they blocked. Unfriending: only friends and requests. Chats and
      // message requests: only people they have one with. Otherwise anyone they can find.
      const pool = blocked ?? mine ?? talked ?? (await anyone(viewerId, ref));
      const found = pick(pool, ref);
      if ("person" in found) {
        if (!targets.some((t) => t.userId === found.person.userId)) targets.push(found.person);
      } else {
        const hint =
          action === "unblock"
            ? " (Only people you blocked can be unblocked.)"
            : CHAT_ACTIONS.includes(action)
              ? " (Looked among your chats.)"
              : REQUEST_ACTIONS.includes(action)
                ? " (Looked among your message requests.)"
                : "";
        skipped.push(found.error + hint);
        if (found.choices) choices.push(...found.choices);
      }
    }
  }

  const items: BatchItem[] = [];
  let report: ReportCard | null = null;
  for (const person of targets) {
    const made = await cardFor(viewerId, action, person, input);
    if (typeof made === "string") skipped.push(made);
    else if (Array.isArray(made)) items.push(...made);
    else if (made.kind === "report_user") report = made;
    else items.push(made);
  }
  if (report) return { action: report };
  if (!items.length && choices.length) return { error: skipped.join(" "), choices, links };
  // One person and it can't be done: their profile is the place to look.
  return bundle(items, skipped, "Nothing to do.", targets.length === 1 && !items.length ? profileLink(targets[0].userId) : links, CAPS[action]);
}

/** The card for `action` on one planter (several for messages or comments), or why it can't be done. */
async function cardFor(viewerId: string, action: PersonAction, person: Found, input: PersonInput): Promise<BatchItem | BatchItem[] | ReportCard | string> {
  const ref = strip(person);
  switch (action) {
    case "unsend_message":
      return myMessages(viewerId, person, input.text, input.all);
    case "delete_chat":
      return { kind: "delete_chat", ...ref };
    case "accept_message_request":
    case "delete_message_request":
      return { kind: "message_request", accept: action === "accept_message_request", ...ref };
    case "delete_comment":
      return commentsWith(viewerId, person, input.text, input.all);
    case "message": {
      // Friends, an open chat, or a message request (if they take requests) — as in Messages.
      const partner = await chatPartner(viewerId, person.userId);
      if (!partner) return `I couldn't find ${person.name}.`;
      if (!partner.canSend) return partner.reason ?? `You can't message ${person.name}.`;
      const request = !partner.friends && (!partner.hasChat || partner.request === "outgoing");
      return { kind: "send_message", text: (input.text ?? "").slice(0, MESSAGE_MAX), ...(request ? { request: true } : {}), ...ref };
    }
    case "add_friend":
      if (person.state === "FRIENDS") return `You and ${person.name} are already friends.`;
      if (person.state === "REQUESTED") return `You already sent ${person.name} a friend request. It's waiting for them.`;
      return { kind: "add_friend", accept: person.state === "INCOMING", ...ref };
    case "remove_friend":
      if (person.state === "NONE" || person.state === "SELF") return `${person.name} isn't your friend.`;
      return { kind: "remove_friend", state: person.state, ...ref };
    case "block":
      return { kind: "block_user", block: true, ...ref };
    case "unblock":
      return { kind: "block_user", block: false, ...ref };
    case "report": {
      const reason = input.reason && input.reason in REPORT_REASONS ? input.reason : null;
      return {
        kind: "report_user",
        reason,
        details: (input.text ?? "").slice(0, 500),
        reasons: Object.entries(REPORT_REASONS).map(([value, label]) => ({ value, label })),
        ...ref,
      };
    }
    case "like_photo":
    case "unlike_photo":
    case "comment_photo": {
      const latest = await latestPhoto(viewerId, person);
      if (!latest) return `${person.name} has no planting photos you can see.`;
      if (action === "comment_photo") {
        if (!latest.allowComments) return `${person.name} has turned off comments on their photos.`;
        return { kind: "comment_photo", text: (input.text ?? "").slice(0, COMMENT_MAX), ...latest.photo };
      }
      const like = action === "like_photo";
      if (latest.liked === like) return `You ${like ? "already liked" : "haven't liked"} ${person.name}'s latest photo.`;
      return { kind: "like_photo", liked: like, ...latest.photo };
    }
  }
}


/** The card only needs who it is, not the friend state. */
const strip = ({ state: _state, ...ref }: Found): PersonRef => ref; // eslint-disable-line @typescript-eslint/no-unused-vars

/** The planter's chats, latest first, for "who messaged me?" and to find people to act on. */
export async function myChats(viewerId: string) {
  const rows = await listConversations(viewerId);
  return {
    chats: rows.slice(0, 20).map((r) => ({
      user_id: r.partner.id,
      name: r.partner.name,
      lastMessage: r.preview,
      at: r.lastMessageAt,
      unread: r.unread,
      ...(r.request ? { messageRequest: true } : {}),
      ...(r.pending ? { yourRequestNotAcceptedYet: true } : {}),
    })),
    total: rows.length,
  };
}

/** The planter's friends and requests, for the AI to answer "who are my friends?" and to find people. */
export async function myFriends(viewerId: string) {
  const { friends, incoming, outgoing } = await listFriends(viewerId);
  const view = (p: { id: string; name: string; city: string | null }) => ({ user_id: p.id, name: p.name, city: p.city });
  const hidden = await blockedIds(viewerId);
  return { friends: friends.map(view), requestsToYou: incoming.map(view), requestsYouSent: outgoing.map(view), blockedCount: hidden.length };
}
