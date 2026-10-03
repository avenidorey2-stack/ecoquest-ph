"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

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
  const label = `₱${reward.valuePesos} ${reward.brand} ${reward.isCash ? "cash" : "voucher"}`;

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
        className="w-full rounded-lg bg-emerald-700 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:bg-slate-200 disabled:text-slate-500"
      >
        {affordable ? "Redeem" : `Need ${reward.costPoints - balance} more pts`}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[2000] m-0 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Redeem ${label}`}
          onKeyDown={(e) => e.key === "Escape" && close()}
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 text-slate-900 shadow-xl">
            {done ? (
              <div className="space-y-3 text-center">
                <p className="text-3xl" aria-hidden>
                  🎉
                </p>
                <p className="font-semibold">Request sent!</p>
                <p className="text-sm text-slate-600">
                  {reward.isCash
                    ? `We'll send ₱${reward.valuePesos} to ${number} once an admin processes it.`
                    : "Your voucher code will appear in your history once an admin processes it."}
                </p>
                <button onClick={close} autoFocus className="w-full rounded-lg bg-emerald-700 py-2 font-semibold text-white">
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={confirm} className="space-y-4">
                <div>
                  <p className="font-semibold">Redeem {label}?</p>
                  <p className="text-sm text-slate-600">
                    {reward.costPoints} points will be deducted now ({balance} → {balance - reward.costPoints}). If the
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
                    <span className="text-xs text-slate-500">Double-check it — cash sent to a wrong number can&apos;t be recovered.</span>
                  </label>
                )}

                {error && <p className="text-sm text-red-600">{error}</p>}

                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={busy}
                    className="flex-1 rounded-lg bg-emerald-700 py-2 font-semibold text-white disabled:opacity-50"
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
