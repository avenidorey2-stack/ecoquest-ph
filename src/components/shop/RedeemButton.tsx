"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import VoucherArt from "@/components/rewards/VoucherArt";
import { voucherAmount } from "@/lib/voucher";

export default function RedeemButton({
  reward,
  balance,
  lastNumber,
}: {
  reward: { id: string; brand: string; valuePesos: number; costPoints: number; isCash: boolean };
  balance: number;
  /** Prefill for e-wallet cashouts: the number used on the user's last cashout. */
  lastNumber: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [number, setNumber] = useState(lastNumber ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const affordable = balance >= reward.costPoints;
  const amount = voucherAmount(reward.valuePesos);
  const label = `${amount} ${reward.brand} ${reward.isCash ? "cash" : "voucher"}`;
  const pts = (n: number) => n.toLocaleString("en-PH");

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/rewards/${reward.id}/redeem`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reward.isCash ? { eWalletNumber: number } : {}),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Redemption failed.");
      return;
    }
    setDone(true);
    router.refresh();
  }

  function close() {
    setOpen(false);
    setDone(false);
    setError(null);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={!affordable}
        className="w-full rounded-lg bg-emerald-400 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-300 disabled:bg-card-3 disabled:text-ink-3"
      >
        {affordable ? "Redeem" : `Need ${pts(reward.costPoints - balance)} more pts`}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[2000] m-0 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Redeem ${label}`}
          onKeyDown={(e) => e.key === "Escape" && close()}
        >
          <div className="w-full max-w-sm rounded-2xl bg-card p-5 text-ink shadow-xl">
            {done ? (
              <div className="space-y-3 text-center">
                <p className="text-3xl" aria-hidden>
                  🎉
                </p>
                <p className="font-semibold">Request sent!</p>
                <p className="text-sm text-ink-2">
                  {reward.isCash
                    ? `We'll send ${amount} to ${number} once our team processes it.`
                    : "Your voucher code will appear in your history once our team processes it."}
                </p>
                <button onClick={close} autoFocus className="w-full rounded-lg bg-emerald-400 py-2 font-semibold text-emerald-950">
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={confirm} className="space-y-4">
                <VoucherArt brand={reward.brand} valuePesos={reward.valuePesos} isCash={reward.isCash} />
                <div>
                  <p className="font-semibold">Redeem {label}?</p>
                  <p className="text-sm text-ink-2">
                    {pts(reward.costPoints)} points will be deducted now ({pts(balance)} → {pts(balance - reward.costPoints)}). If the
                    request is rejected, they&apos;re refunded.
                  </p>
                </div>

                {reward.isCash && (
                  <label className="block text-sm">
                    {reward.brand} mobile number
                    <input
                      value={number}
                      onChange={(e) => setNumber(e.target.value)}
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder="0917 123 4567"
                      required
                      autoFocus
                      className="mt-1 block w-full rounded border px-2 py-1.5"
                    />
                    <span className="text-xs text-ink-3">Double-check it — cash sent to a wrong number can&apos;t be recovered.</span>
                  </label>
                )}

                {error && <p className="text-sm text-red-400">{error}</p>}

                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={busy}
                    className="flex-1 rounded-lg bg-emerald-400 py-2 font-semibold text-emerald-950 disabled:opacity-50"
                  >
                    {busy ? "Redeeming…" : "Confirm"}
                  </button>
                  <button type="button" onClick={close} className="flex-1 rounded-lg border py-2">
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
