import { requirePageUserId } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { MAX_PENDING_REDEMPTIONS } from "@/lib/rewards";
import RedeemButton from "@/components/shop/RedeemButton";
import VoucherArt from "@/components/rewards/VoucherArt";
import { CoinIcon } from "@/components/ui/icons";

const STATUS_STYLES = {
  PENDING: "bg-amber-400/15 text-amber-300",
  FULFILLED: "bg-emerald-400/15 text-emerald-300",
  REJECTED: "bg-red-400/15 text-red-300",
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
    <div className="eq-stagger mx-auto w-full max-w-3xl space-y-6 px-4 py-6 text-ink sm:px-6 lg:py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Rewards</h1>
          <p className="text-sm text-ink-3">Turn your planting points into GCash, Maya, Grab and Shopee rewards.</p>
        </div>
        <div className="rounded-xl bg-emerald-400/10 px-4 py-2 text-right">
          <p className="text-xs text-emerald-400">Your balance</p>
          <p className="text-2xl font-bold text-emerald-300">{user.points.toLocaleString("en-PH")} pts</p>
        </div>
      </header>

      {pending >= MAX_PENDING_REDEMPTIONS && (
        <p className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-300">
          You have {pending} requests being processed. You can redeem more once they&apos;re fulfilled.
        </p>
      )}

      {rewards.length === 0 && (
        <p className="eq-panel rounded-2xl border border-line/80 bg-card shadow-sm p-6 text-center text-sm text-ink-3">
          No rewards are available right now. Check back soon!
        </p>
      )}

      {sections.map(
        ({ title, items }) =>
          items.length > 0 && (
            <section key={title}>
              <h2 className="mb-2 font-semibold">{title}</h2>
              <ul className="eq-stagger eq-spring grid grid-cols-1 gap-4 sm:grid-cols-2">
                {items.map((r) => (
                  <li key={r.id} className="eq-panel flex flex-col gap-3 rounded-2xl border border-line/80 bg-card p-3 shadow-sm">
                    <VoucherArt brand={r.brand} valuePesos={r.valuePesos} isCash={r.rewardType === "EWALLET_CASH"} />
                    <div className="mt-auto flex items-center gap-3 px-1 pb-1">
                      <p className="flex shrink-0 items-center gap-1 text-lg font-bold text-emerald-300">
                        <CoinIcon className="h-4 w-4 text-amber-400" />
                        {r.costPoints.toLocaleString("en-PH")}
                        <span className="text-xs font-medium text-ink-3">pts</span>
                      </p>
                      <div className="min-w-0 flex-1">
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
          <p className="text-sm text-ink-3">Nothing redeemed yet.</p>
        ) : (
          <ul className="eq-panel eq-stagger divide-y rounded-2xl border border-line/80 bg-card shadow-sm text-sm">
            {history.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-medium">
                    ₱{h.reward.valuePesos.toLocaleString("en-PH")} {h.reward.brand} {h.reward.rewardType === "EWALLET_CASH" ? "cash" : "voucher"}
                  </p>
                  <p className="text-xs text-ink-3">
                    {fmtDate(h.createdAt)} · {h.pointsSpent.toLocaleString("en-PH")} pts{h.eWalletNumber && ` · to ${h.eWalletNumber}`}
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
                  {h.status === "REJECTED" && <p className="text-xs text-ink-3">Points refunded.</p>}
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
