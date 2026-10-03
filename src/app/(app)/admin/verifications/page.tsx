import { requireAdminPage } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import VerificationReviewCard from "@/components/admin/VerificationReviewCard";

export default async function AdminVerificationsPage() {
  await requireAdminPage();

  const pending = await prisma.verification.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    include: {
      quest: {
        select: {
          plantCount: true,
          targetPlants: true,
          user: { select: { name: true, email: true } },
          slot: { select: { city: true, province: true, requiredPlantType: true, pointsPerPlant: true } },
        },
      },
    },
  });

  return (
    <div className="p-4">
      <h1 className="mb-4 font-semibold">Pending verifications ({pending.length})</h1>
      {pending.length === 0 ? (
        <p className="text-sm text-slate-500">All caught up — no submissions waiting for review.</p>
      ) : (
        <ul className="eq-stagger eq-spring grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {pending.map((v) => (
            <VerificationReviewCard
              key={v.id}
              item={{
                id: v.id,
                mediaUrl: v.mediaUrl,
                mediaType: v.mediaType,
                submittedAt: v.createdAt.toISOString(),
                plantCount: v.plantCount,
                quest: { progress: v.quest.plantCount, target: v.quest.targetPlants },
                user: v.quest.user,
                slot: v.quest.slot,
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
