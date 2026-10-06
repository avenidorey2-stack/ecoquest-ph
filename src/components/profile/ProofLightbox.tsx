"use client";

import { useEffect, useRef, useState } from "react";
import type { PublicProof } from "@/lib/public-profile";
import { formatDate } from "@/lib/format";
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon } from "@/components/ui/icons";
import PhotoSocial, { type Reactions } from "@/components/social/PhotoSocial";

/**
 * Full-screen viewer for proof photos and videos, in place of opening them in a new tab.
 * Mount it to open; `onClose` fires when it's dismissed (X, Escape, or a tap beside the media).
 * Arrows, the arrow keys or a swipe move between proofs. A native modal <dialog>, so it stacks
 * above other dialogs (e.g. the planter profile popup) with focus trapped inside. Below the
 * photo: likes and comments (`onReact` reports new counts to the gallery).
 */
export default function ProofLightbox({
  proofs,
  startIndex,
  onClose,
  onReact,
}: {
  proofs: PublicProof[];
  startIndex: number;
  onClose: () => void;
  onReact?: (proofId: string, r: Reactions) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const [index, setIndex] = useState(() => Math.min(Math.max(startIndex, 0), proofs.length - 1));
  // Reactions changed while viewing, so moving away and back shows the new counts.
  const [reacted, setReacted] = useState<Record<string, Reactions>>({});
  const proof = proofs[index];
  const hasPrev = index > 0;
  const hasNext = index < proofs.length - 1;

  // Open on mount. No close() in cleanup: unmounting removes it from the top layer anyway, and a
  // queued "close" event would dismiss the re-opened dialog under StrictMode.
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  // Keep the page behind from scrolling while it's open.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const close = () => ref.current?.close();
  const go = (step: number) => setIndex((i) => Math.min(Math.max(i + step, 0), proofs.length - 1));

  if (!proof) return null;
  const isVideo = proof.mediaType.startsWith("video/");
  const label = `${proof.plantCount} × ${proof.plantType}`;
  const acquired = proof.approvedAt ?? proof.submittedAt;
  const navBtn =
    "absolute top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/15 text-white backdrop-blur transition-colors hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-white";

  return (
    <dialog
      ref={ref}
      aria-label={`Proof: ${label}`}
      // Stop these at the viewer: when it's opened from inside another dialog (the planter
      // popup), closing the viewer must not close that one too.
      onClose={(e) => {
        e.stopPropagation();
        onClose();
      }}
      onCancel={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        // Arrow keys seek a video and move the caret in the comment box — not between proofs.
        if (e.target instanceof HTMLVideoElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
        if (e.key === "ArrowLeft") go(-1);
        if (e.key === "ArrowRight") go(1);
      }}
      className="fixed inset-0 m-0 h-full max-h-none w-full max-w-none overscroll-none bg-canvas p-0 text-white backdrop:bg-transparent"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-3 px-3 py-3 sm:px-5">
          <p className="text-sm text-white/70" aria-live="polite">
            {proofs.length > 1 && `${index + 1} / ${proofs.length}`}
          </p>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            autoFocus
            className="grid h-11 w-11 place-items-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-white"
          >
            <CloseIcon className="h-6 w-6" />
          </button>
        </div>

        {/* Tapping the dark area beside the photo/video closes it. touch-none: swipes here are
            ours alone (next/previous) — otherwise the browser may turn a swipe into its "go back"
            gesture, or treat it as a fling and swallow the next tap on an arrow. */}
        <div
          className="relative flex min-h-0 flex-1 touch-none items-center justify-center overscroll-none px-2 sm:px-16"
          onClick={(e) => e.target === e.currentTarget && close()}
          onTouchStart={(e) => {
            const t = e.touches[0];
            // Touches on the video are its own (play, seek), not swipes.
            touchStart.current = e.target instanceof HTMLVideoElement || !t ? null : { x: t.clientX, y: t.clientY };
          }}
          onTouchEnd={(e) => {
            const start = touchStart.current;
            const t = e.changedTouches[0];
            touchStart.current = null;
            if (!start || !t) return;
            const dx = t.clientX - start.x;
            if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(t.clientY - start.y)) go(dx < 0 ? 1 : -1);
          }}
        >
          {isVideo ? (
            // key: switching proofs swaps in a fresh element, so the previous video stops.
            <video
              key={proof.id}
              src={proof.url}
              controls
              autoPlay
              playsInline
              className="max-h-full max-w-full rounded-lg bg-black"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- auth-gated proof media
            <img
              key={proof.id}
              src={proof.url}
              alt={`Planting proof: ${label}`}
              decoding="async"
              className="max-h-full max-w-full select-none rounded-lg object-contain"
            />
          )}

          {hasPrev && (
            <button type="button" onClick={() => go(-1)} aria-label="Previous proof" className={`${navBtn} left-2 sm:left-4`}>
              <ChevronLeftIcon className="h-6 w-6" />
            </button>
          )}
          {hasNext && (
            <button type="button" onClick={() => go(1)} aria-label="Next proof" className={`${navBtn} right-2 sm:right-4`}>
              <ChevronRightIcon className="h-6 w-6" />
            </button>
          )}
        </div>

        <div className="space-y-3 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 text-center">
          <div>
            <p className="text-base font-semibold">{label}</p>
            <p className="text-sm text-white/70">
              {proof.city}, {proof.province} · Acquired on <time dateTime={acquired}>{formatDate(acquired)}</time>
            </p>
          </div>
          <PhotoSocial
            key={proof.id}
            photoId={proof.id}
            commentsOff={proof.commentsOff}
            initial={reacted[proof.id] ?? { likeCount: proof.likeCount, commentCount: proof.commentCount, likedByMe: proof.likedByMe }}
            onChange={(r) => {
              setReacted((m) => ({ ...m, [proof.id]: r }));
              onReact?.(proof.id, r);
            }}
          />
        </div>
      </div>
    </dialog>
  );
}
