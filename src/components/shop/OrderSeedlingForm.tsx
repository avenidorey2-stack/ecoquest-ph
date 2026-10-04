"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatPesos, formatPoints } from "@/lib/format";
import ActivePill from "@/components/ui/ActivePill";

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
    "grid h-11 w-11 place-items-center text-lg font-semibold text-ink-2 transition-colors hover:bg-emerald-400/10 hover:text-emerald-300 disabled:cursor-not-allowed disabled:text-ink-4 disabled:hover:bg-transparent";
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
      className={`relative min-h-11 flex-1 rounded-md px-2 text-sm font-semibold transition-colors ${
        currency === value ? "text-emerald-300" : "text-ink-3 hover:text-ink"
      } disabled:cursor-not-allowed disabled:text-ink-4`}
    >
      {currency === value && <ActivePill id={`pay-${product.id}`} className="inset-0 rounded-md bg-card shadow-sm ring-1 ring-line" />}
      <span className="relative">{label}</span>
    </button>
  );

  return (
    <form onSubmit={order} className="space-y-2.5">
      <div role="radiogroup" aria-label="Pay with" className="flex gap-1 rounded-lg bg-card-2 p-1">
        {option("POINTS", "Points")}
        {option("PESOS", pesosAvailable ? "Pesos (COD)" : "Pesos —", !pesosAvailable)}
      </div>

      <div className="flex items-center justify-between gap-2">
        <label htmlFor={`qty-${product.id}`} className="text-xs font-medium text-ink-3">
          Quantity
        </label>
        <div className="flex items-center overflow-hidden rounded-lg border border-line bg-card">
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
            className="h-11 w-14 border-x border-line text-center text-sm font-semibold text-ink [appearance:textfield] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-emerald-500 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <button type="button" onClick={() => change(quantity + 1)} disabled={soldOut || quantity >= limit || busy} aria-label="Increase quantity" className={stepBtn}>
            +
          </button>
        </div>
      </div>

      <button
        type="submit"
        disabled={soldOut || !valid || !affordable || busy}
        className="min-h-12 w-full rounded-xl bg-emerald-400 py-3 text-sm font-bold text-emerald-950 shadow-sm transition-colors hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-card-2 disabled:text-ink-4 disabled:shadow-none"
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
        <p className="text-[11px] leading-snug text-ink-3">Pay cash when your seedlings arrive — no points used.</p>
      )}

      {message && (
        <p role="status" className={`text-xs ${message.ok ? "text-emerald-400" : "text-red-400"}`}>
          {message.text}
        </p>
      )}
    </form>
  );
}
