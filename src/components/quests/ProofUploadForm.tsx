"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import ProofMediaPicker from "@/components/quests/ProofMediaPicker";

const MAX_PLANTS = 500; // = MAX_PLANTS_PER_SUBMISSION (server-validated)

type DirectUpload = { url: string; key: string; token: string };
type Result = { status: number; data: { error?: string; upload?: DirectUpload | null } };

const succeeded = (r: Result) => r.status >= 200 && r.status < 300;
const TOO_BIG = "This file is too big to upload. Try a shorter video or a smaller photo.";

/** Sends with XHR (fetch can't report upload progress). Rejects only on network failure. */
function sendWithProgress(
  method: "POST" | "PUT",
  url: string,
  body: XMLHttpRequestBodyInit,
  onProgress: (pct: number) => void,
  headers: Record<string, string> = {},
) {
  return new Promise<Result>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      let data = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        // Non-JSON error page (e.g. the host rejecting an oversized request).
      }
      resolve({ status: xhr.status, data });
    };
    xhr.onerror = () => reject(new Error("Network error"));
    xhr.send(body);
  });
}

async function postJson(url: string, body: unknown): Promise<Result> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

/**
 * Uploads the proof and records the submission; returns an error message, or null on success.
 * Production: the file goes straight to Supabase Storage through a signed URL (Vercel limits
 * requests to 4.5 MB), then only its key is submitted. Local disk: the file is posted to the API.
 */
async function submitProof(questId: string, file: File, plantCount: number, onProgress: (pct: number) => void) {
  const base = `/api/quests/${questId}/verifications`;
  const start = await postJson(`${base}/upload`, { type: file.type, size: file.size });
  if (!succeeded(start)) return start.data.error ?? "Couldn't start the upload. Please try again.";

  const upload = start.data.upload;
  if (upload) {
    const put = await sendWithProgress("PUT", upload.url, file, onProgress, { "Content-Type": file.type });
    if (!succeeded(put)) return put.status === 413 ? TOO_BIG : "Upload to storage failed. Please try again.";
    const done = await postJson(base, { key: upload.key, token: upload.token, plantCount });
    return succeeded(done) ? null : (done.data.error ?? "Couldn't submit your proof. Please try again.");
  }

  const form = new FormData();
  form.set("file", file);
  form.set("plantCount", String(plantCount));
  const res = await sendWithProgress("POST", base, form, onProgress);
  if (succeeded(res)) return null;
  return res.status === 413 ? TOO_BIG : (res.data.error ?? "Upload failed. Please try again.");
}

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
  const [progress, setProgress] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [quantity, setQuantity] = useState(() => Math.min(Math.max(context?.remaining ?? 1, 1), MAX_PLANTS));

  const valid = Number.isInteger(quantity) && quantity >= 1 && quantity <= MAX_PLANTS;
  const completes = !!context && quantity >= context.remaining;

  function change(next: number) {
    setError(null);
    setQuantity(Number.isNaN(next) ? 0 : Math.max(0, Math.min(MAX_PLANTS, Math.trunc(next))));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) {
      setError("Take or choose a photo or video first.");
      return;
    }
    if (!valid) {
      setError(`Enter how many plants this proof shows (1–${MAX_PLANTS}).`);
      return;
    }
    setSubmitting(true);
    setProgress(0);
    setError(null);
    const problem = await submitProof(questId, file, quantity, setProgress).catch(
      () => "Upload failed. Check your connection and try again.",
    );
    setSubmitting(false);

    if (problem) {
      setError(problem);
      return;
    }
    onSubmitted?.();
    router.refresh();
  }

  const stepBtn =
    "grid h-10 w-10 place-items-center text-lg font-semibold text-slate-600 transition-colors hover:bg-emerald-50 hover:text-emerald-800 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* min-w-0: a fieldset is never narrower than its content by default, so a long file name
          (e.g. from Messenger) would stretch the dialog past the screen. */}
      <fieldset className="min-w-0">
        <legend className="mb-1.5 text-sm font-medium text-slate-700">Photo or video proof</legend>
        <ProofMediaPicker
          file={file}
          onChange={(next) => {
            setError(null);
            setFile(next);
          }}
          disabled={submitting}
        />
      </fieldset>

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

      {submitting && (
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100"
          role="progressbar"
          aria-label="Upload progress"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="h-full rounded-full bg-emerald-600 transition-[width] duration-200" style={{ width: `${progress}%` }} />
        </div>
      )}

      <button
        type="submit"
        disabled={submitting || !valid || !file}
        className="w-full rounded-xl bg-emerald-700 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting
          ? progress < 100
            ? `Uploading… ${progress}%`
            : "Saving…"
          : `Submit proof for ${valid ? quantity : "…"} plant${quantity === 1 ? "" : "s"}`}
      </button>
    </form>
  );
}
