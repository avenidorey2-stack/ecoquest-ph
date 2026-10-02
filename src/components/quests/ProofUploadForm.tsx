"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const MAX_BYTES = 50 * 1024 * 1024;
const MAX_PLANTS = 500; // = MAX_PLANTS_PER_SUBMISSION (server-validated)

export type ProofContext = {
  plantType: string;
  /** Plants still needed to complete the quest. */
  remaining: number;
  pointsPerPlant: number;
};

/** Photo/video upload with a plant quantity input. Approved quantity is added to the quest's progress. */
export default function ProofUploadForm({
  questId,
  context,
  onSubmitted,
}: {
  questId: string;
  context?: ProofContext;
  onSubmitted?: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [quantity, setQuantity] = useState(() => Math.min(Math.max(context?.remaining ?? 1, 1), MAX_PLANTS));

  const valid = Number.isInteger(quantity) && quantity >= 1 && quantity <= MAX_PLANTS;
  const completes = !!context && quantity >= context.remaining;

  function change(next: number) {
    setError(null);
    setQuantity(Number.isNaN(next) ? 0 : Math.max(0, Math.min(MAX_PLANTS, Math.trunc(next))));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const file = form.get("file");
    if (file instanceof File && file.size > MAX_BYTES) {
      setError("File is too large (max 50 MB).");
      return;
    }
    if (!valid) {
      setError(`Enter how many plants this proof shows (1–${MAX_PLANTS}).`);
      return;
    }
    form.set("plantCount", String(quantity));

    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/quests/${questId}/verifications`, { method: "POST", body: form }).catch(() => null);
    setSubmitting(false);

    if (!res?.ok) {
      const data = res ? await res.json().catch(() => ({})) : {};
      setError(data.error ?? "Upload failed. Please try again.");
      return;
    }
    onSubmitted?.();
    router.refresh();
  }

  const stepBtn =
    "grid h-10 w-10 place-items-center text-lg font-semibold text-slate-600 transition-colors hover:bg-emerald-50 hover:text-emerald-800 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <label className="block text-sm">
        <span className="font-medium text-slate-700">Photo or video proof</span>
        <input
          name="file"
          type="file"
          accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime"
          capture="environment"
          required
          className="mt-1 block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-100 file:px-3 file:py-2 file:font-medium file:text-emerald-800 hover:file:bg-emerald-200"
        />
        <span className="mt-1 block text-xs text-slate-500">Show all the plants in this batch. Max 50 MB.</span>
      </label>

      <div>
        <label htmlFor={`qty-${questId}`} className="text-sm font-medium text-slate-700">
          Plants in this proof
        </label>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <div className="flex items-center overflow-hidden rounded-xl border border-slate-200 bg-white">
            <button type="button" onClick={() => change(quantity - 1)} disabled={quantity <= 1 || submitting} aria-label="Fewer plants" className={stepBtn}>
              −
            </button>
            <input
              id={`qty-${questId}`}
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_PLANTS}
              step={1}
              value={quantity || ""}
              onChange={(e) => change(e.target.valueAsNumber)}
              disabled={submitting}
              className="h-10 w-16 border-x border-slate-200 text-center text-base font-semibold text-slate-900 [appearance:textfield] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-emerald-500 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            <button type="button" onClick={() => change(quantity + 1)} disabled={quantity >= MAX_PLANTS || submitting} aria-label="More plants" className={stepBtn}>
              +
            </button>
          </div>
          {context && (
            <p className="text-xs text-slate-500">
              {context.remaining} more to complete this quest
            </p>
          )}
        </div>
        {context && valid && (
          <p className={`mt-2 rounded-lg px-3 py-2 text-xs ${completes ? "bg-emerald-50 text-emerald-900" : "bg-slate-50 text-slate-600"}`}>
            If approved: <span className="font-semibold">+{(quantity * context.pointsPerPlant).toLocaleString("en-PH")} pts</span>
            {completes ? " and the quest is complete 🎉" : ` · ${context.remaining - quantity} still to go after this`}
          </p>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting || !valid}
        className="w-full rounded-xl bg-emerald-700 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? "Uploading…" : `Submit proof for ${valid ? quantity : "…"} plant${quantity === 1 ? "" : "s"}`}
      </button>
    </form>
  );
}
