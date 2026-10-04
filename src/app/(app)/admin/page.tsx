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
    { label: "Total users", value: totalUsers, hint: "Registered planters", Icon: UsersIcon, href: "/admin/users" },
    { label: "Total trees", value: trees._sum.count ?? 0, hint: "Verified plantings", Icon: TreeIcon, href: null },
    { label: "Active slots", value: activeSlots, hint: "Open for claims", Icon: PinIcon, href: "/admin/slots" },
    { label: "Pending orders", value: pendingOrders, hint: "Seedlings to pack", Icon: SproutIcon, href: "/admin/shop?tab=orders" },
  ];

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div>
        <h2 className="text-lg font-semibold text-ink">Overview</h2>
        <p className="text-sm text-ink-3">Platform-wide totals. Use the tabs above to manage each area.</p>
      </div>
      <ul className="eq-stagger eq-spring grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(({ label, value, hint, Icon, href }) => {
          const body = (
            <>
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-400/10 text-emerald-400 ring-1 ring-emerald-400/20">
                <Icon className="h-5 w-5" />
              </span>
              <p className="mt-4 text-3xl font-bold tracking-tight text-ink">{value.toLocaleString("en-PH")}</p>
              <p className="text-sm font-medium text-ink-2">{label}</p>
              <p className="text-xs text-ink-3">{hint}</p>
            </>
          );
          const card = "eq-panel block h-full rounded-2xl border border-line/80 bg-card p-5 shadow-sm";
          return (
            <li key={label}>
              {href ? (
                <Link href={href} className={`${card} transition-colors hover:border-emerald-400/40`}>
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
