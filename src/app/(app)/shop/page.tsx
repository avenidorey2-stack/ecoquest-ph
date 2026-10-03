import Link from "next/link";
import { requirePageUserId } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { MAX_ORDER_QUANTITY } from "@/lib/seedlings";
import { formatAmount, formatPesos } from "@/lib/format";
import { ORDER_STATUS_LABELS, ORDER_STATUS_STYLES } from "@/lib/order-status";
import OrderSeedlingForm from "@/components/shop/OrderSeedlingForm";
import { CoinIcon, SproutIcon } from "@/components/ui/icons";

export const metadata = { title: "Seedling Shop · EcoQuest PH" };

const LOW_STOCK = 10;

const fmtDate = (d: Date) =>
  d.toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" });

export default async function SeedlingShopPage() {
  const userId = await requirePageUserId();

  const [user, products, orders] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { points: true } }),
    prisma.seedlingProduct.findMany({
      where: { isActive: true },
      orderBy: { species: { sortOrder: "asc" } },
      include: { species: { select: { name: true, scientificName: true, category: true, imageUrl: true } } },
    }),
    prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { product: { select: { species: { select: { name: true } } } } },
    }),
  ]);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-emerald-900/10 bg-gradient-to-br from-emerald-800 to-emerald-950 p-5 text-white shadow-sm sm:p-6">
        <div className="max-w-xl">
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
            <SproutIcon className="h-4 w-4" /> Seedling shop
          </p>
          <h2 className="mt-1 text-xl font-bold sm:text-2xl">Grow the next forest</h2>
          <p className="mt-1 text-sm text-emerald-100/80">
            Order native Philippine seedlings with your planting points, or pay in pesos cash on delivery.
          </p>
        </div>
        <div className="rounded-xl bg-white/10 px-4 py-3 text-right ring-1 ring-white/15">
          <p className="text-[11px] uppercase tracking-[0.16em] text-emerald-200">Your balance</p>
          <p className="flex items-center justify-end gap-1.5 text-2xl font-bold">
            <CoinIcon className="h-5 w-5 text-amber-300" />
            {user.points.toLocaleString("en-PH")}
            <span className="text-sm font-medium text-emerald-200">pts</span>
          </p>
        </div>
      </section>

      {products.length === 0 ? (
        <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          No seedlings are in stock right now. Check back soon!
        </p>
      ) : (
        <ul className="eq-stagger eq-spring grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {products.map((p) => {
            const soldOut = p.stockQuantity < 1;
            return (
              <li
                key={p.id}
                className="flex flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,.04),0_8px_24px_-12px_rgba(15,23,42,.08)]"
              >
                <div className="relative aspect-[4/3] bg-cream-100">
                  {/* eslint-disable-next-line @next/next/no-img-element -- generated SVG illustration */}
                  <img
                    src={p.species.imageUrl}
                    alt={`${p.species.name} illustration`}
                    loading="lazy"
                    className={`h-full w-full object-cover ${soldOut ? "opacity-50 grayscale" : ""}`}
                  />
                  <span className="absolute left-3 top-3 max-w-[85%] truncate rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-800 shadow-sm">
                    {p.species.category}
                  </span>
                </div>

                <div className="flex flex-1 flex-col gap-3 p-4">
                  <div>
                    <h3 className="font-semibold text-slate-900">{p.species.name}</h3>
                    <p className="text-xs italic text-slate-500">{p.species.scientificName}</p>
                  </div>

                  <div className="flex items-end justify-between gap-2">
                    <div>
                      <p className="flex items-center gap-1 text-lg font-bold text-emerald-800">
                        <CoinIcon className="h-4 w-4 text-amber-500" />
                        {p.priceInPoints.toLocaleString("en-PH")}
                        <span className="text-xs font-medium text-slate-500">pts each</span>
                      </p>
                      {p.priceInPesos > 0 && (
                        <p className="text-xs font-medium text-slate-600">or {formatPesos(p.priceInPesos)} cash on delivery</p>
                      )}
                    </div>
                    <p
                      className={`text-right text-xs font-medium ${
                        soldOut ? "text-red-600" : p.stockQuantity <= LOW_STOCK ? "text-amber-700" : "text-slate-500"
                      }`}
                    >
                      {soldOut ? "Out of stock" : `${p.stockQuantity.toLocaleString("en-PH")} available`}
                    </p>
                  </div>

                  <div className="mt-auto border-t border-slate-100 pt-3">
                    <OrderSeedlingForm
                      product={{
                        id: p.id,
                        name: p.species.name,
                        priceInPoints: p.priceInPoints,
                        priceInPesos: p.priceInPesos,
                        stockQuantity: p.stockQuantity,
                      }}
                      balance={user.points}
                      maxQuantity={MAX_ORDER_QUANTITY}
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white">
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">My seedling orders</h2>
          <Link href="/transactions" className="text-xs font-medium text-emerald-700 hover:text-emerald-900">
            Full history →
          </Link>
        </header>
        {orders.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-500">No orders yet — pick a seedling above to get started.</p>
        ) : (
          <ul className="eq-stagger divide-y divide-slate-100 text-sm">
            {orders.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">
                    {o.quantity} × {o.product.species.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {fmtDate(o.createdAt)} · {formatAmount(o.totalPrice, o.currencyUsed)}
                    {o.currencyUsed === "PESOS" && " · cash on delivery"}
                  </p>
                </div>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${ORDER_STATUS_STYLES[o.status]}`}>
                  {ORDER_STATUS_LABELS[o.status]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
