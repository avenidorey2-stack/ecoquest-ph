"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { CloseIcon, DownloadIcon } from "@/components/ui/icons";

const barBtn = "grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white ring-1 ring-white/15 transition-colors hover:bg-white/20";

/**
 * Full-screen photo viewer, like Messenger's: the whole photo fits the screen (phones and
 * computers, portrait or landscape), with Download and Close at the top. Escape, Close or a tap
 * outside the photo closes it; pinch to zoom on phones. Rendered on <body> so the chat screen's
 * keyboard positioning can't shift or clip it.
 */
export default function MediaViewer({ url, onClose }: { url: string; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    close.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCloseRef.current();
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      before?.focus({ preventScroll: true });
    };
  }, []);

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Photo" className="eq-fade fixed inset-0 z-[1500] flex flex-col bg-black/95" onClick={onClose}>
      <div className="flex shrink-0 items-center justify-end gap-2 px-3 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <a href={url} download onClick={(e) => e.stopPropagation()} aria-label="Download photo" title="Download" className={barBtn}>
          <DownloadIcon className="h-5 w-5" />
        </a>
        <button ref={close} type="button" onClick={onClose} aria-label="Close" title="Close" className={barBtn}>
          <CloseIcon />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center px-2 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
        {/* eslint-disable-next-line @next/next/no-img-element -- private chat media behind an access check */}
        <img src={url} alt="" onClick={(e) => e.stopPropagation()} className="block h-auto max-h-full w-auto max-w-full select-none rounded-lg object-contain" />
      </div>
    </div>,
    document.body,
  );
}
