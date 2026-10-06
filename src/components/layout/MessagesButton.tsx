"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ConversationRow } from "@/lib/messages";
import type { PlanterCard } from "@/lib/friends";
import ChatList from "@/components/chat/ChatList";
import { ComposeIcon, ExpandIcon, MessagesIcon } from "@/components/ui/icons";
import { MESSAGES_READ_EVENT, useLiveEvent, useVisiblePoll } from "./live";

/** Fallback when live pings aren't available; each check also marks the user as active. */
const POLL_MS = 30_000;
const TOAST_MS = 7_000;

type Latest = { id: string; fromId: string; fromName: string; preview: string; createdAt: string };

const headerBtn = "grid h-10 w-10 place-items-center rounded-full text-ink-2 hover:bg-card-2 hover:text-emerald-300";

/**
 * Header Messages button (beside the bell), like Messenger on Facebook: a red badge with the
 * number of chats that have unread messages, a Chats panel with search and All / Unread, and a
 * pop-up the moment a new message arrives (not while you're in that chat).
 */
export default function MessagesButton({ initialUnread, since }: { initialUnread: number; since: string }) {
  const pathname = usePathname();
  const [unread, setUnread] = useState(initialUnread);
  const [toast, setToast] = useState<Latest | null>(null);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ConversationRow[] | null>(null);
  const [friends, setFriends] = useState<PlanterCard[]>([]);
  const [failed, setFailed] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const shown = useRef(new Set<string>());
  const path = useRef(pathname);
  const openRef = useRef(open);
  useEffect(() => {
    path.current = pathname;
    openRef.current = open;
  }, [pathname, open]);
  const sinceMs = new Date(since).getTime();

  const loadChats = useCallback(async () => {
    const res = await fetch("/api/messages", { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return setFailed(true);
    setFailed(false);
    const data = await res.json();
    setRows(data.conversations);
    setFriends(data.friends);
  }, []);

  const load = useCallback(async () => {
    const res = await fetch("/api/messages/unread", { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return;
    const data: { unread: number; latest: Latest | null } = await res.json();
    setUnread(data.unread);
    if (openRef.current) loadChats();
    const m = data.latest;
    if (!m || shown.current.has(m.id) || new Date(m.createdAt).getTime() < sinceMs) return;
    shown.current.add(m.id);
    // Already looking at the chats: no pop-up.
    if (openRef.current || path.current === "/messages" || path.current === `/messages/${m.fromId}`) return;
    setToast(m);
  }, [sinceMs, loadChats]);

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

  // Phones: the panel fills the screen like the Messenger app, so the page behind stays still.
  useEffect(() => {
    if (!open || !window.matchMedia("(max-width: 639px)").matches) return;
    const root = document.documentElement;
    root.classList.add("eq-chat-open");
    return () => root.classList.remove("eq-chat-open");
  }, [open]);

  // Close on a tap outside or Escape (links inside close it too).
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

  function toggle() {
    if (open) return setOpen(false);
    setOpen(true);
    setToast(null);
    loadChats();
  }

  const close = () => setOpen(false);
  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label={unread ? `Messages (${unread} unread)` : "Messages"}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`eq-hit relative grid h-10 w-10 shrink-0 place-items-center rounded-full transition-colors ${
          open ? "bg-emerald-400/20 text-emerald-300" : "bg-card-2 text-ink-2 hover:bg-card-3 hover:text-emerald-300"
        }`}
      >
        <MessagesIcon className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-canvas">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Chats"
          className="eq-fade fixed inset-x-0 bottom-0 top-16 z-[1400] flex flex-col overflow-hidden border-t border-line bg-card pb-[env(safe-area-inset-bottom)] sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-12 sm:max-h-[calc(100dvh-5rem)] sm:w-[22rem] sm:rounded-2xl sm:border sm:border-line/80 sm:pb-0 sm:shadow-[0_16px_40px_-12px_rgba(0,0,0,.6)]"
        >
          <div className="flex items-center justify-between px-4 pb-2 pt-3">
            <h2 className="text-xl font-bold text-ink">Chats</h2>
            <div className="flex items-center gap-1">
              <Link href="/messages" onClick={close} aria-label="Open Messages" title="Open Messages" className={headerBtn}>
                <ExpandIcon className="h-4 w-4" />
              </Link>
              <Link href="/messages" onClick={close} aria-label="New Message" title="New Message" className={headerBtn}>
                <ComposeIcon className="h-5 w-5" />
              </Link>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <ChatList rows={rows} friends={friends} failed={failed} onOpen={close} />
          </div>
        </div>
      )}

      {toast && (
        <div
          role="status"
          className="eq-rise fixed inset-x-3 top-16 z-[1450] flex items-start gap-3 rounded-2xl border border-emerald-400/30 bg-card p-3 shadow-[0_16px_40px_-12px_rgba(0,0,0,.6)] sm:inset-x-auto sm:right-4 sm:w-96"
        >
          <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-400/15 text-emerald-300" aria-hidden>
            <MessagesIcon className="h-4 w-4" />
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
    </div>
  );
}
