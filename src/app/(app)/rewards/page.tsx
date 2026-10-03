import { requirePageUserId } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { MAX_PENDING_REDEMPTIONS } from "@/lib/rewards";
import RedeemButton from "@/components/shop/RedeemButton";

const STATUS_STYLES = {
  PENDING: "bg-amber-100 text-amber-800",
  FULFILLED: "bg-emerald-100 text-emerald-800",
  REJECTED: "bg-red-100 text-red-700",
} as const;

const fmtDate = (d: Date) =>
  d.toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" });

export default async function RewardsPage() {
  const userId = await requirePageUserId();

  const [user, rewards, history] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { points: true } }),
    prisma.reward.findMany({
      where: { isActive: true },
      orderBy: [{ rewardType: "asc" }, { brand: "asc" }, { valuePesos: "asc" }],
    }),
    prisma.redemptionHistory.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { reward: { select: { brand: true, valuePesos: true, rewardType: true } } },
    }),
  ]);

  const lastNumber = history.find((h) => h.eWalletNumber)?.eWalletNumber ?? null;
  const pending = history.filter((h) => h.status === "PENDING").length;
  const sections = [
    { title: "E-wallet cashouts", items: rewards.filter((r) => r.rewardType === "EWALLET_CASH") },
    { title: "Vouchers", items: rewards.filter((r) => r.rewardType === "VOUCHER") },
  ];

  return (
    <div className="eq-stagger mx-auto w-full max-w-3xl space-y-6 px-4 py-6 text-slate-900 sm:px-6 lg:py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Rewards</h1>
          <p className="text-sm text-slate-500">Turn your planting points into GCash, Maya, Grab and Shopee rewards.</p>
        </div>
        <div className="rounded-xl bg-emerald-50 px-4 py-2 text-right">
          <p className="text-xs text-emerald-700">Your balance</p>
          <p className="text-2xl font-bold text-emerald-800">{user.points.toLocaleString("en-PH")} pts</p>
        </div>
      </header>

      {pending >= MAX_PENDING_REDEMPTIONS && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          You have {pending} requests being processed. You can redeem more once they&apos;re fulfilled.
        </p>
      )}

      {rewards.length === 0 && (
        <p className="rounded-2xl border border-slate-200/80 bg-white shadow-sm p-6 text-center text-sm text-slate-500">
          No rewards are available right now. Check back soon!
        </p>
      )}

      {sections.map(
        ({ title, items }) =>
          items.length > 0 && (
            <section key={title}>
              <h2 className="mb-2 font-semibold">{title}</h2>
              <ul className="eq-stagger grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
                {items.map((r) => (
                  <li key={r.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
                    <div>
                      <p className="text-sm text-slate-500">{r.brand}</p>
                      <p className="text-2xl font-bold">₱{r.valuePesos.toLocaleString("en-PH")}</p>
                      <p className="text-sm font-medium text-emerald-700">{r.costPoints.toLocaleString("en-PH")} pts</p>
                    </div>
                    <div className="mt-auto">
                      <RedeemButton
                        balance={user.points}
                        lastNumber={lastNumber}
                        reward={{
                          id: r.id,
                          brand: r.brand,
                          valuePesos: r.valuePesos,
                          costPoints: r.costPoints,
                          isCash: r.rewardType === "EWALLET_CASH",
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ),
      )}

      <section>
        <h2 className="mb-2 font-semibold">My redemptions</h2>
        {history.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing redeemed yet.</p>
        ) : (
          <ul className="divide-y rounded-2xl border border-slate-200/80 bg-white shadow-sm text-sm">
            {history.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-medium">
                    ₱{h.reward.valuePesos} {h.reward.brand} {h.reward.rewardType === "EWALLET_CASH" ? "cash" : "voucher"}
                  </p>
                  <p className="text-xs text-slate-500">
                    {fmtDate(h.createdAt)} · {h.pointsSpent} pts{h.eWalletNumber && ` · to ${h.eWalletNumber}`}
                  </p>
                  {h.adminNote && (
                    <p className="mt-1 break-all text-xs">
                      {h.status === "FULFILLED"
                        ? h.reward.rewardType === "VOUCHER"
                          ? "Voucher code: "
                          : "Reference no.: "
                        : "Reason: "}
                      <span className="font-mono font-medium">{h.adminNote}</span>
                    </p>
                  )}
                  {h.status === "REJECTED" && <p className="text-xs text-slate-500">Points refunded.</p>}
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[h.status]}`}>
                  {h.status === "PENDING" ? "Processing" : h.status === "FULFILLED" ? "Fulfilled" : "Rejected"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
