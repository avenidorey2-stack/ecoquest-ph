import Link from "next/link";
import { requirePageUserId } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { formatAmount, formatPoints } from "@/lib/format";
import { ORDER_STATUS_LABELS, ORDER_STATUS_STYLES, ORDER_STEPS } from "@/lib/order-status";
import AutoRefresh from "@/components/layout/AutoRefresh";
import { GiftIcon, SproutIcon, WalletIcon } from "@/components/ui/icons";

export const metadata = { title: "Transactions · EcoQuest PH" };

const HISTORY_SIZE = 100;

const REDEMPTION_STATUS = {
  PENDING: { label: "Processing", style: "bg-amber-50 text-amber-800 ring-amber-200" },
  FULFILLED: { label: "Fulfilled", style: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  REJECTED: { label: "Declined", style: "bg-red-50 text-red-700 ring-red-200" },
} as const;

const fmtDateTime = (d: Date) =>
  d.toLocaleString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

export default async function TransactionsPage() {
  const userId = await requirePageUserId();

  const [user, history, spent, refunded] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { points: true } }),
    prisma.transaction.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: HISTORY_SIZE,
      include: {
        order: { select: { id: true, status: true } },
        redemption: { select: { status: true, adminNote: true, eWalletNumber: true, reward: { select: { rewardType: true } } } },
      },
    }),
    prisma.transaction.aggregate({
      where: { userId, currency: "POINTS", kind: { in: ["SEEDLING_ORDER", "REWARD_REDEMPTION"] } },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({ where: { userId, currency: "POINTS", kind: "REFUND" }, _sum: { amount: true } }),
  ]);

  const summary = [
    { label: "Current balance", value: formatPoints(user.points) },
    { label: "Points spent", value: formatPoints(spent._sum.amount ?? 0) },
    { label: "Points refunded", value: formatPoints(refunded._sum.amount ?? 0) },
  ];

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-4 sm:p-6 lg:p-8">
      <AutoRefresh seconds={30} />

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {summary.map((s) => (
          <li key={s.label} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{s.label}</p>
            <p className="mt-1 text-xl font-bold text-slate-900">{s.value}</p>
          </li>
        ))}
      </ul>

      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">History</h2>
          <span className="flex items-center gap-1.5 text-xs text-slate-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" aria-hidden /> Live status
          </span>
        </header>

        {history.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-slate-500">
            <p>No transactions yet.</p>
            <p className="mt-1">
              Order seedlings in the{" "}
              <Link href="/shop" className="font-medium text-emerald-700 hover:underline">Shop</Link> or redeem{" "}
              <Link href="/rewards" className="font-medium text-emerald-700 hover:underline">Rewards</Link>.
            </p>
          </div>
        ) : (
          <ol className="divide-y divide-slate-100">
            {history.map((t) => {
              const isRefund = t.kind === "REFUND";
              const Icon = t.kind === "SEEDLING_ORDER" ? SproutIcon : t.kind === "REWARD_REDEMPTION" ? GiftIcon : WalletIcon;
              const orderStatus = t.kind === "SEEDLING_ORDER" ? t.order?.status : undefined;
              const redemptionStatus = t.kind === "REWARD_REDEMPTION" ? t.redemption?.status : undefined;
              const stepIndex = orderStatus ? ORDER_STEPS.indexOf(orderStatus) : -1;

              return (
                <li key={t.id} className="flex gap-3 px-5 py-4">
                  <span
                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ring-1 ${
                      isRefund ? "bg-sky-50 text-sky-700 ring-sky-100" : "bg-emerald-50 text-emerald-700 ring-emerald-100"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </span>

                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900">{t.description}</p>
                        <p className="text-xs text-slate-500">
                          {fmtDateTime(t.createdAt)} ·{" "}
                          {t.kind === "SEEDLING_ORDER" ? "Seedling order" : t.kind === "REWARD_REDEMPTION" ? "Reward" : "Refund"}
                          {t.kind === "SEEDLING_ORDER" && t.currency === "PESOS" && " · cash on delivery"}
                        </p>
                      </div>
                      <p className={`text-sm font-semibold ${isRefund ? "text-sky-700" : "text-slate-900"}`}>
                        {isRefund ? "+" : t.currency === "POINTS" ? "−" : ""}
                        {formatAmount(t.amount, t.currency)}
                      </p>
                    </div>

                    {orderStatus && (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${ORDER_STATUS_STYLES[orderStatus]}`}>
                          {ORDER_STATUS_LABELS[orderStatus]}
                        </span>
                        {orderStatus !== "CANCELLED" && (
                          <ol className="flex flex-1 items-center gap-1" aria-label="Delivery progress">
                            {ORDER_STEPS.map((step, i) => (
                              <li
                                key={step}
                                title={ORDER_STATUS_LABELS[step]}
                                className={`h-1.5 flex-1 rounded-full ${i <= stepIndex ? "bg-emerald-500" : "bg-slate-200"}`}
                              />
                            ))}
                          </ol>
                        )}
                      </div>
                    )}

                    {redemptionStatus && (
                      <div className="space-y-1">
                        <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${REDEMPTION_STATUS[redemptionStatus].style}`}>
                          {REDEMPTION_STATUS[redemptionStatus].label}
                        </span>
                        {t.redemption?.eWalletNumber && <p className="text-xs text-slate-500">To {t.redemption.eWalletNumber}</p>}
                        {redemptionStatus === "FULFILLED" && t.redemption?.adminNote && (
                          <p className="break-all text-xs text-slate-600">
                            {t.redemption.reward.rewardType === "VOUCHER" ? "Voucher code: " : "Reference no.: "}
                            <span className="font-mono font-medium">{t.redemption.adminNote}</span>
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {history.length === HISTORY_SIZE && (
        <p className="text-center text-xs text-slate-500">Showing your latest {HISTORY_SIZE} transactions.</p>
      )}
    </div>
  );
}
