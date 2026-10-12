import { prisma } from "@/lib/prisma";
import { areFriends, listFriends, pairKey } from "@/lib/friends";
import { blockedIds, isBlockedEitherWay } from "@/lib/blocks";
import { displayAvatar } from "@/lib/avatar-url";
import { messageText } from "@/lib/chat-attachments";
import { chatMedia, type StoredMedia } from "@/lib/storage";
import { visiblePresence, type Presence } from "@/lib/active-status";
import { queuePush } from "@/lib/push";
import { hitRateLimit } from "@/lib/rate-limit";
import { isReaction } from "@/lib/reactions";
import { mediaKind } from "@/lib/media-rules";

// Messages between planters: one conversation per pair, text and/or a photo, video or voice
// message. Friends chat freely. Anyone else can write too (unless the person turned message
// requests off): the first message makes a message request, which the other person sees under
// Requests — with photos, videos and voice hidden — until they reply or accept, like Messenger.
// Deleting a request hides it for them until a newer message. Deleting a chat does the same and
// also clears its earlier messages for them only (the other person keeps theirs). Chats disappear
// for both while either has blocked the other. Senders can unsend (the text and file are wiped for both).
// A message can reply to an earlier one, and friends can react to any message with an emoji.
// New messages and reactions ping both members' live channel from the database (migrations
// 20261007090000_direct_messages, 20261008090000_chat_reactions_push); apps without the live
// connection poll instead. The friend also gets a phone push if they turned that on.

export const MESSAGE_MAX = 2000;
/** Messages per page of a chat (older ones load on demand). */
export const THREAD_PAGE = 50;
export const SENDS_PER_MINUTE = 30;
/** New message requests (chats with planters who aren't friends) one planter can start per day. */
export const NEW_REQUESTS_PER_DAY = 20;
export const REACTS_PER_MINUTE = 60;
/** While online, lastActiveAt is written at most this often per user (the app checks in every 30 s). */
const ACTIVE_WRITE_MS = 20_000;

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

export type ChatPartner = {
  id: string;
  name: string;
  image: string | null;
  canSend: boolean;
  /** Why the viewer can't send (when `canSend` is false). */
  reason: string | null;
  friends: boolean;
  /** They have a conversation already (a chat, or a request either way). */
  hasChat: boolean;
  /** A message request between them: "incoming" (they wrote first) or "outgoing" (the viewer did). */
  request: "incoming" | "outgoing" | null;
} & Presence;

/**
 * The planter `viewerId` would chat with, or null if there is no such planter or either has
 * blocked the other. They can send when they're friends, when it's an existing chat or a request
 * the other person started (replying accepts it), or when the other person takes message requests.
 */
export async function chatPartner(viewerId: string, otherId: string): Promise<ChatPartner | null> {
  if (viewerId === otherId) return null;
  const other = await prisma.user.findFirst({ where: { id: otherId, role: "USER" }, select: { ...personSelect, allowMessageRequests: true } });
  if (!other || (await isBlockedEitherWay(viewerId, otherId))) return null;
  const [friends, convo] = await Promise.all([
    areFriends(viewerId, otherId),
    prisma.conversation.findUnique({ where: { pairKey: pairKey(viewerId, otherId) }, select: { requestedById: true } }),
  ]);
  const name = other.name ?? "Anonymous Planter";
  const request = friends || !convo?.requestedById ? null : convo.requestedById === viewerId ? "outgoing" : "incoming";
  // A chat already accepted, or their request (replying accepts it), stays open either way.
  const canSend = friends || (!!convo && convo.requestedById !== viewerId) || other.allowMessageRequests;
  return {
    id: other.id,
    name,
    image: displayAvatar(other),
    ...visiblePresence(other, friends),
    canSend,
    reason: canSend ? null : `${name} only gets messages from friends. Add them as a friend to chat.`,
    friends,
    hasChat: !!convo,
    request,
  };
}

type Media = { url: string; type: string };
/** The message a reply quotes: whose it is and a one-line preview (or that it was unsent). */
export type QuotedMessage = { id: string; mine: boolean; preview: string; deleted: boolean; media: Media | null };
/** A photo, video or voice message held back until a message request is accepted. */
export type HiddenMedia = "photo" | "video" | "voice";
export type ReactionView = { emoji: string; mine: boolean };

export type ChatMessage = {
  id: string;
  mine: boolean;
  body: string;
  media: Media | null;
  /** Set instead of `media` in a message request the viewer hasn't accepted yet. */
  hiddenMedia?: HiddenMedia;
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

/** `hideFrom`: in a request the viewer hasn't accepted, that planter's files stay hidden. */
function toChat(viewerId: string, hideFrom: string | null = null) {
  const visible = (m: Row) => (hideFrom && m.senderId === hideFrom ? null : mediaOf(m));
  return (m: MessageRow): ChatMessage => {
    const q = m.deletedAt ? null : m.replyTo; // an unsent message no longer shows what it replied to
    const hidden = hideFrom && m.senderId === hideFrom && m.mediaType ? mediaKind(m.mediaType) : null;
    return {
      id: m.id,
      mine: m.senderId === viewerId,
      body: m.body,
      media: visible(m),
      ...(hidden ? { hiddenMedia: hidden } : {}),
      createdAt: m.createdAt.toISOString(),
      deleted: !!m.deletedAt,
      replyTo: q && { id: q.id, mine: q.senderId === viewerId, preview: previewText(q, false), deleted: !!q.deletedAt, media: visible(q) },
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
    select: { id: true, members: { select: { userId: true, lastReadAt: true, clearedAt: true } } },
  });
  if (!convo) return { partner, messages: [] as ChatMessage[], hasMore: false, seenAt: null };
  const incoming = partner.request === "incoming";
  const them = convo.members.find((m) => m.userId === otherId);
  // A chat the viewer deleted starts again from then.
  const clearedAt = convo.members.find((m) => m.userId === viewerId)?.clearedAt;

  const rows = await prisma.directMessage.findMany({
    where: { conversationId: convo.id, ...(clearedAt ? { createdAt: { gt: clearedAt } } : {}) },
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
    messages: rows.slice(0, THREAD_PAGE).reverse().map(toChat(viewerId, incoming ? otherId : null)),
    hasMore: rows.length > THREAD_PAGE,
    // A request isn't marked "Seen" for the sender until it's accepted.
    seenAt: partner.request === "outgoing" ? null : (them?.lastReadAt?.toISOString() ?? null),
  };
}

export type Thread = NonNullable<Awaited<ReturnType<typeof getThread>>>;

/** Whether `senderId` may message `otherId` right now (see chatPartner), and no block either way. */
export async function canMessage(senderId: string, otherId: string): Promise<Fail | null> {
  const partner = await chatPartner(senderId, otherId);
  if (!partner) return fail(404, "Planter not found.");
  if (!partner.canSend) return fail(403, partner.reason ?? "You can't message this planter.");
  return null;
}

/**
 * Sends a message (text and/or an already stored photo/video/voice), optionally replying to an
 * earlier message in the same chat. Checks chatPartner first. A first message to someone who
 * isn't a friend starts a message request; the other person replying accepts it. The other
 * person gets a push (for a request, only for its first message).
 */
export async function sendDirectMessage(senderId: string, otherId: string, rawBody: unknown, media: StoredMedia | null, rawReplyTo?: unknown) {
  const body = messageText(rawBody, !!media, MESSAGE_MAX);
  if (typeof body !== "string") return body;
  const partner = await chatPartner(senderId, otherId);
  if (!partner) return fail(404, "Planter not found.");
  if (!partner.canSend) return fail(403, partner.reason ?? "You can't message this planter.");

  const key = pairKey(senderId, otherId);
  const existing = await prisma.conversation.findUnique({ where: { pairKey: key }, select: { id: true } });
  // Starting a chat with someone who isn't a friend: capped per day, against spam.
  if (!existing && !partner.friends && !(await hitRateLimit(`dm-request:${senderId}`, NEW_REQUESTS_PER_DAY, 24 * 60 * 60 * 1000))) {
    return fail(429, "You've started a lot of new chats today. Please try again tomorrow, or message your friends.");
  }
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
        create: {
          pairKey: key,
          lastMessageAt: now,
          requestedById: partner.friends ? null : senderId,
          members: { create: [{ userId: senderId, lastReadAt: now }, { userId: otherId }] },
        },
        update: { lastMessageAt: now },
        select: { id: true, requestedById: true },
      });
      // Replying to their request accepts it.
      if (convo.requestedById && (convo.requestedById !== senderId || partner.friends)) {
        await tx.conversation.update({ where: { id: convo.id }, data: { requestedById: null } });
      }
      // Members first: the database's live ping (on the message insert) goes to them.
      await tx.conversationMember.update({
        where: { conversationId_userId: { conversationId: convo.id, userId: otherId } },
        data: { unreadCount: { increment: 1 } },
      });
      await tx.conversationMember.update({
        where: { conversationId_userId: { conversationId: convo.id, userId: senderId } },
        data: { unreadCount: 0, lastReadAt: now, hiddenAt: null },
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
  const title = sender?.name ?? "A planter";
  if (!existing && !partner.friends) {
    // A new request: one quiet heads-up, and no preview of a stranger's message.
    queuePush(otherId, { title, body: "Sent you a message request", url: chatPath(senderId), tag: `dm:${senderId}` });
  } else if (partner.request !== "outgoing") {
    queuePush(otherId, { title, body: previewText(message, false), url: chatPath(senderId), tag: `dm:${senderId}` });
  }
  return { ok: true as const, message: toChat(senderId)(message) };
}

/**
 * `viewerId` reacts to a message in their chat with `otherId`, or removes their reaction
 * (`emoji` null). Friends only, like sending; unsent messages can't be reacted to. Returns the
 * message's reactions. The author gets a push when someone else reacts.
 */
export async function reactToMessage(viewerId: string, otherId: string, messageId: string, emoji: unknown) {
  // One reaction per person per message, from the app's list (lib/reactions).
  if (emoji !== null && !isReaction(emoji)) return fail(400, "Choose a reaction.");
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
      const what = msg.body ? `: “${msg.body.length > 60 ? `${msg.body.slice(0, 57)}…` : msg.body}”` : ` (${{ photo: "photo", video: "video", voice: "voice message" }[mediaKind(msg.mediaType ?? "")]})`;
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
  const text = m.body || (m.mediaType ? `Sent a ${{ photo: "photo", video: "video", voice: "voice message" }[mediaKind(m.mediaType)]}` : "");
  return mine ? `You: ${text}` : text;
}

export type ConversationRow = {
  partner: { id: string; name: string; image: string | null } & Presence;
  preview: string;
  lastMessageAt: string;
  unread: number;
  /** A message request to the viewer (shown under Requests, not Chats). */
  request?: boolean;
  /** The viewer's own request, not accepted yet. */
  pending?: boolean;
};

/** The viewer accepts `otherId`'s message request: it becomes a normal chat. */
export async function acceptRequest(viewerId: string, otherId: string) {
  if (await isBlockedEitherWay(viewerId, otherId)) return fail(404, "Message request not found.");
  const { count } = await prisma.conversation.updateMany({ where: { pairKey: pairKey(viewerId, otherId), requestedById: otherId }, data: { requestedById: null } });
  if (!count) return fail(404, "Message request not found.");
  await prisma.conversationMember.updateMany({ where: { conversation: { pairKey: pairKey(viewerId, otherId) }, userId: viewerId }, data: { hiddenAt: null } });
  return { ok: true as const };
}

/**
 * The viewer deletes `otherId`'s message request: it leaves their lists (the sender isn't told)
 * until a newer message comes. Block them to stop that.
 */
export async function deleteRequest(viewerId: string, otherId: string) {
  const convo = await prisma.conversation.findFirst({ where: { pairKey: pairKey(viewerId, otherId), requestedById: otherId }, select: { id: true } });
  if (!convo) return fail(404, "Message request not found.");
  const now = new Date();
  await prisma.conversationMember.update({
    where: { conversationId_userId: { conversationId: convo.id, userId: viewerId } },
    data: { hiddenAt: now, unreadCount: 0, lastReadAt: now },
  });
  return { ok: true as const };
}

/**
 * The viewer deletes their chat with `otherId`, like Messenger: it leaves their list and its
 * messages are cleared for them only. The other person isn't told and keeps their copy. A newer
 * message brings the chat back, starting from that message.
 */
export async function deleteChat(viewerId: string, otherId: string) {
  const convo = await prisma.conversation.findUnique({ where: { pairKey: pairKey(viewerId, otherId) }, select: { id: true } });
  if (!convo) return fail(404, "Chat not found.");
  const now = new Date();
  await prisma.conversationMember.update({
    where: { conversationId_userId: { conversationId: convo.id, userId: viewerId } },
    data: { hiddenAt: now, clearedAt: now, unreadCount: 0, lastReadAt: now },
  });
  return { ok: true as const };
}

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
        hiddenAt: true,
        conversation: {
          select: {
            lastMessageAt: true,
            requestedById: true,
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

  return rows.flatMap(({ unreadCount, hiddenAt, conversation: c }) => {
    const other = c.members[0]?.user;
    const last = c.messages[0];
    if (!other || !last) return [];
    // A request or chat they deleted stays out of the list until a newer message.
    if (hiddenAt && c.lastMessageAt <= hiddenAt) return [];
    const friend = friendIds.has(other.id);
    const request = !friend && c.requestedById === other.id;
    const pending = !friend && c.requestedById === viewerId;
    return [
      {
        partner: { id: other.id, name: other.name ?? "Anonymous Planter", image: displayAvatar(other), ...visiblePresence(other, friend) },
        // A request shows no photo/video/voice preview of a stranger's file, only that there is one.
        preview: previewText(last, last.senderId === viewerId),
        lastMessageAt: c.lastMessageAt.toISOString(),
        unread: unreadCount,
        ...(request ? { request: true } : {}),
        ...(pending ? { pending: true } : {}),
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
 * message (for the pop-up). Message requests don't count there (like Messenger): `requests` is
 * how many have something new. Also records that the user is active.
 */
export async function unreadSummary(viewerId: string) {
  const hidden = await blockedIds(viewerId);
  const visible = { members: { none: { userId: { in: hidden } } } };
  // A chat, or the viewer's own request — not someone else's request to them.
  const notRequest = { OR: [{ requestedById: null }, { requestedById: viewerId }] };
  const [unread, requests, latest] = await Promise.all([
    prisma.conversationMember.count({ where: { userId: viewerId, unreadCount: { gt: 0 }, conversation: { ...visible, ...notRequest } } }),
    prisma.conversationMember.count({ where: { userId: viewerId, unreadCount: { gt: 0 }, conversation: { ...visible, requestedById: { notIn: [viewerId] } } } }),
    prisma.directMessage.findFirst({
      where: {
        senderId: { notIn: [viewerId, ...hidden] },
        deletedAt: null,
        conversation: { members: { some: { userId: viewerId, unreadCount: { gt: 0 } } }, ...notRequest },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, body: true, mediaType: true, deletedAt: true, createdAt: true, sender: { select: { id: true, name: true } } },
    }),
    touchActive(viewerId),
  ]);
  return {
    unread,
    requests,
    latest: latest && {
      id: latest.id,
      fromId: latest.sender.id,
      fromName: latest.sender.name ?? "A planter",
      preview: previewText(latest, false),
      createdAt: latest.createdAt.toISOString(),
    },
  };
}
