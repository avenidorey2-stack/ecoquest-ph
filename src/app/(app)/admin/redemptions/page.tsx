import { requireAdminPage } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import RedemptionActions from "@/components/admin/RedemptionActions";

export default async function AdminRedemptionsPage() {
  await requireAdminPage();

  const pending = await prisma.redemptionHistory.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    include: {
      user: { select: { name: true, email: true } },
      reward: { select: { rewardType: true, brand: true, valuePesos: true } },
    },
  });

  return (
    <div className="p-4">
      <h1 className="mb-4 font-semibold">Pending cashouts &amp; vouchers ({pending.length})</h1>
      {pending.length === 0 ? (
        <p className="text-sm text-slate-500">No redemption requests waiting.</p>
      ) : (
        <ul className="space-y-3">
          {pending.map((r) => {
            const isCash = r.reward.rewardType === "EWALLET_CASH";
            return (
              <li key={r.id} className="grid grid-cols-1 gap-3 rounded-xl border bg-white p-4 text-sm shadow-sm md:grid-cols-3">
                <div>
                  <p className="font-medium">{r.user.name ?? r.user.email ?? "Unknown user"}</p>
                  <p className="text-xs text-slate-500">{r.createdAt.toLocaleString("en-PH")}</p>
                </div>
                <div>
                  <p>
                    <span className="font-medium">
                      ₱{r.reward.valuePesos} {r.reward.brand} {isCash ? "cashout" : "voucher"}
                    </span>{" "}
                    · <span className="text-slate-600">{r.pointsSpent} pts</span>
                  </p>
                  {isCash && (
                    <p className="font-mono text-slate-800">{r.eWalletNumber ?? "No e-wallet number provided"}</p>
                  )}
                </div>
                <RedemptionActions id={r.id} isCash={isCash} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
