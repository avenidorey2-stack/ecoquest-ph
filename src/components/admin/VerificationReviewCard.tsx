"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type PendingVerification = {
  id: string;
  mediaUrl: string;
  mediaType: string;
  submittedAt: string;
  /** Plants claimed in this submission. */
  plantCount: number;
  /** The quest's approved progress so far and its goal. */
  quest: { progress: number; target: number };
  user: { name: string | null; email: string | null };
  slot: { city: string; province: string; requiredPlantType: string; pointsPerPlant: number };
};

export default function VerificationReviewCard({ item }: { item: PendingVerification }) {
  const router = useRouter();
  const [plantCount, setPlantCount] = useState(String(item.plantCount));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const count = Number(plantCount);
  const points = Number.isInteger(count) && count > 0 ? count * item.slot.pointsPerPlant : 0;

  async function review(action: "approve" | "reject") {
    setBusy(true);
    setError(null);
    const body = action === "approve" ? { action, plantCount: count } : { action, reason };
    const res = await fetch(`/api/admin/verifications/${item.id}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Review failed.");
      return;
    }
    router.refresh();
  }

  return (
    <li className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="bg-black">
        {item.mediaType.startsWith("video/") ? (
          <video src={item.mediaUrl} controls className="mx-auto max-h-80 w-full" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- auth-gated media route
          <img src={item.mediaUrl} alt="Planting proof" className="mx-auto max-h-80 object-contain" />
        )}
      </div>

      <div className="space-y-3 p-4 text-sm">
        <div>
          <p className="font-medium">{item.user.name ?? item.user.email ?? "Unknown user"}</p>
          <p className="text-ink-2">
            {item.slot.requiredPlantType} · {item.slot.city}, {item.slot.province}
          </p>
          <p className="text-xs text-ink-3">Submitted {new Date(item.submittedAt).toLocaleString("en-PH")}</p>
        </div>

        <div className="flex items-end gap-3">
          <label className="block">
            Verified plants
            <input
              type="number"
              min={1}
              max={500}
              value={plantCount}
              onChange={(e) => setPlantCount(e.target.value)}
              className="mt-1 block w-24 rounded border px-2 py-1"
            />
          </label>
          <p className="pb-1 text-ink-2">
            = <span className="font-semibold text-emerald-400">{points} pts</span>
            {count !== item.plantCount && <span className="ml-1 text-xs">(claimed {item.plantCount})</span>}
          </p>
        </div>
        <p className="rounded-lg bg-emerald-400/10 px-3 py-2 text-xs text-emerald-200">
          Quest progress: <span className="font-semibold">{item.quest.progress}/{item.quest.target}</span> planted
          {points > 0 &&
            (item.quest.progress + count >= item.quest.target
              ? ` · approving ${count} completes the quest`
              : ` · approving ${count} brings it to ${item.quest.progress + count}/${item.quest.target}`)}
        </p>

        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Rejection reason (shown to user)"
          className="block w-full rounded border px-2 py-1"
        />

        {error && <p className="text-red-400">{error}</p>}

        <div className="flex gap-2">
          <button
            onClick={() => review("approve")}
            disabled={busy || points === 0}
            className="flex-1 rounded bg-emerald-400 py-2 font-medium text-emerald-950 disabled:opacity-50"
          >
            Approve
          </button>
          <button
            onClick={() => review("reject")}
            disabled={busy}
            className="flex-1 rounded bg-red-400/10 py-2 font-medium text-red-300 hover:bg-red-400/15 disabled:opacity-50"
          >
            Reject
          </button>
        </div>
      </div>
    </li>
  );
}
