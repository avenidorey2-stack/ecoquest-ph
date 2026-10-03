import Link from "next/link";
import { requireAdminPage } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { PinIcon, SproutIcon, TreeIcon, UsersIcon } from "@/components/ui/icons";

export default async function AdminOverviewPage() {
  await requireAdminPage();

  const [totalUsers, trees, activeSlots, pendingOrders] = await Promise.all([
    prisma.user.count({ where: { role: "USER" } }),
    prisma.plantedTree.aggregate({ _sum: { count: true } }),
    prisma.slot.count({ where: { status: "OPEN", deletedAt: null } }),
    prisma.order.count({ where: { status: "PENDING" } }),
  ]);

  const metrics = [
    { label: "Total users", value: totalUsers, hint: "Registered planters", Icon: UsersIcon, href: null },
    { label: "Total trees", value: trees._sum.count ?? 0, hint: "Verified plantings", Icon: TreeIcon, href: null },
    { label: "Active slots", value: activeSlots, hint: "Open for claims", Icon: PinIcon, href: "/admin/slots" },
    { label: "Pending orders", value: pendingOrders, hint: "Seedlings to pack", Icon: SproutIcon, href: "/admin/shop?tab=orders" },
  ];

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Overview</h2>
        <p className="text-sm text-slate-500">Platform-wide totals. Use the tabs above to manage each area.</p>
      </div>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(({ label, value, hint, Icon, href }) => {
          const body = (
            <>
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
                <Icon className="h-5 w-5" />
              </span>
              <p className="mt-4 text-3xl font-bold tracking-tight text-slate-900">{value.toLocaleString("en-PH")}</p>
              <p className="text-sm font-medium text-slate-700">{label}</p>
              <p className="text-xs text-slate-500">{hint}</p>
            </>
          );
          const card = "block h-full rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm";
          return (
            <li key={label}>
              {href ? (
                <Link href={href} className={`${card} transition-colors hover:border-emerald-300`}>
                  {body}
                </Link>
              ) : (
                <div className={card}>{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
