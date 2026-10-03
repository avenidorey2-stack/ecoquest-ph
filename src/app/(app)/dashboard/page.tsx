import Link from "next/link";
import { getCurrentUser, requirePageUserId } from "@/lib/authz";
import { getDashboardData, type DashboardNotice } from "@/lib/dashboard";
import { timeAgo } from "@/lib/format";
import { getAppOrigin } from "@/lib/url";
import SlotMap from "@/components/map/SlotMapLoader";
import CelebrationGate from "@/components/quests/CelebrationGate";
import PatronBanner from "@/components/patrons/PatronBanner";
import WelcomeModal from "@/components/onboarding/WelcomeModal";
import Card, { ProgressBar } from "@/components/dashboard/Card";
import CopyField from "@/components/dashboard/CopyField";
import QuestBoard from "@/components/dashboard/QuestBoard";
import LevelBar from "@/components/gamification/LevelBar";
import CelebrationCenter from "@/components/gamification/CelebrationCenter";
import PlanterProfileTrigger from "@/components/leaderboard/PlanterProfileTrigger";
import {
  BellIcon,
  CameraIcon,
  CoinIcon,
  FlagIcon,
  LeafIcon,
  LinkIcon,
  MapIcon,
  SproutIcon,
  TicketIcon,
  TrophyIcon,
  WalletIcon,
} from "@/components/ui/icons";

/** Request time, for relative timestamps. */
function requestTime() {
  return new Date();
}

const NOTICE_STYLES: Record<DashboardNotice["kind"], string> = {
  slot: "bg-emerald-500",
  reward: "bg-sky-500",
  approved: "bg-emerald-500",
  rejected: "bg-rose-500",
  fulfilled: "bg-emerald-500",
  declined: "bg-amber-500",
};

export default async function DashboardPage() {
  const userId = await requirePageUserId();
  const now = requestTime();
  const [d, origin, viewer] = await Promise.all([getDashboardData(userId, now), getAppOrigin(), getCurrentUser()]);
  // Admins see every slot nationwide on the dashboard map (not just their home city).
  const isAdmin = viewer?.role === "ADMIN";

  const healthy = d.health.filter((h) => h.ok).length;
  const healthLabel = healthy === d.health.length ? "Excellent" : healthy >= 3 ? "Good" : "Needs attention";
  const healthTone =
    healthy === d.health.length ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : healthy >= 3 ? "bg-sky-50 text-sky-700 ring-sky-200" : "bg-amber-50 text-amber-800 ring-amber-200";
  const latest = d.latestApproved;
  const city = d.place?.city;
  // Ring = progress toward the next plant milestone (min 2% so the ring is visible).
  const plantProgress = Math.max(2, Math.round((d.user.totalPlants / d.plantGoal) * 100));

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      {d.ads.length > 0 && <PatronBanner ads={d.ads} />}

      {/* ── Main grid: 3 columns on desktop, 2 on tablets, stacked on phones ── */}
      <div className="eq-stagger eq-spring grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        {/* 1 · Eco-impact score */}
        <Card title="Eco-impact score" icon={<SproutIcon className="h-4 w-4" />}>
          <div className="flex items-center gap-5">
            <div className="relative grid h-28 w-28 shrink-0 place-items-center">
              <svg viewBox="0 0 120 120" className="absolute inset-0 -rotate-90" aria-hidden>
                <circle cx="60" cy="60" r="52" fill="none" stroke="#ecfdf5" strokeWidth="10" />
                <circle
                  cx="60"
                  cy="60"
                  r="52"
                  fill="none"
                  stroke="url(#impact)"
                  strokeWidth="10"
                  strokeLinecap="round"
                  pathLength={100}
                  strokeDasharray={`${plantProgress} 100`}
                  className="eq-ring"
                />
                <defs>
                  <linearGradient id="impact" x1="0" x2="1">
                    <stop offset="0" stopColor="#10b981" />
                    <stop offset="1" stopColor="#047857" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="text-center">
                <p className="text-3xl font-bold tracking-tight text-slate-900">{d.user.totalPlants}</p>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">plants</p>
              </div>
            </div>
            <dl className="grid flex-1 grid-cols-1 gap-2.5 text-sm">
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-slate-500">National rank</dt>
                <dd className="font-semibold text-slate-900">
                  {d.ranks.national ? `#${d.ranks.national}` : "—"}
                  {d.ranks.national && <span className="ml-1 text-xs font-normal text-slate-400">/ {d.ranks.nationalTotal}</span>}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-slate-500">{city ? "City rank" : "Local rank"}</dt>
                <dd className="font-semibold text-slate-900">
                  {d.ranks.local ? `#${d.ranks.local}` : "—"}
                  {d.ranks.local && <span className="ml-1 text-xs font-normal text-slate-400">/ {d.ranks.localTotal}</span>}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-slate-500">This week</dt>
                <dd className="font-semibold text-emerald-700">{d.user.weeklyPoints.toLocaleString("en-PH")} pts</dd>
              </div>
            </dl>
          </div>

          {/* National vs local planting impact (verified plants, all planters). */}
          <div className="mt-5 space-y-2">
            <div className="flex items-center justify-between gap-3 rounded-xl bg-gradient-to-r from-emerald-800 to-emerald-950 px-3.5 py-2.5 text-white">
              <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-200">
                <MapIcon className="h-4 w-4" /> National Impact
              </span>
              <span className="text-sm">
                <strong className="text-base">{d.impact.national.toLocaleString("en-PH")}</strong> Trees Planted
              </span>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-3.5 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-emerald-800">
                  <SproutIcon className="h-4 w-4 shrink-0" />
                  <span className="truncate">Local Impact{city ? ` (${city})` : ""}</span>
                </span>
                {city ? (
                  <span className="shrink-0 text-sm text-slate-800">
                    <strong className="text-base text-emerald-800">{d.impact.local.toLocaleString("en-PH")}</strong> Trees Planted
                  </span>
                ) : (
                  <Link href="/profile" className="shrink-0 text-xs font-semibold text-emerald-700">
                    Set your city →
                  </Link>
                )}
              </div>
              {city && (
                <div className="mt-2">
                  <ProgressBar value={d.impact.local} max={Math.max(d.impact.national, 1)} />
                  <p className="mt-1 text-[11px] text-slate-500">
                    {d.impact.national > 0
                      ? `${d.impact.localSharePct}% of the national total comes from ${city}`
                      : "No verified plantings nationwide yet — be the first!"}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="mt-3 rounded-xl border border-amber-100 bg-gradient-to-br from-amber-50/70 to-cream-50 p-3.5">
            <LevelBar xp={d.user.xp} />
          </div>

          <div className="mt-3 rounded-xl bg-cream-50 p-3.5">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-700">Account health</p>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${healthTone}`}>{healthLabel}</span>
            </div>
            <ul className="space-y-1.5 text-xs">
              {d.health.map((h) => (
                <li key={h.label} className="flex items-center gap-2">
                  <span
                    className={`grid h-4 w-4 place-items-center rounded-full text-[10px] font-bold ${h.ok ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}
                    aria-hidden
                  >
                    {h.ok ? "✓" : "!"}
                  </span>
                  <span className={h.ok ? "text-slate-600" : "text-slate-900"}>{h.label}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>

        {/* 2 · Active quests */}
        <Card title="Quests" icon={<FlagIcon className="h-4 w-4" />}>
          <QuestBoard missions={d.missions} quests={d.quests} completed={d.completedTasks} completedTotal={d.completedTotal} />
        </Card>

        {/* 3 · Latest submission */}
        <Card title="Latest submission" icon={<CameraIcon className="h-4 w-4" />} bodyClassName="p-4">
          {latest ? (
            <figure className="space-y-3">
              <div className="overflow-hidden rounded-xl bg-slate-900">
                {latest.mediaType.startsWith("video/") ? (
                  <video src={latest.mediaUrl} controls className="aspect-[4/3] w-full object-cover" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- auth-gated media route
                  <img src={latest.mediaUrl} alt={`${latest.quest.slot.requiredPlantType} planting proof`} className="aspect-[4/3] w-full object-cover" />
                )}
              </div>
              <figcaption className="flex items-start justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900">
                    {latest.plantCount} × {latest.quest.slot.requiredPlantType}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {latest.quest.slot.city} · approved {latest.reviewedAt ? timeAgo(latest.reviewedAt, now) : ""}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                  +{(latest.plantCount * latest.quest.slot.pointsPerPlant).toLocaleString("en-PH")} pts
                </span>
              </figcaption>
            </figure>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-200 bg-gradient-to-b from-cream-50 to-emerald-50/40 p-6 text-center">
              <svg viewBox="0 0 160 110" className="h-28 w-auto" aria-hidden>
                <ellipse cx="80" cy="96" rx="62" ry="9" fill="#e7e1d1" />
                <path d="M80 96V58" stroke="#78716c" strokeWidth="5" strokeLinecap="round" />
                <path d="M80 70c-4-14-18-20-34-18 2 15 15 23 34 18Z" fill="#34d399" />
                <path d="M80 60c3-17 18-26 38-24-2 18-18 28-38 24Z" fill="#10b981" />
                <circle cx="124" cy="22" r="10" fill="#fde68a" />
                <rect x="20" y="14" width="34" height="26" rx="5" fill="#fff" stroke="#cbd5e1" strokeWidth="2" />
                <circle cx="37" cy="27" r="6" fill="none" stroke="#94a3b8" strokeWidth="2" />
              </svg>
              <div>
                <p className="text-sm font-semibold text-slate-800">No approved planting yet</p>
                <p className="mt-1 text-xs text-slate-500">Claim a slot on the map, plant, and upload a photo — it shows up here once verified.</p>
              </div>
            </div>
          )}
        </Card>

        {/* 4 · Reward wallet */}
        <Card title="Reward wallet" icon={<WalletIcon className="h-4 w-4" />} action={{ href: "/rewards", label: "Rewards" }}>
          <div className="rounded-xl bg-gradient-to-br from-emerald-800 to-emerald-950 p-4 text-white">
            <p className="flex items-center gap-1.5 text-xs text-emerald-200">
              <CoinIcon className="h-4 w-4" /> Points balance
            </p>
            <p className="mt-1 text-3xl font-bold tracking-tight">{d.wallet.points.toLocaleString("en-PH")}</p>
            <p className="text-xs text-emerald-200/80">Redeem for GCash, Maya, Grab and Shopee rewards</p>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-200 p-3">
              <dt className="flex items-center gap-1.5 text-xs text-slate-500">
                <WalletIcon className="h-4 w-4 text-sky-600" /> Pending cashouts
              </dt>
              <dd className="mt-1 text-xl font-bold text-slate-900">{d.wallet.pendingCashouts}</dd>
              <dd className="text-[11px] text-slate-400">
                {d.wallet.pendingCashoutPoints > 0 ? `${d.wallet.pendingCashoutPoints.toLocaleString("en-PH")} pts in GCash/Maya` : "GCash / Maya"}
              </dd>
            </div>
            <div className="rounded-xl border border-slate-200 p-3">
              <dt className="flex items-center gap-1.5 text-xs text-slate-500">
                <TicketIcon className="h-4 w-4 text-amber-600" /> Vouchers claimed
              </dt>
              <dd className="mt-1 text-xl font-bold text-slate-900">{d.wallet.vouchersClaimed}</dd>
              <dd className="text-[11px] text-slate-400">Grab / Shopee</dd>
            </div>
          </dl>
          {d.wallet.cashReceivedPesos > 0 && (
            <p className="mt-3 text-xs text-slate-500">
              ₱{d.wallet.cashReceivedPesos.toLocaleString("en-PH")} cashed out to your e-wallet so far.
            </p>
          )}
        </Card>

        {/* 5 · Geofenced action map */}
        <Card
          title={isAdmin ? "All planting slots · admin view" : "Geofenced action map"}
          icon={<MapIcon className="h-4 w-4" />}
          action={isAdmin ? { href: "/admin/slots", label: "Manage slots" } : city ? undefined : { href: "/profile", label: "Set city" }}
          bodyClassName="flex flex-col"
        >
          {/* Taller on phones (full-width card); the map's Expand button goes full screen. */}
          <div className="relative h-[380px] w-full md:h-[340px]">
            {isAdmin ? <SlotMap adminView /> : <SlotMap cityOnly />}
            {!city && !isAdmin && (
              <div className="absolute inset-0 z-[500] grid place-items-center bg-white/70 p-6 text-center backdrop-blur-[2px]">
                <div>
                  <p className="text-sm font-semibold text-slate-800">Set your home city to see slots near you</p>
                  <Link href="/profile" className="mt-2 inline-block rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white">
                    Choose city
                  </Link>
                </div>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-100 px-5 py-2.5 text-[11px] text-slate-500">
            {isAdmin ? (
              <>
                <span className="font-medium text-slate-700">All regions</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-700" /> Open</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" /> Full</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-slate-500" /> Closed</span>
              </>
            ) : (
              <>
                <span className="font-medium text-slate-700">{city ? `${city}, ${d.place?.province}` : "No city set"}</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-700" /> Claimable</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-600" /> Your quest</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-slate-400" /> Full</span>
              </>
            )}
          </div>
        </Card>

        {/* 6 · Local leaderboard */}
        <Card
          title="Local leaderboard"
          icon={<TrophyIcon className="h-4 w-4" />}
          action={{ href: city ? "/leaderboard?scope=local" : "/leaderboard?scope=national", label: "Full board" }}
        >
          {!city ? (
            <p className="text-sm text-slate-500">
              <Link href="/profile" className="font-medium text-emerald-700">Set your home city</Link> to compete with planters near you.
            </p>
          ) : d.localLeaders.length === 0 ? (
            <div className="py-6 text-center text-sm text-slate-500">
              <p className="text-2xl" aria-hidden>🌱</p>
              No one in {city} has points this week yet — claim the top spot!
            </div>
          ) : (
            <>
              <p className="mb-3 text-xs text-slate-500">This week in {city}</p>
              <ol className="space-y-2">
                {d.localLeaders.map((e) => (
                  <li
                    key={e.userId}
                    className={`relative flex items-center gap-3 rounded-xl px-2.5 py-2 ${e.isViewer ? "bg-emerald-50 ring-1 ring-emerald-200" : "hover:bg-slate-50"}`}
                  >
                    <PlanterProfileTrigger userId={e.userId} name={e.name} />
                    <span
                      className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold ${
                        e.rank === 1 ? "bg-amber-100 text-amber-700" : e.rank === 2 ? "bg-slate-200 text-slate-700" : e.rank === 3 ? "bg-orange-100 text-orange-700" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {e.rank}
                    </span>
                    {e.image ? (
                      // eslint-disable-next-line @next/next/no-img-element -- external OAuth avatar
                      <img src={e.image} alt="" className="h-8 w-8 rounded-full object-cover" />
                    ) : (
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-800">
                        {e.name.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
                      {e.name}
                      {e.isViewer && <span className="ml-1 text-xs font-normal text-emerald-700">(you)</span>}
                    </span>
                    <span className="text-sm font-semibold text-emerald-700">{e.weeklyPoints.toLocaleString("en-PH")}</span>
                  </li>
                ))}
              </ol>
            </>
          )}
        </Card>
      </div>

      {/* ── Notifications & referral hub ── */}
      <section aria-labelledby="hub-title" className="rounded-2xl border border-slate-200/80 bg-white/70 p-5 shadow-sm">
        <h2 id="hub-title" className="mb-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
          Notifications &amp; referral hub
        </h2>
        <div className="eq-stagger eq-spring grid grid-cols-1 gap-5 md:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
              <BellIcon className="h-4 w-4 text-emerald-600" /> Recent admin updates
            </h3>
            {d.notices.length === 0 ? (
              <p className="text-sm text-slate-500">No updates in the last 30 days.</p>
            ) : (
              <ul className="space-y-3">
                {d.notices.map((n) => (
                  <li key={n.id} className="flex gap-2.5 text-sm">
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${NOTICE_STYLES[n.kind]}`} aria-hidden />
                    <div className="min-w-0">
                      {n.href ? (
                        <Link href={n.href} className="text-slate-700 hover:text-emerald-700">{n.text}</Link>
                      ) : (
                        <p className="text-slate-700">{n.text}</p>
                      )}
                      <p className="text-[11px] text-slate-400">{timeAgo(n.at, now)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
              <LinkIcon className="h-4 w-4 text-emerald-600" /> Your referral link
            </h3>
            <CopyField value={`${origin}/r/${d.user.referralCode}`} label="Copy your invite link:" />
            <dl className="mt-3 grid grid-cols-2 gap-2 text-center">
              <div className="rounded-lg bg-cream-50 py-2">
                <dd className="text-lg font-bold text-slate-900">{d.referrals.invited}</dd>
                <dt className="text-[11px] text-slate-500">Invited</dt>
              </div>
              <div className="rounded-lg bg-cream-50 py-2">
                <dd className="text-lg font-bold text-slate-900">{d.referrals.qualified}</dd>
                <dt className="text-[11px] text-slate-500">Planted</dt>
              </div>
            </dl>
            <Link href="/referrals" className="mt-3 inline-block text-xs font-medium text-emerald-700 hover:text-emerald-900">
              Open Referral Hub →
            </Link>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
              <LeafIcon className="h-4 w-4 text-emerald-600" /> Eco-tips{d.place ? ` for ${d.place.region}` : ""}
            </h3>
            <ul className="space-y-2.5 text-sm text-slate-600">
              {d.ecoTips.map((tip) => (
                <li key={tip} className="flex gap-2">
                  <span className="mt-0.5 text-emerald-600" aria-hidden>❧</span>
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* One celebration surface at a time: welcome → growing tree → level-up / badges (+ rank toast). */}
      {!d.user.onboarded ? (
        <WelcomeModal hasCity={!!d.place} invitedBy={d.user.invitedBy} />
      ) : d.uncelebrated.length === 0 ? (
        <CelebrationCenter pending={d.celebrations} />
      ) : (
        <CelebrationGate
          key={d.uncelebrated.map((q) => q.id).join(",")}
          celebrations={d.uncelebrated.map((q) => ({
            questId: q.id,
            points: q.pointsAwarded,
            plantCount: q.plantCount,
            plantType: q.slot.requiredPlantType,
          }))}
        />
      )}
    </div>
  );
}
