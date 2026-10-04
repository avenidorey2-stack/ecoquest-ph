"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatPesos, formatPoints } from "@/lib/format";
import {
  DELIVERY_DAYS,
  MAX_INSTRUCTIONS,
  formatBarangay,
  formatPhMobile,
  parseDeliveryDetails,
  type DeliveryDetails,
} from "@/lib/delivery";
import ActivePill from "@/components/ui/ActivePill";

type Currency = "POINTS" | "PESOS";

/** Values that pre-fill the delivery form. */
export type DeliveryDefaults = Partial<Record<keyof DeliveryDetails, string | null>>;

type DeliveryForm = Record<keyof DeliveryDetails, string>;

const DELIVERY_PROMISE = `Delivered within ${DELIVERY_DAYS.min}–${DELIVERY_DAYS.max} days after our team packs your order.`;

/** What was just ordered, for the "order complete" banner. */
export type PlacedOrder = { name: string; quantity: number; total: string; cod: boolean };

/** Seconds left until `until` (epoch ms), ticking down; 0 when there's no cooldown. */
function useSecondsLeft(until: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (until <= Date.now()) return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [until]);
  return Math.max(0, Math.ceil((until - now) / 1000));
}

/** Last check before an order is placed: what, how much, how it's paid, and where it goes. */
function ConfirmOrderDialog({
  product,
  quantity,
  total,
  cod,
  delivery,
  busy,
  error,
  onConfirm,
  onBack,
}: {
  product: { name: string };
  quantity: number;
  total: string;
  cod: boolean;
  delivery: DeliveryDetails;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onBack: () => void;
}) {
  const back = useRef<HTMLButtonElement>(null);
  useEffect(() => back.current?.focus({ preventScroll: true }), []);
  const row = "flex justify-between gap-4";
  // Portalled to <body>: the order sheet animates with transforms, which would otherwise trap
  // this full-screen overlay inside the sheet.
  return createPortal(
    <div
      className="fixed inset-0 z-[2200] m-0 flex items-end justify-center bg-canvas/80 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(e) => {
        e.stopPropagation();
        if (!busy) onBack();
      }}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.stopPropagation(); // close only this dialog, not the order sheet behind it
        if (!busy) onBack();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-order-title"
        aria-describedby="confirm-order-summary"
        className="eq-rise w-full max-w-sm rounded-t-3xl border border-line-strong bg-card p-5 shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="confirm-order-title" className="text-lg font-bold text-ink">
          Confirm your order
        </h3>
        <div id="confirm-order-summary" className="mt-3 space-y-3 text-sm">
          <dl className="space-y-1.5 rounded-xl bg-card-2 p-3 text-ink-2">
            <div className={row}>
              <dt>Seedling</dt>
              <dd className="font-semibold text-ink">
                {quantity} × {product.name}
              </dd>
            </div>
            <div className={row}>
              <dt>Total</dt>
              <dd className="font-semibold text-emerald-300">{total}</dd>
            </div>
            <div className={row}>
              <dt>Payment</dt>
              <dd className="text-right text-ink">{cod ? "Cash on delivery" : "Points (deducted now)"}</dd>
            </div>
          </dl>
          <div className="rounded-xl bg-card-2 p-3 text-ink-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-300">Deliver to</p>
            <p className="mt-1 font-medium text-ink">
              {delivery.recipientName} · {formatPhMobile(delivery.contactNumber)}
            </p>
            <p>
              {delivery.streetAddress}, {formatBarangay(delivery.barangay)}, {delivery.cityProvince}
            </p>
            <p className="text-ink-3">Landmark: {delivery.landmark}</p>
            {delivery.instructions && <p className="text-ink-3">Note: {delivery.instructions}</p>}
          </div>
          <p className="text-xs text-ink-3">{DELIVERY_PROMISE}</p>
        </div>
        {error && (
          <p role="alert" className="mt-3 text-sm text-red-400">
            {error}
          </p>
        )}
        <div className="mt-4 flex gap-2">
          <button
            ref={back}
            type="button"
            onClick={onBack}
            disabled={busy}
            className="min-h-12 flex-1 rounded-xl border border-line-strong text-sm font-semibold text-ink-2 transition-colors hover:bg-card-2 disabled:opacity-50"
          >
            Edit order
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="min-h-12 flex-1 rounded-xl bg-emerald-400 text-sm font-bold text-emerald-950 transition-colors hover:bg-emerald-300 disabled:opacity-60"
          >
            {busy ? "Placing order…" : "Confirm order"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Pay-with toggle, delivery details, quantity and "Order Seedling" button (then a confirmation). */
export default function OrderSeedlingForm({
  product,
  balance,
  maxQuantity,
  deliveryDefaults = {},
  cooldownUntil = 0,
  onPlaced,
}: {
  product: { id: string; name: string; priceInPoints: number; priceInPesos: number; stockQuantity: number };
  balance: number;
  maxQuantity: number;
  deliveryDefaults?: DeliveryDefaults;
  /** Epoch ms until which ordering is paused after the last order. */
  cooldownUntil?: number;
  /** Called once an order is placed (the shop closes the sheet and shows a banner). */
  onPlaced?: (order: PlacedOrder) => void;
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
  // Checked details waiting for the planter to confirm (the confirmation dialog is open).
  const [review, setReview] = useState<DeliveryDetails | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const cooldown = useSecondsLeft(cooldownUntil);

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

  const total = cod ? formatPesos(pesosTotal) : formatPoints(pointsTotal);

  /** "Order Seedling": check everything, then ask the planter to confirm. */
  function startReview(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || !affordable || cooldown > 0) return;
    // Same checks as the server, so mistakes show before anything is sent.
    const details = parseDeliveryDetails(delivery);
    if (!details.ok) {
      setMessage({ ok: false, text: details.error });
      return;
    }
    setMessage(null);
    setConfirmError(null);
    setReview(details.data);
  }

  /** "Confirm order": place it. */
  async function confirm() {
    if (!review || busy) return;
    setBusy(true);
    setConfirmError(null);
    const res = await fetch("/api/shop/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: product.id, quantity, currency, delivery: review }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      const error = res ? (await res.json().catch(() => ({}))).error : null;
      setConfirmError(error ?? "Order failed. Please try again.");
      return;
    }
    setReview(null);
    router.refresh(); // updates stock, balance, order history and the cooldown
    if (onPlaced) {
      onPlaced({ name: product.name, quantity, total, cod });
    } else {
      setMessage({ ok: true, text: `Ordered ${quantity} × ${product.name}! ${DELIVERY_PROMISE}` });
      setQuantity(1);
    }
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
    <form onSubmit={startReview} className="space-y-2.5">
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
        disabled={soldOut || !valid || !affordable || busy || cooldown > 0}
        className="min-h-12 w-full rounded-xl bg-emerald-400 py-3 text-sm font-bold text-emerald-950 shadow-sm transition-colors hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-card-2 disabled:text-ink-4 disabled:shadow-none"
      >
        {soldOut
          ? "Out of stock"
          : cooldown > 0
            ? `You can order again in ${cooldown}s`
            : valid && !affordable
              ? `Need ${formatPoints(pointsTotal - balance)} more`
              : `Order Seedling${valid ? ` · ${total}` : ""}`}
      </button>

      {review && (
        <ConfirmOrderDialog
          product={product}
          quantity={quantity}
          total={total}
          cod={cod}
          delivery={review}
          busy={busy}
          error={confirmError}
          onConfirm={confirm}
          onBack={() => setReview(null)}
        />
      )}

      {message && (
        <p role="status" className={`text-xs ${message.ok ? "text-emerald-400" : "text-red-400"}`}>
          {message.text}
        </p>
      )}
    </form>
  );
}
