"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { BellIcon } from "@/components/ui/icons";
import { useLiveEvent, useVisiblePoll } from "./live";

type Item = { id: string; message: string; link: string | null; isRead: boolean; createdAt: string };

// Live pings (see live.ts) bring notifications in at once; this poll is the fallback for when
// the live connection is unavailable (and in local development, which has no Supabase).
const POLL_MS = 30_000;
const TOAST_MS = 7_000;

function timeAgo(iso: string) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return "Just Now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric" });
}

/** Header bell: red badge for unread notifications, dropdown with the recent ones, and a pop-up
 *  the moment a new one arrives. */
export default function NotificationBell({
  initialUnread,
  since,
}: {
  initialUnread: number;
  /** Server time the page loaded (ISO); only notifications newer than this pop up. */
  since?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(initialUnread);
  const [items, setItems] = useState<Item[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [toast, setToast] = useState<{ item: Item; more: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const lastUnread = useRef(initialUnread);
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);
  // Ids already popped up, so each notification pops up once.
  const shown = useRef(new Set<string>());
  const sinceMs = since ? new Date(since).getTime() : Infinity;

  const load = useCallback(async () => {
    const res = await fetch("/api/notifications", { cache: "no-store" }).catch(() => null);
    if (!res?.ok) {
      setFailed(true);
      return null;
    }
    const data: { notifications: Item[]; unreadCount: number } = await res.json();
    setFailed(false);
    setItems(data.notifications);
    setUnread(data.unreadCount);
    // Pop up unread ones that arrived after the page loaded (each once; not with the list open).
    const fresh = data.notifications.filter(
      (n) => !n.isRead && !shown.current.has(n.id) && new Date(n.createdAt).getTime() >= sinceMs,
    );
    fresh.forEach((n) => shown.current.add(n.id));
    if (fresh.length && !openRef.current) setToast({ item: fresh[0], more: fresh.length - 1 });
    // Something new arrived (e.g. a tree was approved): refresh server data such as points.
    if (data.unreadCount > lastUnread.current) router.refresh();
    lastUnread.current = data.unreadCount;
    return data;
  }, [router, sinceMs]);

  useLiveEvent("notify", load);
  useVisiblePoll(load, POLL_MS);

  // Hide the pop-up after a while.
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => !rootRef.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function toggle() {
    if (open) return setOpen(false);
    setOpen(true);
    setToast(null);
    const data = await load();
    if (data && data.unreadCount > 0) {
      // Opening the list marks everything read; unread rows stay highlighted until next open.
      const res = await fetch("/api/notifications", { method: "PATCH" }).catch(() => null);
      if (res?.ok) {
        setUnread(0);
        lastUnread.current = 0;
      }
    }
  }

  return (
    <div ref={rootRef} data-tour="bell" className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label={unread ? `Notifications (${unread} unread)` : "Notifications"}
        aria-expanded={open}
        aria-haspopup="true"
        className={`eq-hit relative grid h-10 w-10 place-items-center rounded-full transition-colors ${
          open ? "bg-emerald-400/20 text-emerald-300" : "bg-card-2 text-ink-2 hover:bg-card-3 hover:text-emerald-300"
        }`}
      >
        <BellIcon className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-canvas">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {toast && (
        <div
          role="status"
          className="eq-rise fixed inset-x-3 top-16 z-[1450] flex items-start gap-3 rounded-2xl border border-emerald-400/30 bg-card p-3 shadow-[0_16px_40px_-12px_rgba(0,0,0,.6)] sm:inset-x-auto sm:right-4 sm:top-16 sm:w-96"
        >
          <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-400/15 text-emerald-300" aria-hidden>
            <BellIcon className="h-4 w-4" />
          </span>
          {toast.item.link ? (
            <Link
              href={toast.item.link}
              onClick={() => setToast(null)}
              className="min-w-0 flex-1 text-sm text-ink hover:text-emerald-200"
            >
              {toast.item.message}
              {toast.more > 0 && <span className="mt-0.5 block text-xs text-ink-3">+{toast.more} more in your notifications</span>}
            </Link>
          ) : (
            <p className="min-w-0 flex-1 text-sm text-ink">
              {toast.item.message}
              {toast.more > 0 && <span className="mt-0.5 block text-xs text-ink-3">+{toast.more} more in your notifications</span>}
            </p>
          )}
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

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="fixed inset-x-3 top-16 z-[1400] overflow-hidden rounded-2xl border border-line/80 bg-card shadow-[0_16px_40px_-12px_rgba(15,23,42,.25)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-96"
        >
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-3">Notifications</p>
            {items && items.length > 0 && <p className="text-xs text-ink-4">Latest {items.length}</p>}
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {items === null ? (
              failed ? (
                <p className="p-6 text-center text-sm text-red-400">Couldn&apos;t load notifications.</p>
              ) : (
                <div className="space-y-3 p-4" aria-label="Loading">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-10 animate-pulse rounded-lg bg-card-2" />
                  ))}
                </div>
              )
            ) : items.length === 0 ? (
              <div className="p-8 text-center">
                <BellIcon className="mx-auto h-8 w-8 text-ink-4" />
                <p className="mt-2 text-sm font-medium text-ink-2">You&apos;re all caught up</p>
                <p className="text-xs text-ink-3">Approvals, new slots and rewards will show up here.</p>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {items.map((n) => {
                  const body = (
                    <>
                      <span
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.isRead ? "bg-transparent" : "bg-emerald-500"}`}
                        aria-hidden
                      />
                      <span className="min-w-0">
                        <span className={`block text-sm ${n.isRead ? "text-ink-2" : "font-medium text-ink"}`}>
                          {n.message}
                        </span>
                        <span className="block text-xs text-ink-4">{timeAgo(n.createdAt)}</span>
                      </span>
                    </>
                  );
                  const cls = `flex gap-3 px-4 py-3 ${n.isRead ? "" : "bg-emerald-400/[0.06]"}`;
                  return (
                    <li key={n.id}>
                      {n.link ? (
                        <Link href={n.link} onClick={() => setOpen(false)} className={`${cls} hover:bg-card-2`}>
                          {body}
                        </Link>
                      ) : (
                        <div className={cls}>{body}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
