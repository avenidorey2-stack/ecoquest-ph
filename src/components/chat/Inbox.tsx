"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import type { ConversationRow } from "@/lib/messages";
import type { PlanterCard } from "@/lib/friends";
import { useLiveEvent, useVisiblePoll } from "@/components/layout/live";
import { PresenceAvatar } from "./Presence";
import { MessengerIcon, UserPlusIcon } from "@/components/ui/icons";

const POLL_MS = 30_000;

/** "Just Now", "5m", "3h", "Mon", "Oct 1" (Manila time). */
function shortTime(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "Just Now";
  if (mins < 60) return `${mins}m`;
  if (mins < 24 * 60) return `${Math.floor(mins / 60)}h`;
  const opts: Intl.DateTimeFormatOptions = ms < 6 * 86_400_000 ? { weekday: "short" } : { month: "short", day: "numeric" };
  return new Date(iso).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", ...opts });
}

/** Messages home: friends to start a chat with (the page puts active ones first), then chats, newest first. */
export default function Inbox({ initial, friends }: { initial: ConversationRow[]; friends: PlanterCard[] }) {
  const [rows, setRows] = useState(initial);
  const refresh = useCallback(async () => {
    const res = await fetch("/api/messages", { cache: "no-store" }).catch(() => null);
    if (res?.ok) setRows((await res.json()).conversations);
  }, []);
  useLiveEvent("message", refresh);
  useVisiblePoll(refresh, POLL_MS);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5 px-4 py-6 text-ink sm:px-6 lg:py-8">
      <section aria-label="Friends" className="eq-panel overflow-hidden rounded-2xl border border-line/80 bg-card shadow-sm">
        <header className="border-b border-line px-5 py-3.5">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-3">Message a Friend</h2>
        </header>
        {friends.length ? (
          <ul className="flex gap-1 overflow-x-auto px-3 py-3">
            {friends.map((f) => (
              <li key={f.id} className="shrink-0">
                <Link href={`/messages/${f.id}`} className="flex w-[4.5rem] flex-col items-center gap-1.5 rounded-xl px-1 py-2 hover:bg-card-2">
                  <PresenceAvatar person={f} size="h-14 w-14" />
                  <span className="w-full truncate text-center text-xs font-medium text-ink-2">{f.name.split(/\s+/)[0]}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <Link href="/friends" className="flex min-h-14 items-center gap-3 px-5 py-4 text-sm text-ink-2 hover:bg-card-2">
            <UserPlusIcon className="h-5 w-5 text-emerald-300" />
            You can message friends. Find planters you know and add them first.
          </Link>
        )}
      </section>

      <section aria-label="Chats" className="eq-panel overflow-hidden rounded-2xl border border-line/80 bg-card shadow-sm">
        <header className="border-b border-line px-5 py-3.5">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-3">Chats</h2>
        </header>
        {rows.length ? (
          <ul className="divide-y divide-line">
            {rows.map((c) => (
              <li key={c.partner.id}>
                <Link href={`/messages/${c.partner.id}`} className={`flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-card-2 ${c.unread ? "bg-emerald-400/[0.06]" : ""}`}>
                  <PresenceAvatar person={c.partner} size="h-12 w-12" />
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-sm ${c.unread ? "font-bold text-ink" : "font-semibold text-ink-2"}`}>{c.partner.name}</span>
                    <span className={`block truncate text-sm ${c.unread ? "font-semibold text-ink" : "text-ink-3"}`}>{c.preview}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-xs text-ink-3" suppressHydrationWarning>
                      {shortTime(c.lastMessageAt)}
                    </span>
                    {c.unread > 0 && (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white" aria-label={`${c.unread} unread`}>
                        {c.unread > 9 ? "9+" : c.unread}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="px-6 py-10 text-center">
            <MessengerIcon className="mx-auto h-9 w-9 text-ink-4" />
            <p className="mt-2 text-sm font-medium text-ink-2">No messages yet</p>
            <p className="text-xs text-ink-3">Tap a friend above to say hi. You can send photos and videos too.</p>
          </div>
        )}
      </section>
    </div>
  );
}
