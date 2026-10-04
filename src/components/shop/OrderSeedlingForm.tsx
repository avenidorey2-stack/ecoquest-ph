"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatPesos, formatPoints } from "@/lib/format";
import { DELIVERY_DAYS, MAX_INSTRUCTIONS, parseDeliveryDetails, type DeliveryDetails } from "@/lib/delivery";
import ActivePill from "@/components/ui/ActivePill";

type Currency = "POINTS" | "PESOS";

/** Values that pre-fill the delivery form. */
export type DeliveryDefaults = Partial<Record<keyof DeliveryDetails, string | null>>;

type DeliveryForm = Record<keyof DeliveryDetails, string>;

const DELIVERY_PROMISE = `Delivered within ${DELIVERY_DAYS.min}–${DELIVERY_DAYS.max} days after our team packs your order.`;

/** Pay-with toggle, delivery details, quantity and "Order Seedling" button. */
export default function OrderSeedlingForm({
  product,
  balance,
  maxQuantity,
  deliveryDefaults = {},
}: {
  product: { id: string; name: string; priceInPoints: number; priceInPesos: number; stockQuantity: number };
  balance: number;
  maxQuantity: number;
  deliveryDefaults?: DeliveryDefaults;
}) {
  const router = useRouter();
  const pesosAvailable = product.priceInPesos > 0;
  const limit = Math.max(0, Math.min(maxQuantity, product.stockQuantity));
  const [currency, setCurrency] = useState<Currency>("POINTS");
  const [quantity, setQuantity] = useState(limit > 0 ? 1 : 0);
  const [delivery, setDelivery] = useState<DeliveryForm>(() => ({
    recipientName: deliveryDefaults.recipientName ?? "",
    contactNumber: deliveryDefaults.contactNumber ?? "",
    streetAddress: deliveryDefaults.streetAddress ?? "",
    barangay: deliveryDefaults.barangay ?? "",
    cityProvince: deliveryDefaults.cityProvince ?? "",
    landmark: deliveryDefaults.landmark ?? "",
    instructions: deliveryDefaults.instructions ?? "",
  }));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const soldOut = product.stockQuantity < 1;
  const cod = currency === "PESOS";
  const valid = Number.isInteger(quantity) && quantity >= 1 && quantity <= limit;
  const pointsTotal = quantity * product.priceInPoints;
  const pesosTotal = Math.round(quantity * product.priceInPesos * 100) / 100;
  const affordable = cod || pointsTotal <= balance;

  function change(next: number) {
    setMessage(null);
    setQuantity(Number.isNaN(next) ? 0 : Math.max(0, Math.min(limit, Math.trunc(next))));
  }

  function setField(key: keyof DeliveryForm, value: string) {
    setMessage(null);
    setDelivery((d) => ({ ...d, [key]: value }));
  }

  async function order(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || !affordable) return;
    // Same checks as the server, so mistakes show before anything is sent.
    const details = parseDeliveryDetails(delivery);
    if (!details.ok) {
      setMessage({ ok: false, text: details.error });
      return;
    }
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/shop/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: product.id, quantity, currency, delivery: details.data }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      const error = res ? (await res.json().catch(() => ({}))).error : null;
      setMessage({ ok: false, text: error ?? "Order failed. Please try again." });
      return;
    }
    setMessage({
      ok: true,
      text: cod
        ? `Ordered ${quantity} × ${product.name} — pay ${formatPesos(pesosTotal)} on delivery. ${DELIVERY_PROMISE}`
        : `Ordered ${quantity} × ${product.name}! ${DELIVERY_PROMISE}`,
    });
    setQuantity(1);
    router.refresh(); // updates stock, balance and order history
  }

  const stepBtn =
    "grid h-11 w-11 place-items-center text-lg font-semibold text-ink-2 transition-colors hover:bg-emerald-400/10 hover:text-emerald-300 disabled:cursor-not-allowed disabled:text-ink-4 disabled:hover:bg-transparent";
  const inputCls =
    "mt-1 block w-full rounded-xl border border-line-strong bg-card-2 px-3 py-2.5 text-base text-ink outline-none transition placeholder:text-ink-4 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-400/20 sm:text-sm";
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
  const field = (
    key: Exclude<keyof DeliveryForm, "instructions">,
    label: string,
    props: React.InputHTMLAttributes<HTMLInputElement> = {},
  ) => (
    <label className="block text-xs font-medium text-ink-2">
      {label}
      <input
        {...props}
        name={key}
        value={delivery[key]}
        onChange={(e) => setField(key, e.target.value)}
        disabled={busy}
        required
        className={inputCls}
      />
    </label>
  );

  return (
    <form onSubmit={order} className="space-y-2.5">
      <div role="radiogroup" aria-label="Pay with" className="flex gap-1 rounded-lg bg-card-2 p-1">
        {option("POINTS", "Points")}
        {option("PESOS", pesosAvailable ? "Pesos (COD)" : "Pesos —", !pesosAvailable)}
      </div>

      {!soldOut && (
        <fieldset className="space-y-2.5 rounded-xl border border-line bg-card/60 p-3">
          <legend className="px-1 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-300">Delivery details</legend>
          <p className="text-[11px] leading-snug text-ink-3">Only you and our delivery team can see these.</p>
          {field("recipientName", "Recipient name", { autoComplete: "name", maxLength: 80 })}
          {field("contactNumber", "Mobile number", {
            type: "tel",
            inputMode: "tel",
            autoComplete: "tel",
            placeholder: "0917 123 4567",
            maxLength: 20,
          })}
          {field("streetAddress", "House no. / street", { autoComplete: "address-line1", maxLength: 160 })}
          <div className="grid gap-2.5 sm:grid-cols-2">
            {field("barangay", "Barangay", { autoComplete: "address-level3", maxLength: 80 })}
            {field("cityProvince", "City / province", { autoComplete: "address-level2", maxLength: 80 })}
          </div>
          {field("landmark", "Landmark", { placeholder: "e.g. beside the barangay hall, green gate", maxLength: 120 })}
          <label className="block text-xs font-medium text-ink-2">
            Delivery instructions <span className="font-normal text-ink-4">(optional)</span>
            <textarea
              name="instructions"
              value={delivery.instructions}
              onChange={(e) => setField("instructions", e.target.value)}
              disabled={busy}
              rows={2}
              maxLength={MAX_INSTRUCTIONS}
              placeholder="e.g. Call when you arrive; leave with the guard"
              className={`${inputCls} resize-none`}
            />
          </label>
        </fieldset>
      )}

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

      {!soldOut && (
        <p className="flex gap-2 rounded-lg bg-emerald-400/10 px-3 py-2 text-xs leading-snug text-emerald-100 ring-1 ring-emerald-400/25">
          <span aria-hidden>🚚</span>
          <span>
            {DELIVERY_PROMISE}
            {cod && ` Pay ${valid ? formatPesos(pesosTotal) : "in"} cash when it arrives — no points used.`}
          </span>
        </p>
      )}

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
              : `Order Seedling${valid ? ` · ${cod ? formatPesos(pesosTotal) : formatPoints(pointsTotal)}` : ""}`}
      </button>

      {message && (
        <p role="status" className={`text-xs ${message.ok ? "text-emerald-400" : "text-red-400"}`}>
          {message.text}
        </p>
      )}
    </form>
  );
}
