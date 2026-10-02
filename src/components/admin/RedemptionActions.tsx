"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function RedemptionActions({ id, isCash }: { id: string; isCash: boolean }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function process(action: "fulfill" | "reject") {
    if (action === "reject" && !confirm("Reject this request and refund the user's points?")) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/redemptions/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, note }),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Action failed.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={isCash ? "GCash/Maya reference no. or reason" : "Voucher code or reason"}
        className="block w-full rounded border px-2 py-1 text-sm"
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={() => process("fulfill")}
          disabled={busy}
          className="rounded bg-green-600 px-3 py-1 text-sm font-medium text-white disabled:opacity-50"
        >
          Mark fulfilled
        </button>
        <button
          onClick={() => process("reject")}
          disabled={busy}
          className="rounded bg-red-50 px-3 py-1 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
        >
          Reject &amp; refund
        </button>
      </div>
    </div>
  );
}
