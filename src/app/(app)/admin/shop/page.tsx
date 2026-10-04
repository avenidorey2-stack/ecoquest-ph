import Link from "next/link";
import { requireAdminPage } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import type { OrderStatus } from "@/generated/prisma/client";
import InventoryTable from "@/components/admin/InventoryTable";
import OrderManager from "@/components/admin/OrderManager";
import { ORDER_STATUS_LABELS } from "@/lib/order-status";
import ActivePill from "@/components/ui/ActivePill";

const ORDER_LIMIT = 100;
const STATUS_FILTERS: (OrderStatus | "OPEN" | "ALL")[] = ["OPEN", "PENDING", "PACKED", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED", "ALL"];
const OPEN_STATUSES: OrderStatus[] = ["PENDING", "PACKED", "OUT_FOR_DELIVERY"];
const filterLabel = (f: (typeof STATUS_FILTERS)[number]) =>
  f === "OPEN" ? "Needs action" : f === "ALL" ? "All" : ORDER_STATUS_LABELS[f];

export default async function AdminShopPage({ searchParams }: PageProps<"/admin/shop">) {
  await requireAdminPage();
  const params = await searchParams;
  const tab = params.tab === "orders" ? "orders" : "inventory";
  const filter = STATUS_FILTERS.find((f) => f === params.status) ?? "OPEN";

  const [openCount, products, orders] = await Promise.all([
    prisma.order.count({ where: { status: { in: OPEN_STATUSES } } }),
    tab === "inventory"
      ? prisma.seedlingProduct.findMany({
          orderBy: { species: { sortOrder: "asc" } },
          include: { species: { select: { name: true, category: true, imageUrl: true } } },
        })
      : [],
    tab === "orders"
      ? prisma.order.findMany({
          where: filter === "ALL" ? {} : { status: filter === "OPEN" ? { in: OPEN_STATUSES } : filter },
          // Oldest first while there's work to do (first in, first packed); newest first otherwise.
          orderBy: { createdAt: filter === "OPEN" || filter === "PENDING" || filter === "PACKED" ? "asc" : "desc" },
          take: ORDER_LIMIT,
          include: {
            user: { select: { name: true, email: true, city: true } },
            product: { select: { species: { select: { name: true } } } },
          },
        })
      : [],
  ]);

  const tabLink = (value: "inventory" | "orders", label: string) => (
    <Link
      href={`/admin/shop?tab=${value}`}
      aria-current={tab === value ? "page" : undefined}
      className={`relative rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
        tab === value ? "text-emerald-300" : "text-ink-2 hover:text-ink"
      }`}
    >
      {tab === value && <ActivePill id="admin-shop-tab" className="inset-0 rounded-lg bg-card shadow-sm ring-1 ring-line" />}
      <span className="relative">{label}</span>
    </Link>
  );

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">Shop &amp; orders</h2>
          <p className="text-sm text-ink-3">Seedling prices, stock and order fulfilment.</p>
        </div>
        <nav className="flex gap-1 rounded-xl bg-card-2 p-1" aria-label="Shop sections">
          {tabLink("inventory", "Inventory")}
          {tabLink("orders", `Orders${openCount ? ` (${openCount})` : ""}`)}
        </nav>
      </div>

      {tab === "inventory" ? (
        products.length === 0 ? (
          <p className="eq-panel rounded-2xl border border-line bg-card p-8 text-center text-sm text-ink-3">
            No seedling products yet. Run <code className="rounded bg-card-2 px-1">npm run db:seed</code> to stock the shop.
          </p>
        ) : (
          <>
            <p className="text-xs text-ink-3">
              A peso price of ₱0.00 hides the pesos option for that seedling. Peso orders are paid cash on delivery.
            </p>
            <InventoryTable
              rows={products.map((p) => ({
                id: p.id,
                name: p.species.name,
                category: p.species.category,
                imageUrl: p.species.imageUrl,
                priceInPoints: p.priceInPoints,
                priceInPesos: p.priceInPesos,
                stockQuantity: p.stockQuantity,
                isActive: p.isActive,
              }))}
            />
          </>
        )
      ) : (
        <>
          <nav className="flex flex-wrap gap-2" aria-label="Filter orders by status">
            {STATUS_FILTERS.map((f) => (
              <Link
                key={f}
                href={`/admin/shop?tab=orders&status=${f}`}
                aria-current={filter === f ? "page" : undefined}
                className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ${
                  filter === f ? "bg-emerald-400 text-emerald-950 ring-emerald-700" : "bg-card text-ink-2 ring-line hover:ring-emerald-400/40"
                }`}
              >
                {filterLabel(f)}
              </Link>
            ))}
          </nav>
          <OrderManager
            orders={orders.map((o) => ({
              id: o.id,
              createdAt: o.createdAt.toISOString(),
              quantity: o.quantity,
              totalPrice: o.totalPrice,
              currencyUsed: o.currencyUsed,
              status: o.status,
              productName: o.product.species.name,
              customerName: o.user.name ?? "Unnamed planter",
              customerEmail: o.user.email,
              customerCity: o.user.city,
            }))}
          />
          {orders.length === ORDER_LIMIT && (
            <p className="text-center text-xs text-ink-3">Showing the first {ORDER_LIMIT} orders.</p>
          )}
        </>
      )}
    </div>
  );
}
