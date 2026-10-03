import { requirePageUserId } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { getReferralSummary, REFERRAL_BONUS_POINTS } from "@/lib/referrals";
import { getAppOrigin } from "@/lib/url";
import InviteLink from "@/components/referrals/InviteLink";
import ClaimCodeForm from "@/components/referrals/ClaimCodeForm";

const fmtDate = (d: Date) =>
  d.toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" });

export default async function ReferralsPage({ searchParams }: PageProps<"/referrals">) {
  const userId = await requirePageUserId();

  const [user, summary, origin, { code }] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        referralCode: true,
        referredBy: { select: { name: true } },
        _count: { select: { quests: { where: { status: "COMPLETED" } } } },
      },
    }),
    getReferralSummary(userId),
    getAppOrigin(),
    searchParams,
  ]);

  const inviteUrl = `${origin}/r/${user.referralCode}`;
  const canClaim = !user.referredBy && user._count.quests === 0;
  const pendingCode = typeof code === "string" && code !== user.referralCode ? code : "";

  return (
    <div className="eq-stagger mx-auto w-full max-w-2xl space-y-6 px-4 py-6 text-slate-900 sm:px-6 lg:py-8">
      <header>
        <h1 className="text-xl font-semibold">Referral Hub</h1>
        <p className="text-sm text-slate-500">
          Invite friends to plant with you. You earn <strong>{REFERRAL_BONUS_POINTS} bonus points</strong> when each
          friend&apos;s first planting is verified.
        </p>
      </header>

      <section className="rounded-2xl border border-slate-200/80 bg-white shadow-sm p-5">
        <h2 className="mb-3 font-semibold">Your invite link</h2>
        <InviteLink url={inviteUrl} />
        <p className="mt-3 text-xs text-slate-500">
          Invite code: <span className="font-mono">{user.referralCode}</span>
        </p>
      </section>

      <section className="eq-stagger eq-spring grid grid-cols-3 gap-3 text-center">
        {[
          ["Invited", summary.invited],
          ["Planted", summary.qualified],
          ["Bonus pts", summary.pointsEarned],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-slate-200/80 bg-white shadow-sm p-3">
            <p className="text-2xl font-bold text-emerald-700">{value}</p>
            <p className="text-xs text-slate-500">{label}</p>
          </div>
        ))}
      </section>

      {user.referredBy ? (
        <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
          You joined with an invite from <strong>{user.referredBy.name ?? "a fellow planter"}</strong>. 🌱
        </p>
      ) : (
        canClaim && (
          <section className="rounded-2xl border border-slate-200/80 bg-white shadow-sm p-5">
            <h2 className="font-semibold">Got an invite code?</h2>
            <p className="mb-3 text-sm text-slate-500">
              Enter it before your first verified planting so your friend gets their bonus.
            </p>
            <ClaimCodeForm initialCode={pendingCode} />
          </section>
        )
      )}

      <section>
        <h2 className="mb-2 font-semibold">Friends you invited</h2>
        {summary.referrals.length === 0 ? (
          <p className="text-sm text-slate-500">No one yet — share your link to get started.</p>
        ) : (
          <ul className="eq-stagger divide-y rounded-2xl border border-slate-200/80 bg-white shadow-sm text-sm">
            {summary.referrals.map((r) => (
              <li key={r.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="font-medium">{r.name}</p>
                  <p className="text-xs text-slate-500">Joined {fmtDate(r.joinedAt)}</p>
                </div>
                {r.bonusAwarded ? (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                    +{REFERRAL_BONUS_POINTS} pts
                  </span>
                ) : (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">Waiting for first planting</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
