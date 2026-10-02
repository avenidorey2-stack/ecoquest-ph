"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatPesos, formatPoints } from "@/lib/format";

type Currency = "POINTS" | "PESOS";

/** Pay-with toggle, quantity spinner and "Order Seedling" button for one seedling card. */
export default function OrderSeedlingForm({
  product,
  balance,
  maxQuantity,
}: {
  product: { id: string; name: string; priceInPoints: number; priceInPesos: number; stockQuantity: number };
  balance: number;
  maxQuantity: number;
}) {
  const router = useRouter();
  const pesosAvailable = product.priceInPesos > 0;
  const limit = Math.max(0, Math.min(maxQuantity, product.stockQuantity));
  const [currency, setCurrency] = useState<Currency>("POINTS");
  const [quantity, setQuantity] = useState(limit > 0 ? 1 : 0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const soldOut = product.stockQuantity < 1;
  const valid = Number.isInteger(quantity) && quantity >= 1 && quantity <= limit;
  const pointsTotal = quantity * product.priceInPoints;
  const pesosTotal = Math.round(quantity * product.priceInPesos * 100) / 100;
  const affordable = currency === "PESOS" || pointsTotal <= balance;

  function change(next: number) {
    setMessage(null);
    setQuantity(Number.isNaN(next) ? 0 : Math.max(0, Math.min(limit, Math.trunc(next))));
  }

  async function order(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || !affordable) return;
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/shop/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: product.id, quantity, currency }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      const error = res ? (await res.json().catch(() => ({}))).error : null;
      setMessage({ ok: false, text: error ?? "Order failed. Please try again." });
      return;
    }
    setMessage({
      ok: true,
      text:
        currency === "PESOS"
          ? `Ordered ${quantity} × ${product.name} — pay ${formatPesos(pesosTotal)} on delivery.`
          : `Ordered ${quantity} × ${product.name}!`,
    });
    setQuantity(1);
    router.refresh(); // updates stock, balance and order history
  }

  const stepBtn =
    "grid h-9 w-9 place-items-center text-lg font-semibold text-slate-600 transition-colors hover:bg-emerald-50 hover:text-emerald-800 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent";
  const option = (value: Currency, label: string, disabled = false) => (
    <button
      type="button"
      role="radio"
      aria-checked={currency === value}
      disabled={disabled || busy}
      onClick={() => {
        setMessage(null);
        setCurrency(value);
      }}
      className={`flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors ${
        currency === value ? "bg-white text-emerald-800 shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:text-slate-800"
      } disabled:cursor-not-allowed disabled:text-slate-300`}
    >
      {label}
    </button>
  );

  return (
    <form onSubmit={order} className="space-y-2.5">
      <div role="radiogroup" aria-label="Pay with" className="flex gap-1 rounded-lg bg-slate-100 p-1">
        {option("POINTS", "Points")}
        {option("PESOS", pesosAvailable ? "Pesos (COD)" : "Pesos —", !pesosAvailable)}
      </div>

      <div className="flex items-center justify-between gap-2">
        <label htmlFor={`qty-${product.id}`} className="text-xs font-medium text-slate-500">
          Quantity
        </label>
        <div className="flex items-center overflow-hidden rounded-lg border border-slate-200 bg-white">
          <button type="button" onClick={() => change(quantity - 1)} disabled={soldOut || quantity <= 1 || busy} aria-label="Decrease quantity" className={stepBtn}>
            −
          </button>
          <input
            id={`qty-${product.id}`}
            type="number"
            inputMode="numeric"
            min={1}
            max={limit || 1}
            step={1}
            value={quantity || ""}
            onChange={(e) => change(e.target.valueAsNumber)}
            disabled={soldOut || busy}
            className="h-9 w-12 border-x border-slate-200 text-center text-sm font-semibold text-slate-900 [appearance:textfield] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-emerald-500 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <button type="button" onClick={() => change(quantity + 1)} disabled={soldOut || quantity >= limit || busy} aria-label="Increase quantity" className={stepBtn}>
            +
          </button>
        </div>
      </div>

      <button
        type="submit"
        disabled={soldOut || !valid || !affordable || busy}
        className="w-full rounded-xl bg-emerald-700 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none"
      >
        {soldOut
          ? "Out of stock"
          : busy
            ? "Ordering…"
            : valid && !affordable
              ? `Need ${formatPoints(pointsTotal - balance)} more`
              : `Order Seedling${valid ? ` · ${currency === "PESOS" ? formatPesos(pesosTotal) : formatPoints(pointsTotal)}` : ""}`}
      </button>

      {currency === "PESOS" && !soldOut && (
        <p className="text-[11px] leading-snug text-slate-500">Pay cash when your seedlings arrive — no points used.</p>
      )}

      {message && (
        <p role="status" className={`text-xs ${message.ok ? "text-emerald-700" : "text-red-600"}`}>
          {message.text}
        </p>
      )}
    </form>
  );
}
