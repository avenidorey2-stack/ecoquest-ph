import { requireAdminPage } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { BRANDS } from "@/lib/rewards";
import RewardCatalog from "@/components/admin/RewardCatalog";

export default async function AdminRewardsPage() {
  await requireAdminPage();

  const rewards = await prisma.reward.findMany({
    orderBy: [{ isActive: "desc" }, { rewardType: "asc" }, { brand: "asc" }, { valuePesos: "asc" }],
    include: { _count: { select: { redemptions: { where: { status: { not: "REJECTED" } } } } } },
  });

  return (
    <div className="p-4">
      <h1 className="mb-1 font-semibold">Reward catalogue</h1>
      <p className="mb-4 text-sm text-slate-500">
        Hidden rewards disappear from the shop but keep their history. Price changes don&apos;t affect requests already
        made.
      </p>
      <RewardCatalog
        brands={BRANDS}
        rewards={rewards.map((r) => ({
          id: r.id,
          rewardType: r.rewardType,
          brand: r.brand,
          costPoints: r.costPoints,
          valuePesos: r.valuePesos,
          isActive: r.isActive,
          redemptions: r._count.redemptions,
        }))}
      />
    </div>
  );
}
