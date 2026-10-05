import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications";
import { displayAvatar } from "@/lib/avatar-url";
import { canSeePhotos } from "@/lib/friends";

// Likes, comments and replies on approved planting photos/videos (Verification rows). Everything
// here is gated by the owner's photo privacy (canSeePhotos): a viewer who can't see a photo can't
// read, like or comment on it either.

export const COMMENT_MAX = 500;
const THREAD_LIMIT = 200;

type Viewer = { id: string; role: string };
type Fail = { ok: false; status: number; error: string };

/** Where a reaction notification opens: the owner's profile with that photo in the viewer. */
export const photoPath = (ownerId: string, verificationId: string) => `/planters/${ownerId}?photo=${encodeURIComponent(verificationId)}`;

/** The approved photo and its owner, if `viewer` may see it. */
async function visiblePhoto(verificationId: string, viewer: Viewer) {
  const v = await prisma.verification.findFirst({
    where: { id: verificationId, status: "APPROVED" },
    select: { id: true, quest: { select: { user: { select: { id: true, name: true, photoVisibility: true } } } } },
  });
  if (!v || !(await canSeePhotos(v.quest.user, viewer))) return null;
  return { id: v.id, owner: v.quest.user };
}

const notFound: Fail = { ok: false, status: 404, error: "Photo not found." };

export type PhotoComment = {
  id: string;
  author: { id: string; name: string; image: string | null };
  body: string;
  createdAt: string;
  canDelete: boolean;
  replies: PhotoComment[];
};

export type PhotoThread = { likeCount: number; likedByMe: boolean; commentCount: number; comments: PhotoComment[] };

/** Likes and the comment thread (oldest first, replies under their comment). */
export async function getPhotoThread(verificationId: string, viewer: Viewer): Promise<{ ok: true; thread: PhotoThread } | Fail> {
  const photo = await visiblePhoto(verificationId, viewer);
  if (!photo) return notFound;
  const [likeCount, mine, rows] = await Promise.all([
    prisma.photoLike.count({ where: { verificationId } }),
    prisma.photoLike.findUnique({ where: { verificationId_userId: { verificationId, userId: viewer.id } } }),
    prisma.photoComment.findMany({
      where: { verificationId },
      orderBy: { createdAt: "asc" },
      take: THREAD_LIMIT,
      select: {
        id: true,
        body: true,
        createdAt: true,
        parentId: true,
        author: { select: { id: true, name: true, image: true, avatarUrl: true } },
      },
    }),
  ]);

  const mayModerate = viewer.id === photo.owner.id || viewer.role === "ADMIN";
  const byId = new Map<string, PhotoComment>();
  const top: PhotoComment[] = [];
  for (const r of rows) {
    const c: PhotoComment = {
      id: r.id,
      author: { id: r.author.id, name: r.author.name ?? "Anonymous Planter", image: displayAvatar(r.author) },
      body: r.body,
      createdAt: r.createdAt.toISOString(),
      canDelete: mayModerate || r.author.id === viewer.id,
      replies: [],
    };
    byId.set(c.id, c);
    const parent = r.parentId ? byId.get(r.parentId) : null;
    if (parent) parent.replies.push(c);
    else if (!r.parentId) top.push(c);
  }
  return { ok: true, thread: { likeCount, likedByMe: !!mine, commentCount: rows.length, comments: top } };
}

/** Likes (`like` true) or unlikes a photo. The owner is notified of a new like from someone else. */
export async function setLike(verificationId: string, viewer: Viewer, like: boolean) {
  const photo = await visiblePhoto(verificationId, viewer);
  if (!photo) return notFound;
  const where = { verificationId_userId: { verificationId, userId: viewer.id } };
  if (like) {
    const existing = await prisma.photoLike.findUnique({ where });
    if (!existing) {
      const me = await prisma.user.findUnique({ where: { id: viewer.id }, select: { name: true } });
      await prisma.$transaction(async (tx) => {
        await tx.photoLike.create({ data: { verificationId, userId: viewer.id } });
        if (photo.owner.id !== viewer.id) {
          await notify(tx, photo.owner.id, `${me?.name ?? "A planter"} liked your planting photo.`, photoPath(photo.owner.id, verificationId));
        }
      }).catch((e) => {
        if ((e as { code?: string }).code !== "P2002") throw e; // a double tap already liked it
      });
    }
  } else {
    await prisma.photoLike.deleteMany({ where: { verificationId, userId: viewer.id } });
  }
  const likeCount = await prisma.photoLike.count({ where: { verificationId } });
  return { ok: true as const, likeCount, likedByMe: like };
}

/**
 * Adds a comment, or a reply when `parentId` is a comment on the same photo (replies to a reply
 * join its thread). Notifies the photo owner and the author being replied to (never yourself).
 */
export async function addComment(verificationId: string, viewer: Viewer, rawBody: unknown, rawParentId?: unknown) {
  const body = typeof rawBody === "string" ? rawBody.trim() : "";
  if (!body) return { ok: false, status: 400, error: "Write a comment first." } satisfies Fail;
  if (body.length > COMMENT_MAX) return { ok: false, status: 400, error: `Comments can be up to ${COMMENT_MAX} characters.` } satisfies Fail;
  const photo = await visiblePhoto(verificationId, viewer);
  if (!photo) return notFound;

  let parent: { id: string; authorId: string } | null = null;
  if (rawParentId != null) {
    if (typeof rawParentId !== "string") return { ok: false, status: 400, error: "Invalid reply." } satisfies Fail;
    const p = await prisma.photoComment.findFirst({ where: { id: rawParentId, verificationId }, select: { id: true, authorId: true, parentId: true } });
    if (!p) return { ok: false, status: 404, error: "That comment was deleted." } satisfies Fail;
    parent = { id: p.parentId ?? p.id, authorId: p.authorId };
  }

  const me = await prisma.user.findUnique({ where: { id: viewer.id }, select: { name: true } });
  const who = me?.name ?? "A planter";
  const link = photoPath(photo.owner.id, verificationId);
  const comment = await prisma.$transaction(async (tx) => {
    const c = await tx.photoComment.create({ data: { verificationId, authorId: viewer.id, parentId: parent?.id ?? null, body } });
    const preview = body.length > 60 ? `${body.slice(0, 57)}…` : body;
    if (photo.owner.id !== viewer.id) {
      await notify(tx, photo.owner.id, `${who} commented on your planting photo: “${preview}”`, link);
    }
    if (parent && parent.authorId !== viewer.id && parent.authorId !== photo.owner.id) {
      await notify(tx, parent.authorId, `${who} replied to your comment: “${preview}”`, link);
    }
    return c;
  });
  return { ok: true as const, id: comment.id };
}

/** Deletes a comment (and its replies). Allowed for its author, the photo owner and admins. */
export async function deleteComment(commentId: string, viewer: Viewer) {
  const c = await prisma.photoComment.findUnique({
    where: { id: commentId },
    select: { authorId: true, verification: { select: { quest: { select: { userId: true } } } } },
  });
  if (!c) return { ok: false, status: 404, error: "Comment not found." } satisfies Fail;
  const allowed = c.authorId === viewer.id || c.verification.quest.userId === viewer.id || viewer.role === "ADMIN";
  if (!allowed) return { ok: false, status: 403, error: "You can't delete this comment." } satisfies Fail;
  await prisma.photoComment.delete({ where: { id: commentId } });
  return { ok: true as const };
}
