"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { MessengerIcon } from "@/components/ui/icons";
import { MESSAGES_READ_EVENT, useLiveEvent, useVisiblePoll } from "./live";

/** Fallback when live pings aren't available; each check also marks the user as active. */
const POLL_MS = 30_000;
const TOAST_MS = 7_000;

type Latest = { id: string; fromId: string; fromName: string; preview: string; createdAt: string };

/**
 * Header Messages icon (beside the bell): red badge with the number of chats that have unread
 * messages, and a pop-up the moment a new message arrives (not while you're in that chat).
 */
export default function MessagesButton({ initialUnread, since }: { initialUnread: number; since: string }) {
  const pathname = usePathname();
  const [unread, setUnread] = useState(initialUnread);
  const [toast, setToast] = useState<Latest | null>(null);
  const shown = useRef(new Set<string>());
  const path = useRef(pathname);
  useEffect(() => {
    path.current = pathname;
  }, [pathname]);
  const sinceMs = new Date(since).getTime();

  const load = useCallback(async () => {
    const res = await fetch("/api/messages/unread", { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return;
    const data: { unread: number; latest: Latest | null } = await res.json();
    setUnread(data.unread);
    const m = data.latest;
    if (!m || shown.current.has(m.id) || new Date(m.createdAt).getTime() < sinceMs) return;
    shown.current.add(m.id);
    // Already looking at the chats: no pop-up.
    if (path.current === "/messages" || path.current === `/messages/${m.fromId}`) return;
    setToast(m);
  }, [sinceMs]);

  useLiveEvent("message", load);
  useVisiblePoll(load, POLL_MS);
  // A chat was just read: drop its count from the badge.
  useEffect(() => {
    window.addEventListener(MESSAGES_READ_EVENT, load);
    return () => window.removeEventListener(MESSAGES_READ_EVENT, load);
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  return (
    <>
      <Link
        href="/messages"
        aria-label={unread ? `Messages (${unread} unread)` : "Messages"}
        className="eq-hit relative grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink-2 transition-colors hover:bg-white/5 hover:text-emerald-300"
      >
        <MessengerIcon className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-card">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </Link>

      {toast && (
        <div
          role="status"
          className="eq-rise fixed inset-x-3 top-16 z-[1450] flex items-start gap-3 rounded-2xl border border-emerald-400/30 bg-card p-3 shadow-[0_16px_40px_-12px_rgba(0,0,0,.6)] sm:inset-x-auto sm:right-4 sm:w-96"
        >
          <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-400/15 text-emerald-300" aria-hidden>
            <MessengerIcon className="h-4 w-4" />
          </span>
          <Link href={`/messages/${toast.fromId}`} onClick={() => setToast(null)} className="min-w-0 flex-1 text-sm hover:text-emerald-200">
            <span className="block font-semibold text-ink">{toast.fromName}</span>
            <span className="block truncate text-ink-2">{toast.preview}</span>
          </Link>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Dismiss"
            className="-m-1 grid h-11 w-11 shrink-0 place-items-center rounded-xl text-ink-3 hover:bg-card-2 hover:text-ink"
          >
            ✕
          </button>
        </div>
      )}
    </>
  );
}
