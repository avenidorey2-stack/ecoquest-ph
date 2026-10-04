import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageUserId } from "@/lib/authz";
import { getPublicProfile, PROOF_PAGE_SIZE } from "@/lib/public-profile";
import { formatDate } from "@/lib/format";
import AchievementShowcase from "@/components/profile/AchievementShowcase";
import ProofGallery from "@/components/profile/ProofGallery";
import { CoinIcon, MedalIcon, TreeIcon } from "@/components/ui/icons";

export const metadata = { title: "Planter profile · EcoQuest PH" };

/** Public planter profile: any signed-in user can visit it (linked from the leaderboards). */
export default async function PlanterProfilePage({ params }: PageProps<"/planters/[id]">) {
  const viewerId = await requirePageUserId();
  const { id } = await params;
  const profile = await getPublicProfile(id, viewerId, { proofLimit: PROOF_PAGE_SIZE });
  if (!profile) notFound();
  const isMe = profile.id === viewerId;

  const stats = [
    { label: "Trees planted", value: profile.totalPlants.toLocaleString("en-PH"), Icon: TreeIcon },
    { label: "Current points", value: profile.points.toLocaleString("en-PH"), Icon: CoinIcon },
    { label: "Achievements", value: profile.achievements.length.toLocaleString("en-PH"), Icon: MedalIcon },
  ];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6 lg:p-8">
      <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-800 to-emerald-950 p-5 text-white shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center gap-4">
          {profile.image ? (
            // eslint-disable-next-line @next/next/no-img-element -- uploaded avatar or OAuth photo
            <img src={profile.image} alt="" className="h-20 w-20 shrink-0 rounded-2xl object-cover ring-4 ring-white/15 sm:h-24 sm:w-24" />
          ) : (
            <span className="grid h-20 w-20 shrink-0 place-items-center rounded-2xl bg-emerald-400 text-3xl font-bold ring-4 ring-white/15 sm:h-24 sm:w-24">
              {profile.name.slice(0, 1).toUpperCase()}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-2xl font-bold">
              {profile.name}
              {isMe && <span className="ml-2 align-middle text-sm font-normal text-emerald-200">(you)</span>}
            </h2>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-full bg-gradient-to-br from-amber-300 to-amber-500 px-2 py-0.5 text-xs font-extrabold text-amber-950">
                Lv {profile.level}
              </span>
              <span className="text-emerald-100">{profile.title}</span>
            </p>
            <p className="mt-1 text-xs text-emerald-200/80">
              {profile.city && `${profile.city}, ${profile.province} · `}Planting since {formatDate(profile.memberSince)}
            </p>
          </div>
          {isMe && (
            <Link href="/profile" className="rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold ring-1 ring-white/20 hover:bg-white/20">
              Edit profile
            </Link>
          )}
        </div>
        <dl className="mt-5 grid grid-cols-3 gap-3">
          {stats.map(({ label, value, Icon }) => (
            <div key={label} className="rounded-xl bg-white/10 px-3 py-2.5 ring-1 ring-white/10">
              <dt className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-emerald-200 sm:text-[11px]">
                <Icon className="h-3.5 w-3.5 shrink-0" /> {label}
              </dt>
              <dd className="text-xl font-bold sm:text-2xl">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <AchievementShowcase
        achievements={profile.achievements}
        emptyText={isMe ? "Plant your first tree to earn your first badge." : `${profile.name} hasn't earned any badges yet.`}
      />
      <ProofGallery
        proofs={profile.proofs}
        total={profile.totalProofs}
        emptyText={isMe ? "Your approved planting photos and videos will appear here." : "No approved plantings yet."}
      />
    </div>
  );
}
