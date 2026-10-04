"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { BellIcon } from "@/components/ui/icons";

type Item = { id: string; message: string; link: string | null; isRead: boolean; createdAt: string };

const POLL_MS = 60_000;

function timeAgo(iso: string) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric" });
}

/** Header bell: red badge for unread notifications, dropdown with the recent ones. */
export default function NotificationBell({ initialUnread }: { initialUnread: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(initialUnread);
  const [items, setItems] = useState<Item[] | null>(null);
  const [failed, setFailed] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const lastUnread = useRef(initialUnread);

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
    // Something new arrived (e.g. a tree was approved): refresh server data such as points.
    if (data.unreadCount > lastUnread.current) router.refresh();
    lastUnread.current = data.unreadCount;
    return data;
  }, [router]);

  // Poll while the tab is visible.
  useEffect(() => {
    const tick = () => document.visibilityState === "visible" && load();
    const id = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [load]);

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
        className="relative grid h-10 w-10 place-items-center rounded-full text-ink-2 transition-colors hover:bg-white/5 hover:text-emerald-300 hover:shadow-sm"
      >
        <BellIcon className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-card">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

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
