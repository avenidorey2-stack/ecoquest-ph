"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Currency, OrderStatus } from "@/generated/prisma/enums";
import { formatAmount } from "@/lib/format";
import { ORDER_STATUS_LABELS, ORDER_STATUS_STYLES } from "@/lib/order-status";
import { deliveryWindow, formatBarangay, formatPhMobile, type DeliveryDetails } from "@/lib/delivery";

export type AdminOrder = {
  id: string;
  createdAt: string;
  quantity: number;
  totalPrice: number;
  currencyUsed: Currency;
  status: OrderStatus;
  productName: string;
  customerName: string;
  customerEmail: string | null;
  customerCity: string | null;
  packedAt: string | null;
  /** Cash-on-delivery address and contact (admins only). */
  delivery: DeliveryDetails | null;
};

function DeliveryCard({ d, packedAt, status }: { d: DeliveryDetails; packedAt: string | null; status: OrderStatus }) {
  const row = "grid grid-cols-[6.5rem_1fr] gap-2";
  return (
    <div className="mt-3 rounded-xl border border-line bg-card-2 p-3 text-sm">
      <p className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-300">
        Deliver to
        {packedAt && (status === "PACKED" || status === "OUT_FOR_DELIVERY") && (
          <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 normal-case tracking-normal text-emerald-200 ring-1 ring-emerald-400/25">
            Promised {deliveryWindow(packedAt)}
          </span>
        )}
      </p>
      <dl className="space-y-1 text-ink-2">
        <div className={row}>
          <dt className="text-ink-4">Recipient</dt>
          <dd className="font-medium text-ink">{d.recipientName}</dd>
        </div>
        <div className={row}>
          <dt className="text-ink-4">Mobile</dt>
          <dd>
            <a href={`tel:${d.contactNumber}`} className="font-medium text-emerald-300 underline-offset-2 hover:underline">
              {formatPhMobile(d.contactNumber)}
            </a>
          </dd>
        </div>
        <div className={row}>
          <dt className="text-ink-4">Address</dt>
          <dd>
            {d.streetAddress}, {formatBarangay(d.barangay)}, {d.cityProvince}
          </dd>
        </div>
        <div className={row}>
          <dt className="text-ink-4">Landmark</dt>
          <dd>{d.landmark}</dd>
        </div>
        {d.instructions && (
          <div className={row}>
            <dt className="text-ink-4">Instructions</dt>
            <dd className="whitespace-pre-line">{d.instructions}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}

/** Label of the button that moves an order to its next status. */
const NEXT_ACTION: Partial<Record<OrderStatus, string>> = {
  PENDING: "📦 Pack It Up",
  PACKED: "🚚 Send out for delivery",
  OUT_FOR_DELIVERY: "✅ Mark delivered",
};
const CANCELLABLE: OrderStatus[] = ["PENDING", "PACKED"];

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export default function OrderManager({ orders }: { orders: AdminOrder[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);
  const [error, setError] = useState<{ id: string; text: string } | null>(null);

  async function act(id: string, action: "advance" | "cancel") {
    setBusy(id);
    setError(null);
    const res = await fetch(`/api/admin/orders/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    }).catch(() => null);
    setBusy(null);
    setConfirmCancel(null);
    if (!res?.ok) {
      setError({ id, text: (res && (await res.json().catch(() => ({}))).error) ?? "Update failed." });
      return;
    }
    router.refresh();
  }

  if (orders.length === 0) {
    return <p className="eq-panel rounded-2xl border border-line bg-card p-8 text-center text-sm text-ink-3">No orders here.</p>;
  }

  return (
    <ul className="eq-stagger space-y-3">
      {orders.map((o) => {
        const next = NEXT_ACTION[o.status];
        const cancellable = CANCELLABLE.includes(o.status);
        return (
          <li key={o.id} className="eq-panel rounded-2xl border border-line/80 bg-card p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-ink">
                  {o.quantity} × {o.productName}
                </p>
                <p className="text-sm text-ink-2">
                  {o.customerName}
                  {o.customerEmail && <span className="text-ink-4"> · {o.customerEmail}</span>}
                </p>
                <p className="text-xs text-ink-3">
                  {fmtDate(o.createdAt)}
                  {o.customerCity && ` · ${o.customerCity}`} · #{o.id.slice(-6)}
                </p>
              </div>
              <div className="text-right">
                <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${ORDER_STATUS_STYLES[o.status]}`}>
                  {ORDER_STATUS_LABELS[o.status]}
                </span>
                <p className="mt-1 text-sm font-semibold text-ink">{formatAmount(o.totalPrice, o.currencyUsed)}</p>
                <p className="text-xs text-ink-3">{o.currencyUsed === "PESOS" ? "Cash on delivery" : "Paid with points"}</p>
              </div>
            </div>

            {o.delivery && <DeliveryCard d={o.delivery} packedAt={o.packedAt} status={o.status} />}

            {(next || cancellable) && (
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                {next && (
                  <button
                    onClick={() => act(o.id, "advance")}
                    disabled={busy === o.id}
                    className="rounded-lg bg-emerald-400 px-3 py-1.5 text-sm font-semibold text-emerald-950 hover:bg-emerald-300 disabled:opacity-50"
                  >
                    {busy === o.id ? "Updating…" : next}
                  </button>
                )}
                {cancellable &&
                  (confirmCancel === o.id ? (
                    <span className="flex flex-wrap items-center gap-2 text-xs text-red-300">
                      Cancel and restock{o.currencyUsed === "POINTS" ? " (points are refunded)" : ""}?
                      <button
                        onClick={() => act(o.id, "cancel")}
                        disabled={busy === o.id}
                        className="rounded-md bg-red-600 px-2.5 py-1 font-semibold text-white disabled:opacity-50"
                      >
                        Yes, cancel
                      </button>
                      <button onClick={() => setConfirmCancel(null)} className="rounded-md px-2.5 py-1 hover:bg-red-400/10">
                        No
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setConfirmCancel(o.id)}
                      className="rounded-lg px-3 py-1.5 text-sm text-red-300 hover:bg-red-400/10"
                    >
                      Cancel order
                    </button>
                  ))}
                {error?.id === o.id && <span className="text-xs text-red-400">{error.text}</span>}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
