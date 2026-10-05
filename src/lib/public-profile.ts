import { prisma } from "@/lib/prisma";
import { displayAvatar } from "@/lib/avatar-url";
import { levelForXp, levelTitle } from "@/lib/levels";
import { achievementName } from "@/lib/achievements";
import { canSeePhotos, friendState, type FriendState } from "@/lib/friends";
import { isBlockedEitherWay } from "@/lib/blocks";
import type { PhotoVisibility } from "@/generated/prisma/client";

/** Proofs shown in the leaderboard modal; the full profile page shows up to PROOF_PAGE_SIZE. */
export const PROOF_GALLERY_SIZE = 12;
export const PROOF_PAGE_SIZE = 120;

export type PublicProof = {
  id: string;
  url: string;
  mediaType: string;
  plantType: string;
  plantCount: number;
  city: string;
  province: string;
  /** When the planter uploaded it. */
  submittedAt: string;
  /** When it was approved — the date the planting was acquired. */
  approvedAt: string | null;
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
};

export type PublicAchievement = { key: string; name: string; icon: string; description: string; category: string; unlockedAt: string };

export type PublicProfile = {
  id: string;
  name: string;
  image: string | null;
  level: number;
  title: string;
  totalPlants: number;
  points: number;
  city: string | null;
  province: string | null;
  memberSince: string;
  /** Approved proofs, newest first (up to the requested limit) and the overall count. */
  proofs: PublicProof[];
  totalProofs: number;
  /** Set when the planter's photo privacy hides their proofs from this viewer (`proofs` is empty). */
  photosHiddenBy: Exclude<PhotoVisibility, "EVERYONE"> | null;
  /** The viewer's friendship with this planter. */
  friendState: FriendState;
  /** Every achievement ever unlocked — achievements are never revoked. */
  achievements: PublicAchievement[];
};

/**
 * A planter's public profile (leaderboard modal and /planters/[id]): stats, approved proof and
 * unlocked achievements, each with the date it was acquired. Approved proof and achievements are
 * permanent: they stay even if the slot is later deleted. Only leaderboard-eligible users
 * (role USER) — or the viewer themself — are visible; email and private fields are never included.
 * Proofs follow the planter's photo privacy (Everyone / Friends / Only me): hidden ones come back
 * as an empty list with `photosHiddenBy` set.
 */
export async function getPublicProfile(
  userId: string,
  viewerId: string,
  { proofLimit = PROOF_GALLERY_SIZE }: { proofLimit?: number } = {},
): Promise<PublicProfile | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      name: true,
      image: true,
      avatarUrl: true,
      xp: true,
      totalPlants: true,
      points: true,
      city: true,
      province: true,
      createdAt: true,
      photoVisibility: true,
    },
  });
  if (!user || (user.role !== "USER" && user.id !== viewerId)) return null;

  const viewer = await prisma.user.findUnique({ where: { id: viewerId }, select: { id: true, role: true } });
  // Blocked either way: the profile doesn't exist for them (admins can still look).
  if (viewer?.role !== "ADMIN" && (await isBlockedEitherWay(userId, viewerId))) return null;
  const showPhotos = !!viewer && (await canSeePhotos(user, viewer));
  const approved = { status: "APPROVED" as const, quest: { userId } };
  const [proofs, totalProofs, unlocks, friendship] = await Promise.all([
    prisma.verification.findMany({
      where: approved,
      orderBy: [{ reviewedAt: "desc" }, { createdAt: "desc" }],
      take: showPhotos ? proofLimit : 0,
      select: {
        id: true,
        mediaUrl: true,
        mediaType: true,
        createdAt: true,
        reviewedAt: true,
        plantCount: true,
        quest: { select: { slot: { select: { requiredPlantType: true, city: true, province: true } } } },
        _count: { select: { likes: true, comments: true } },
        likes: { where: { userId: viewerId }, select: { userId: true } },
      },
    }),
    prisma.verification.count({ where: approved }),
    prisma.userAchievement.findMany({
      where: { userId },
      orderBy: { unlockedAt: "desc" },
      select: {
        unlockedAt: true,
        detail: true,
        achievement: { select: { key: true, icon: true, description: true, category: true } },
      },
    }),
    friendState(viewerId, userId),
  ]);

  const level = levelForXp(user.xp);
  return {
    id: user.id,
    name: user.name ?? "Anonymous Planter",
    image: displayAvatar(user),
    level,
    title: levelTitle(level),
    totalPlants: user.totalPlants,
    points: user.points,
    city: user.city,
    province: user.province,
    memberSince: user.createdAt.toISOString(),
    proofs: proofs.map((v) => ({
      id: v.id,
      url: v.mediaUrl,
      mediaType: v.mediaType,
      plantType: v.quest.slot.requiredPlantType,
      plantCount: v.plantCount,
      city: v.quest.slot.city,
      province: v.quest.slot.province,
      submittedAt: v.createdAt.toISOString(),
      approvedAt: v.reviewedAt?.toISOString() ?? null,
      likeCount: v._count.likes,
      commentCount: v._count.comments,
      likedByMe: v.likes.length > 0,
    })),
    totalProofs,
    photosHiddenBy: showPhotos || user.photoVisibility === "EVERYONE" ? null : user.photoVisibility,
    friendState: friendship,
    achievements: unlocks.map((u) => ({
      key: u.achievement.key,
      name: achievementName(u.achievement.key, u.detail),
      icon: u.achievement.icon,
      description: u.achievement.description,
      category: u.achievement.category,
      unlockedAt: u.unlockedAt.toISOString(),
    })),
  };
}
