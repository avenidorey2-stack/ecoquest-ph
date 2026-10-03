import { requireAdminPage } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import PatronAdManager from "@/components/admin/PatronAdManager";

export default async function AdminPatronsPage() {
  await requireAdminPage();

  const ads = await prisma.patronAd.findMany({
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    select: { id: true, companyName: true, imageUrl: true, targetUrl: true, isActive: true },
  });

  return (
    <div className="p-4">
      <h1 className="mb-1 font-semibold">Patron banners</h1>
      <p className="mb-4 text-sm text-slate-500">Live banners rotate at the top of every user&apos;s dashboard.</p>
      <PatronAdManager ads={ads} />
    </div>
  );
}
