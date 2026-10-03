"use client";

import { useEffect, useId, useRef, useState } from "react";
import ProofUploadForm, { type ProofContext } from "@/components/quests/ProofUploadForm";
import { CloseIcon } from "@/components/ui/icons";

/** "Submit proof" button that opens the Submit Proof modal (upload + plant quantity) for a slot quest. */
export default function QuestProofToggle({ questId, context }: { questId: string; context?: ProofContext }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
      >
        Submit proof
      </button>
      {open && <ProofModal questId={questId} context={context} onClose={() => setOpen(false)} />}
    </>
  );
}

function ProofModal({ questId, context, onClose }: { questId: string; context?: ProofContext; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  // Open as a modal on mount (native dialog: focus trap, Escape, backdrop). No close() in cleanup —
  // unmounting removes it from the top layer, and a queued "close" would break StrictMode re-open.
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && ref.current?.close()}
      className="m-auto max-h-[calc(100dvh-1.5rem)] w-[calc(100%-1.5rem)] max-w-md overflow-y-auto rounded-3xl bg-transparent p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/60 backdrop:backdrop-blur-sm open:animate-[profile-in_200ms_ease-out]"
    >
      <div className="bg-cream-50">
        <div className="relative bg-gradient-to-br from-emerald-800 to-emerald-950 px-5 pb-4 pt-5 text-white">
          <button
            type="button"
            onClick={() => ref.current?.close()}
            aria-label="Close"
            className="absolute right-3 top-3 rounded-lg p-1.5 text-emerald-100/80 hover:bg-white/10 hover:text-white"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-300">Submit proof</p>
          <h2 id={titleId} className="mt-0.5 pr-8 text-lg font-bold">
            {context ? `${context.plantType} planting` : "Upload your planting proof"}
          </h2>
          {context && (
            <p className="text-xs text-emerald-100/80">
              {context.pointsPerPlant} pts per plant · {context.remaining} plant{context.remaining === 1 ? "" : "s"} left in this quest
            </p>
          )}
        </div>
        <div className="p-5">
          <ProofUploadForm questId={questId} context={context} onSubmitted={() => ref.current?.close()} />
        </div>
      </div>
    </dialog>
  );
}
