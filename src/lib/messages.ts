import { prisma } from "@/lib/prisma";
import { areFriends, listFriends, pairKey } from "@/lib/friends";
import { blockedIds, isBlockedEitherWay } from "@/lib/blocks";
import { displayAvatar } from "@/lib/avatar-url";
import { messageText } from "@/lib/chat-attachments";
import { chatMedia, type StoredMedia } from "@/lib/storage";
import { visiblePresence, type Presence } from "@/lib/active-status";
import { queuePush } from "@/lib/push";

// Messages between friends: one conversation per pair of planters, text and/or a photo or video.
// Only friends can send; the history stays readable after unfriending, and disappears for both
// while either has blocked the other. Senders can unsend (the text and file are wiped for both).
// A message can reply to an earlier one, and friends can react to any message with an emoji.
// New messages and reactions ping both members' live channel from the database (migrations
// 20261007090000_direct_messages, 20261008090000_chat_reactions_push); apps without the live
// connection poll instead. The friend also gets a phone push if they turned that on.

export const MESSAGE_MAX = 2000;
/** Messages per page of a chat (older ones load on demand). */
export const THREAD_PAGE = 50;
export const SENDS_PER_MINUTE = 30;
export const REACTS_PER_MINUTE = 60;
/** While online, lastActiveAt is written at most this often per user (the app checks in every 30 s). */
const ACTIVE_WRITE_MS = 20_000;
/** Reactions, like Messenger's. One per person per message. */
export const REACTIONS = ["❤️", "😆", "😮", "😢", "😠", "👍"] as const;

export const chatPath = (userId: string) => `/messages/${userId}`;
/** Upload scope: a file uploaded by `senderId` for the chat with `otherId` can't be sent elsewhere. */
export const dmScope = (senderId: string, otherId: string) => `dm:${senderId}:${otherId}`;

type Fail = { ok: false; status: number; error: string };
const fail = (status: number, error: string): Fail => ({ ok: false, status, error });

const personSelect = { id: true, name: true, image: true, avatarUrl: true, lastActiveAt: true, isOnline: true, showActiveStatus: true } as const;

/** Records that the user has the app open (throttled while they stay online). */
export async function touchActive(userId: string, now = new Date()) {
  await prisma.user.updateMany({
    where: {
      id: userId,
      OR: [{ isOnline: false }, { lastActiveAt: null }, { lastActiveAt: { lt: new Date(now.getTime() - ACTIVE_WRITE_MS) } }],
    },
    data: { lastActiveAt: now, isOnline: true },
  });
}

/** The user closed or left the app: friends now see "Active 1m ago", counting from now. */
export async function markAway(userId: string, now = new Date()) {
  await prisma.user.updateMany({ where: { id: userId, isOnline: true }, data: { lastActiveAt: now, isOnline: false } });
}

export type ChatPartner = { id: string; name: string; image: string | null; canSend: boolean } & Presence;

/**
 * The planter `viewerId` would chat with, or null if there is no such planter or either has
 * blocked the other. `canSend`: only friends can send messages.
 */
export async function chatPartner(viewerId: string, otherId: string): Promise<ChatPartner | null> {
  if (viewerId === otherId) return null;
  const other = await prisma.user.findFirst({ where: { id: otherId, role: "USER" }, select: personSelect });
  if (!other || (await isBlockedEitherWay(viewerId, otherId))) return null;
  const friends = await areFriends(viewerId, otherId);
  return { id: other.id, name: other.name ?? "Anonymous Planter", image: displayAvatar(other), ...visiblePresence(other, friends), canSend: friends };
}

type Media = { url: string; type: string };
/** The message a reply quotes: whose it is and a one-line preview (or that it was unsent). */
export type QuotedMessage = { id: string; mine: boolean; preview: string; deleted: boolean; media: Media | null };
export type ReactionView = { emoji: string; mine: boolean };

export type ChatMessage = {
  id: string;
  mine: boolean;
  body: string;
  media: Media | null;
  createdAt: string;
  deleted: boolean;
  replyTo: QuotedMessage | null;
  reactions: ReactionView[];
};

const mediaOf = (m: { mediaKey: string | null; mediaType: string | null }) =>
  m.mediaKey && m.mediaType ? { url: chatMedia.urlFor(m.mediaKey), type: m.mediaType } : null;

const messageInclude = {
  replyTo: { select: { id: true, senderId: true, body: true, mediaKey: true, mediaType: true, deletedAt: true } },
  reactions: { orderBy: { createdAt: "asc" }, select: { userId: true, emoji: true } },
} as const;

type Row = { senderId: string; body: string; mediaKey: string | null; mediaType: string | null; deletedAt: Date | null };
type MessageRow = Row & {
  id: string;
  createdAt: Date;
  replyTo: (Row & { id: string }) | null;
  reactions: { userId: string; emoji: string }[];
};

function toChat(viewerId: string) {
  return (m: MessageRow): ChatMessage => {
    const q = m.deletedAt ? null : m.replyTo; // an unsent message no longer shows what it replied to
    return {
      id: m.id,
      mine: m.senderId === viewerId,
      body: m.body,
      media: mediaOf(m),
      createdAt: m.createdAt.toISOString(),
      deleted: !!m.deletedAt,
      replyTo: q && { id: q.id, mine: q.senderId === viewerId, preview: previewText(q, false), deleted: !!q.deletedAt, media: mediaOf(q) },
      reactions: m.deletedAt ? [] : m.reactions.map((r) => ({ emoji: r.emoji, mine: r.userId === viewerId })),
    };
  };
}

/**
 * A page of the chat with `otherId`, oldest first. Without `before` it's the latest page, and
 * opening it marks the chat read. `seenAt`: when the other person last read it.
 */
export async function getThread(viewerId: string, otherId: string, { before }: { before?: string } = {}) {
  const partner = await chatPartner(viewerId, otherId);
  if (!partner) return null;
  const convo = await prisma.conversation.findUnique({
    where: { pairKey: pairKey(viewerId, otherId) },
    select: { id: true, members: { where: { userId: otherId }, select: { lastReadAt: true } } },
  });
  if (!convo) return { partner, messages: [] as ChatMessage[], hasMore: false, seenAt: null };

  const rows = await prisma.directMessage.findMany({
    where: { conversationId: convo.id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: messageInclude,
    take: THREAD_PAGE + 1,
    ...(before ? { cursor: { id: before }, skip: 1 } : {}),
  });
  if (!before) {
    await prisma.conversationMember.updateMany({
      where: { conversationId: convo.id, userId: viewerId },
      data: { unreadCount: 0, lastReadAt: new Date() },
    });
  }
  return {
    partner,
    messages: rows.slice(0, THREAD_PAGE).reverse().map(toChat(viewerId)),
    hasMore: rows.length > THREAD_PAGE,
    seenAt: convo.members[0]?.lastReadAt?.toISOString() ?? null,
  };
}

export type Thread = NonNullable<Awaited<ReturnType<typeof getThread>>>;

/** Whether `senderId` may message `otherId` right now: friends, and no block either way. */
export async function canMessage(senderId: string, otherId: string): Promise<Fail | null> {
  const partner = await chatPartner(senderId, otherId);
  if (!partner) return fail(404, "Planter not found.");
  if (!partner.canSend) return fail(403, "You can only message friends.");
  return null;
}

/**
 * Sends a message (text and/or an already stored photo/video), optionally replying to an
 * earlier message in the same chat. Checks `canMessage` first. The friend also gets a push.
 */
export async function sendDirectMessage(senderId: string, otherId: string, rawBody: unknown, media: StoredMedia | null, rawReplyTo?: unknown) {
  const body = messageText(rawBody, !!media, MESSAGE_MAX);
  if (typeof body !== "string") return body;
  const denied = await canMessage(senderId, otherId);
  if (denied) return denied;

  const key = pairKey(senderId, otherId);
  let replyToId: string | null = null;
  if (rawReplyTo != null && rawReplyTo !== "") {
    if (typeof rawReplyTo !== "string") return fail(400, "Invalid reply.");
    const original = await prisma.directMessage.findFirst({ where: { id: rawReplyTo, conversation: { pairKey: key } }, select: { id: true } });
    if (!original) return fail(404, "The message you're replying to isn't in this chat.");
    replyToId = original.id;
  }

  const save = () =>
    prisma.$transaction(async (tx) => {
      const now = new Date();
      const convo = await tx.conversation.upsert({
        where: { pairKey: key },
        create: { pairKey: key, lastMessageAt: now, members: { create: [{ userId: senderId, lastReadAt: now }, { userId: otherId }] } },
        update: { lastMessageAt: now },
        select: { id: true },
      });
      // Members first: the database's live ping (on the message insert) goes to them.
      await tx.conversationMember.update({
        where: { conversationId_userId: { conversationId: convo.id, userId: otherId } },
        data: { unreadCount: { increment: 1 } },
      });
      await tx.conversationMember.update({
        where: { conversationId_userId: { conversationId: convo.id, userId: senderId } },
        data: { unreadCount: 0, lastReadAt: now },
      });
      return tx.directMessage.create({
        data: { conversationId: convo.id, senderId, body, mediaKey: media?.key, mediaType: media?.type, replyToId },
        include: messageInclude,
      });
    });

  let message;
  try {
    message = await save();
  } catch (err) {
    // Both sent a first message at the same moment: the other created the conversation — retry.
    const target = String((err as { meta?: { target?: unknown } }).meta?.target ?? "");
    if ((err as { code?: string }).code !== "P2002" || target.includes("mediaKey")) throw err;
    message = await save();
  }
  await touchActive(senderId);
  const sender = await prisma.user.findUnique({ where: { id: senderId }, select: { name: true } });
  queuePush(otherId, { title: sender?.name ?? "A planter", body: previewText(message, false), url: chatPath(senderId), tag: `dm:${senderId}` });
  return { ok: true as const, message: toChat(senderId)(message) };
}

/**
 * `viewerId` reacts to a message in their chat with `otherId`, or removes their reaction
 * (`emoji` null). Friends only, like sending; unsent messages can't be reacted to. Returns the
 * message's reactions. The author gets a push when someone else reacts.
 */
export async function reactToMessage(viewerId: string, otherId: string, messageId: string, emoji: unknown) {
  if (emoji !== null && !REACTIONS.includes(emoji as (typeof REACTIONS)[number])) return fail(400, "Choose a reaction.");
  const denied = await canMessage(viewerId, otherId);
  if (denied) return denied;
  const msg = await prisma.directMessage.findFirst({
    where: { id: messageId, conversation: { pairKey: pairKey(viewerId, otherId) } },
    select: { senderId: true, body: true, mediaType: true, deletedAt: true },
  });
  if (!msg || msg.deletedAt) return fail(404, "Message not found.");

  if (emoji === null) {
    await prisma.messageReaction.deleteMany({ where: { messageId, userId: viewerId } });
  } else {
    const where = { messageId_userId: { messageId, userId: viewerId } };
    const before = await prisma.messageReaction.findUnique({ where, select: { emoji: true } });
    await prisma.messageReaction.upsert({ where, create: { messageId, userId: viewerId, emoji: emoji as string }, update: { emoji: emoji as string } });
    if (msg.senderId !== viewerId && before?.emoji !== emoji) {
      const me = await prisma.user.findUnique({ where: { id: viewerId }, select: { name: true } });
      const what = msg.body ? `: “${msg.body.length > 60 ? `${msg.body.slice(0, 57)}…` : msg.body}”` : msg.mediaType?.startsWith("video/") ? " (video)" : " (photo)";
      queuePush(msg.senderId, { title: me?.name ?? "A planter", body: `Reacted ${emoji} to your message${what}`, url: chatPath(viewerId), tag: `dm:${viewerId}` });
    }
  }
  const reactions = await prisma.messageReaction.findMany({ where: { messageId }, orderBy: { createdAt: "asc" }, select: { userId: true, emoji: true } });
  return { ok: true as const, reactions: reactions.map((r) => ({ emoji: r.emoji, mine: r.userId === viewerId })) };
}

/** The sender unsends a message: its text, file and reactions are removed for both; a stub stays. */
export async function unsendDirectMessage(viewerId: string, messageId: string) {
  const msg = await prisma.directMessage.findUnique({
    where: { id: messageId },
    select: { senderId: true, conversationId: true, mediaKey: true, deletedAt: true, createdAt: true },
  });
  if (!msg || msg.senderId !== viewerId) return fail(404, "Message not found.");
  if (msg.deletedAt) return { ok: true as const };

  await prisma.$transaction(async (tx) => {
    // If the other person hadn't read it yet, it no longer counts as unread.
    await tx.conversationMember.updateMany({
      where: {
        conversationId: msg.conversationId,
        userId: { not: viewerId },
        unreadCount: { gt: 0 },
        OR: [{ lastReadAt: null }, { lastReadAt: { lt: msg.createdAt } }],
      },
      data: { unreadCount: { decrement: 1 } },
    });
    await tx.messageReaction.deleteMany({ where: { messageId } });
    await tx.directMessage.update({
      where: { id: messageId },
      data: { deletedAt: new Date(), body: "", mediaKey: null, mediaType: null },
    });
  });
  // Files go only after the database commit; a failed removal leaves an orphan, nothing worse.
  if (msg.mediaKey) await chatMedia.remove(msg.mediaKey).catch(() => {});
  return { ok: true as const };
}

/** One-line preview of a message for the chat list and pop-ups. */
export function previewText(m: { body: string; mediaType: string | null; deletedAt: Date | null }, mine: boolean) {
  if (m.deletedAt) return mine ? "You unsent a message" : "Message unsent";
  const text = m.body || (m.mediaType?.startsWith("video/") ? "Sent a video" : m.mediaType ? "Sent a photo" : "");
  return mine ? `You: ${text}` : text;
}

export type ConversationRow = {
  partner: { id: string; name: string; image: string | null } & Presence;
  preview: string;
  lastMessageAt: string;
  unread: number;
};

/** The user's chats, latest first (chats with someone blocked either way are hidden). */
export async function listConversations(viewerId: string): Promise<ConversationRow[]> {
  const hidden = await blockedIds(viewerId);
  const [rows, friendRows] = await Promise.all([
    prisma.conversationMember.findMany({
      where: { userId: viewerId, conversation: { members: { none: { userId: { in: hidden } } } } },
      orderBy: { conversation: { lastMessageAt: "desc" } },
      take: 100,
      select: {
        unreadCount: true,
        conversation: {
          select: {
            lastMessageAt: true,
            members: { where: { userId: { not: viewerId } }, select: { user: { select: personSelect } } },
            messages: { orderBy: { createdAt: "desc" }, take: 1, select: { senderId: true, body: true, mediaType: true, deletedAt: true } },
          },
        },
      },
    }),
    prisma.friendship.findMany({
      where: { status: "ACCEPTED", OR: [{ requesterId: viewerId }, { addresseeId: viewerId }] },
      select: { requesterId: true, addresseeId: true },
    }),
  ]);
  const friendIds = new Set(friendRows.map((f) => (f.requesterId === viewerId ? f.addresseeId : f.requesterId)));

  return rows.flatMap(({ unreadCount, conversation: c }) => {
    const other = c.members[0]?.user;
    const last = c.messages[0];
    if (!other || !last) return [];
    return [
      {
        partner: { id: other.id, name: other.name ?? "Anonymous Planter", image: displayAvatar(other), ...visiblePresence(other, friendIds.has(other.id)) },
        preview: previewText(last, last.senderId === viewerId),
        lastMessageAt: c.lastMessageAt.toISOString(),
        unread: unreadCount,
      },
    ];
  });
}

/** Friends to start a chat with: online ones first, then most recently active. */
export async function chatFriends(viewerId: string) {
  const { friends } = await listFriends(viewerId);
  return friends.sort((a, b) => Number(b.online) - Number(a.online) || (b.activeAt ?? "").localeCompare(a.activeAt ?? ""));
}

/**
 * For the header's Messages badge: how many chats have unread messages, and the newest unread
 * message (for the pop-up). Also records that the user is active.
 */
export async function unreadSummary(viewerId: string) {
  const hidden = await blockedIds(viewerId);
  const visible = { members: { none: { userId: { in: hidden } } } };
  const [unread, latest] = await Promise.all([
    prisma.conversationMember.count({ where: { userId: viewerId, unreadCount: { gt: 0 }, conversation: visible } }),
    prisma.directMessage.findFirst({
      where: {
        senderId: { notIn: [viewerId, ...hidden] },
        deletedAt: null,
        conversation: { members: { some: { userId: viewerId, unreadCount: { gt: 0 } } } },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, body: true, mediaType: true, deletedAt: true, createdAt: true, sender: { select: { id: true, name: true } } },
    }),
    touchActive(viewerId),
  ]);
  return {
    unread,
    latest: latest && {
      id: latest.id,
      fromId: latest.sender.id,
      fromName: latest.sender.name ?? "A planter",
      preview: previewText(latest, false),
      createdAt: latest.createdAt.toISOString(),
    },
  };
}
