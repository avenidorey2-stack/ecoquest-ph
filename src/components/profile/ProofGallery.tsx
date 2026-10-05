"use client";

import { useState } from "react";
import type { PublicProof } from "@/lib/public-profile";
import { formatDate } from "@/lib/format";
import { CameraIcon } from "@/components/ui/icons";
import ProofLightbox from "@/components/profile/ProofLightbox";

/** A planter's approved planting proof (permanent), each with the date it was acquired. Tap to view full screen. */
export default function ProofGallery({
  proofs,
  total,
  emptyText = "No approved plantings yet.",
}: {
  proofs: PublicProof[];
  total: number;
  emptyText?: string;
}) {
  const [viewing, setViewing] = useState<number | null>(null);
  return (
    <section aria-labelledby="proofs-heading" className="eq-panel overflow-hidden rounded-2xl border border-line/80 bg-card shadow-sm">
      <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <h2 id="proofs-heading" className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-3">
          <CameraIcon className="h-4 w-4 text-emerald-400" /> Proof Gallery
        </h2>
        <span className="text-xs text-ink-3">
          {total > proofs.length ? `Latest ${proofs.length} of ${total}` : `${total} approved`}
        </span>
      </header>

      {proofs.length === 0 ? (
        <p className="px-5 py-6 text-center text-sm text-ink-3">{emptyText}</p>
      ) : (
        <ul className="eq-stagger eq-spring grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4">
          {proofs.map((p, i) => {
            const acquired = p.approvedAt ?? p.submittedAt;
            const label = `${p.plantCount} × ${p.plantType}`;
            return (
              <li key={p.id} className="overflow-hidden rounded-xl bg-card ring-1 ring-line">
                <button
                  type="button"
                  onClick={() => setViewing(i)}
                  className="group relative block aspect-square w-full cursor-zoom-in bg-card-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500"
                  aria-label={`View proof: ${label}, acquired ${formatDate(acquired)}`}
                >
                  {p.mediaType.startsWith("video/") ? (
                    <>
                      <video src={p.url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                      <span className="absolute inset-0 grid place-items-center bg-black/30 text-3xl text-white" aria-hidden>
                        ▶
                      </span>
                    </>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element -- auth-gated proof media
                    <img src={p.url} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                  )}
                </button>
                <div className="space-y-0.5 px-3 py-2">
                  <p className="truncate text-sm font-semibold text-ink">{label}</p>
                  <p className="truncate text-xs text-ink-3">
                    {p.city}, {p.province}
                  </p>
                  <p className="text-[11px] font-medium text-emerald-400">
                    Acquired on <time dateTime={acquired}>{formatDate(acquired)}</time>
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {viewing !== null && <ProofLightbox proofs={proofs} startIndex={viewing} onClose={() => setViewing(null)} />}
    </section>
  );
}
