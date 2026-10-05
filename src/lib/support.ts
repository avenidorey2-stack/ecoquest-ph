import type { SupportStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { notify, notifyAdmins } from "@/lib/notifications";
import { displayAvatar } from "@/lib/avatar-url";

// "Report a problem": a user opens a ticket; it becomes a chat with the team (admins) in the
// Admin Portal. Each side is notified of the other's messages; unread flags drive the badges.
// Planter-facing text says "our team", never "admin".

export const SUBJECT_MAX = 120;
export const MESSAGE_MAX = 2000;

type Viewer = { id: string; role: string };
type Fail = { ok: false; status: number; error: string };
const fail = (status: number, error: string): Fail => ({ ok: false, status, error });

export const userTicketPath = (id: string) => `/settings/support/${id}`;
export const adminTicketPath = (id: string) => `/admin/support/${id}`;

function cleanText(input: unknown, max: number, what: string): string | Fail {
  const text = typeof input === "string" ? input.trim() : "";
  if (!text) return fail(400, `Write a ${what} first.`);
  if (text.length > max) return fail(400, `Keep the ${what} under ${max.toLocaleString("en-PH")} characters.`);
  return text;
}

export async function createTicket(userId: string, rawSubject: unknown, rawBody: unknown) {
  const subject = cleanText(rawSubject, SUBJECT_MAX, "subject");
  if (typeof subject !== "string") return subject;
  const body = cleanText(rawBody, MESSAGE_MAX, "message");
  if (typeof body !== "string") return body;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  const ticket = await prisma.$transaction(async (tx) => {
    const t = await tx.supportTicket.create({ data: { userId, subject, messages: { create: { authorId: userId, body } } } });
    await notifyAdmins(tx, `New problem report from ${user?.name ?? "a planter"}: “${subject}”`, adminTicketPath(t.id), userId);
    return t;
  });
  return { ok: true as const, id: ticket.id };
}

/** Loads a ticket for its owner or an admin, and marks it read for that side. */
export async function getTicket(ticketId: string, viewer: Viewer) {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    include: {
      user: { select: { id: true, name: true, email: true, image: true, avatarUrl: true } },
      messages: { orderBy: { createdAt: "asc" }, include: { author: { select: { name: true } } } },
    },
  });
  const isTeam = viewer.role === "ADMIN";
  if (!ticket || (!isTeam && ticket.userId !== viewer.id)) return null;
  const unreadField = isTeam ? "adminUnread" : "userUnread";
  if (ticket[unreadField]) {
    await prisma.supportTicket.update({ where: { id: ticketId }, data: { [unreadField]: false } });
  }
  return {
    id: ticket.id,
    subject: ticket.subject,
    status: ticket.status,
    createdAt: ticket.createdAt.toISOString(),
    user: { id: ticket.user.id, name: ticket.user.name ?? "Anonymous Planter", email: ticket.user.email, image: displayAvatar(ticket.user) },
    messages: ticket.messages.map((m) => ({
      id: m.id,
      body: m.body,
      fromTeam: m.fromTeam,
      // Planters see "EcoQuest Team"; admins see which teammate answered.
      authorName: m.fromTeam ? (isTeam ? (m.author?.name ?? "Team") : "EcoQuest Team") : (ticket.user.name ?? "Planter"),
      createdAt: m.createdAt.toISOString(),
    })),
  };
}

export type Ticket = NonNullable<Awaited<ReturnType<typeof getTicket>>>;

/**
 * Adds a message. From the team (admin): notifies the user. From the user: notifies admins and
 * reopens a closed ticket.
 */
export async function addMessage(ticketId: string, viewer: Viewer, rawBody: unknown) {
  const body = cleanText(rawBody, MESSAGE_MAX, "message");
  if (typeof body !== "string") return body;
  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId }, select: { userId: true, subject: true, status: true } });
  const fromTeam = viewer.role === "ADMIN";
  if (!ticket || (!fromTeam && ticket.userId !== viewer.id)) return fail(404, "Report not found.");

  await prisma.$transaction(async (tx) => {
    await tx.supportMessage.create({ data: { ticketId, authorId: viewer.id, fromTeam, body } });
    const now = new Date();
    if (fromTeam) {
      await tx.supportTicket.update({ where: { id: ticketId }, data: { lastMessageAt: now, userUnread: true } });
      await notify(tx, ticket.userId, `Our team replied to your report “${ticket.subject}”.`, userTicketPath(ticketId));
    } else {
      await tx.supportTicket.update({ where: { id: ticketId }, data: { lastMessageAt: now, adminUnread: true, status: "OPEN" } });
      const user = await tx.user.findUnique({ where: { id: viewer.id }, select: { name: true } });
      await notifyAdmins(tx, `${user?.name ?? "A planter"} replied to “${ticket.subject}”.`, adminTicketPath(ticketId), viewer.id);
    }
  });
  return { ok: true as const };
}

/** Admins close or reopen a ticket. Closing tells the user. */
export async function setTicketStatus(ticketId: string, status: unknown) {
  if (status !== "OPEN" && status !== "CLOSED") return fail(400, "Invalid status.");
  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId }, select: { userId: true, subject: true, status: true } });
  if (!ticket) return fail(404, "Report not found.");
  if (ticket.status === status) return { ok: true as const };
  await prisma.$transaction(async (tx) => {
    await tx.supportTicket.update({ where: { id: ticketId }, data: { status: status as SupportStatus } });
    if (status === "CLOSED") {
      await notify(tx, ticket.userId, `Our team marked your report “${ticket.subject}” as resolved. Reply if you still need help.`, userTicketPath(ticketId));
    }
  });
  return { ok: true as const };
}

/** A user's reports, latest activity first. */
export async function listMyTickets(userId: string) {
  const rows = await prisma.supportTicket.findMany({
    where: { userId },
    orderBy: { lastMessageAt: "desc" },
    select: { id: true, subject: true, status: true, lastMessageAt: true, userUnread: true },
  });
  return rows.map((t) => ({ ...t, lastMessageAt: t.lastMessageAt.toISOString() }));
}

/** All reports for the Admin Portal, unread first within the chosen status. */
export async function listTickets(status: SupportStatus) {
  const rows = await prisma.supportTicket.findMany({
    where: { status },
    orderBy: [{ adminUnread: "desc" }, { lastMessageAt: "desc" }],
    take: 200,
    select: {
      id: true,
      subject: true,
      status: true,
      lastMessageAt: true,
      adminUnread: true,
      user: { select: { name: true, email: true } },
      _count: { select: { messages: true } },
    },
  });
  return rows.map((t) => ({
    id: t.id,
    subject: t.subject,
    status: t.status,
    lastMessageAt: t.lastMessageAt.toISOString(),
    unread: t.adminUnread,
    userName: t.user.name ?? "Anonymous Planter",
    userEmail: t.user.email,
    messages: t._count.messages,
  }));
}

export async function countUnreadForTeam() {
  return prisma.supportTicket.count({ where: { adminUnread: true, status: "OPEN" } });
}
