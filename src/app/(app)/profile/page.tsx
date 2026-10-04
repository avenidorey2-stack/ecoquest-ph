import Link from "next/link";
import { requirePageUserId } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { listRegions, resolveCity } from "@/lib/psgc";
import { nextLocationChange } from "@/lib/profile";
import { currentWeeklyPoints } from "@/lib/week";
import ProfileForm from "@/components/profile/ProfileForm";
import AvatarUploader from "@/components/profile/AvatarUploader";
import LevelBar from "@/components/gamification/LevelBar";
import { displayAvatar } from "@/lib/avatar-url";
import { getPublicProfile, PROOF_PAGE_SIZE } from "@/lib/public-profile";
import AchievementShowcase from "@/components/profile/AchievementShowcase";
import ProofGallery from "@/components/profile/ProofGallery";

export default async function ProfilePage() {
  const userId = await requirePageUserId();
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      name: true,
      email: true,
      image: true,
      avatarUrl: true,
      xp: true,
      role: true,
      points: true,
      weeklyPoints: true,
      weeklyPointsWeekStart: true,
      totalPlants: true,
      referralCode: true,
      cityCode: true,
      locationUpdatedAt: true,
      createdAt: true,
    },
  });

  // Same data other planters see on /planters/[id] (your own profile is always visible to you).
  const publicProfile = await getPublicProfile(userId, userId, { proofLimit: PROOF_PAGE_SIZE });
  const place = resolveCity(user.cityCode);
  const nextChange = place ? nextLocationChange(user.locationUpdatedAt) : null;
  const locked = nextChange && nextChange > new Date() ? nextChange.toISOString() : null;
  const initials = (user.name ?? user.email ?? "?").slice(0, 1).toUpperCase();

  return (
    <div className="eq-stagger mx-auto w-full max-w-2xl space-y-6 px-4 py-6 text-ink sm:px-6 lg:py-8">
      <section className="eq-panel flex items-center gap-4 rounded-2xl border border-line/80 bg-card shadow-sm p-5">
        <AvatarUploader src={displayAvatar(user)} initials={initials} hasUpload={!!user.avatarUrl} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold">{user.name ?? "Unnamed planter"}</h1>
          <p className="truncate text-sm text-ink-3">{user.email}</p>
          <p className="text-xs text-ink-3">
            {place ? `${place.city}, ${place.province}` : "No home city set"} · Member since{" "}
            {user.createdAt.toLocaleDateString("en-PH", { month: "long", year: "numeric" })}
            {user.role !== "USER" && (
              <span className="ml-2 rounded bg-emerald-400/15 px-1.5 py-0.5 font-medium text-emerald-300">{user.role}</span>
            )}
          </p>
          <div className="mt-3 max-w-xs">
            <LevelBar xp={user.xp} />
          </div>
        </div>
      </section>

      {!place && (
        <p className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-300">
          Set your home city below to start claiming planting slots.
        </p>
      )}

      <section className="eq-stagger eq-spring grid grid-cols-3 gap-3 text-center">
        {[
          ["Total points", user.points],
          ["This week", currentWeeklyPoints(user)],
          ["Plants", user.totalPlants],
        ].map(([label, value]) => (
          <div key={label} className="eq-panel rounded-2xl border border-line/80 bg-card shadow-sm p-3">
            <p className="text-2xl font-bold text-emerald-400">{value}</p>
            <p className="text-xs text-ink-3">{label}</p>
          </div>
        ))}
      </section>

      <section className="eq-panel rounded-2xl border border-line/80 bg-card shadow-sm p-5">
        <h2 className="mb-4 font-semibold">Edit profile</h2>
        <ProfileForm
          regions={listRegions()}
          name={user.name ?? ""}
          place={place}
          locationLockedUntil={locked}
        />
      </section>

      {publicProfile && (
        <>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-ink-2">Your achievements and approved plantings are permanent and public.</p>
            <Link href={`/planters/${userId}`} className="eq-hit relative shrink-0 text-sm font-medium text-emerald-400 hover:text-emerald-200">
              View as others see it
            </Link>
          </div>
          <AchievementShowcase achievements={publicProfile.achievements} emptyText="Plant your first tree to earn your first badge." />
          <ProofGallery
            proofs={publicProfile.proofs}
            total={publicProfile.totalProofs}
            emptyText="Your approved planting photos and videos will appear here."
          />
        </>
      )}

      <Link
        href="/referrals"
        className="eq-panel flex items-center justify-between rounded-2xl border border-line/80 bg-card shadow-sm p-5 text-sm hover:border-emerald-500"
      >
        <span>
          <span className="block font-semibold">Invite friends</span>
          Your code: <span className="font-mono text-emerald-400">{user.referralCode}</span>
        </span>
        <span className="text-emerald-400">Referral Hub</span>
      </Link>
    </div>
  );
}
