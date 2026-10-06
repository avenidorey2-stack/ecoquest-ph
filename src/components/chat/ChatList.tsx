"use client";

import Link from "next/link";
import { useState } from "react";
import type { ConversationRow } from "@/lib/messages";
import type { PlanterCard } from "@/lib/friends";
import { PresenceAvatar } from "./Presence";
import { MessagesIcon, SearchIcon } from "@/components/ui/icons";

/** "now", "4m", "3h", "Mon", "Oct 1" (Manila time), like Messenger. */
function shortTime(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  if (mins < 24 * 60) return `${Math.floor(mins / 60)}h`;
  const opts: Intl.DateTimeFormatOptions = ms < 6 * 86_400_000 ? { weekday: "short" } : { month: "short", day: "numeric" };
  return new Date(iso).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", ...opts });
}

function SkeletonRow() {
  return (
    <li className="flex items-center gap-3 px-3 py-2.5" aria-hidden>
      <span className="h-14 w-14 shrink-0 animate-pulse rounded-full bg-card-3" />
      <span className="flex-1 space-y-2">
        <span className="block h-3.5 w-2/5 animate-pulse rounded-full bg-card-3" />
        <span className="block h-3 w-3/4 animate-pulse rounded-full bg-card-3" />
      </span>
    </li>
  );
}

type Filter = "all" | "unread";

/**
 * Chats like Messenger's list: search by name, All / Unread, a row of friends to start a chat
 * with (green dot while active), and one row per chat with the friend's photo, name, last
 * message · time, and a dot when unread. Searching also finds friends you haven't chatted with.
 * `rows` null shows loading placeholders.
 */
export default function ChatList({
  rows,
  friends = [],
  onOpen,
  failed,
}: {
  rows: ConversationRow[] | null;
  friends?: PlanterCard[];
  onOpen?: () => void;
  failed?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const q = query.trim().toLowerCase();
  const matches = (name: string) => !q || name.toLowerCase().includes(q);
  const shown = rows?.filter((c) => (filter === "all" || c.unread > 0) && matches(c.partner.name));
  const chatted = new Set(rows?.map((c) => c.partner.id));
  const newFriends = q && filter === "all" ? friends.filter((f) => !chatted.has(f.id) && matches(f.name)) : [];

  return (
    <div className="flex min-h-0 flex-col">
      <div className="space-y-2 px-3 pb-2">
        <label className="flex h-10 items-center gap-2 rounded-full bg-card-2 px-3 ring-1 ring-line focus-within:ring-emerald-400/50">
          <SearchIcon className="h-4 w-4 shrink-0 text-ink-3" />
          <span className="sr-only">Search chats</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search Messages"
            className="min-h-0 w-full bg-transparent text-base text-ink outline-none placeholder:text-ink-4 sm:text-sm"
          />
        </label>
        <div role="tablist" aria-label="Show" className="flex gap-1">
          {(["all", "unread"] as const).map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={filter === f}
              onClick={() => setFilter(f)}
              className={`min-h-10 rounded-full px-4 text-sm font-semibold transition-colors ${
                filter === f ? "bg-emerald-400/15 text-emerald-300" : "text-ink-2 hover:bg-card-2"
              }`}
            >
              {f === "all" ? "All" : "Unread"}
            </button>
          ))}
        </div>
      </div>

      {!q && filter === "all" && friends.length > 0 && (
        <ul aria-label="Friends" className="flex gap-1 overflow-x-auto px-2 pb-2">
          {friends.map((f) => (
            <li key={f.id} className="shrink-0">
              <Link href={`/messages/${f.id}`} onClick={onOpen} className="flex w-[4.25rem] flex-col items-center gap-1 rounded-xl px-1 py-1.5 hover:bg-card-2">
                <PresenceAvatar person={f} size="h-14 w-14" />
                <span className="w-full truncate text-center text-xs text-ink-2">{f.name.split(/\s+/)[0]}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {failed && !rows ? (
        <p className="px-4 py-8 text-center text-sm text-rose-300">Couldn&apos;t load your chats. Check your connection and try again.</p>
      ) : !shown ? (
        <ul aria-label="Loading">
          {[0, 1, 2, 3].map((i) => (
            <SkeletonRow key={i} />
          ))}
        </ul>
      ) : shown.length === 0 && newFriends.length === 0 ? (
        <div className="px-6 py-8 text-center">
          <MessagesIcon className="mx-auto h-8 w-8 text-ink-4" />
          <p className="mt-2 text-sm font-medium text-ink-2">
            {q ? "No chats match that name" : filter === "unread" ? "You're all caught up" : "No messages yet"}
          </p>
          {!q && filter === "all" && <p className="text-xs text-ink-3">Message a friend to start chatting. You can send photos and videos too.</p>}
        </div>
      ) : (
        <>
        <ul className="px-1.5 pb-1.5">
          {shown.map((c) => (
            <li key={c.partner.id}>
              <Link href={`/messages/${c.partner.id}`} onClick={onOpen} className="flex min-h-16 items-center gap-3 rounded-xl px-2 py-2 hover:bg-card-2">
                <PresenceAvatar person={c.partner} size="h-14 w-14" />
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-[15px] ${c.unread ? "font-bold text-ink" : "font-semibold text-ink"}`}>{c.partner.name}</span>
                  <span className={`flex min-w-0 text-[13px] ${c.unread ? "font-semibold text-ink" : "text-ink-3"}`}>
                    <span className="truncate">{c.preview}</span>
                    <span className="shrink-0 whitespace-pre" suppressHydrationWarning>
                      {" · "}
                      {shortTime(c.lastMessageAt)}
                    </span>
                  </span>
                </span>
                {c.unread > 0 && (
                  <span className="h-3 w-3 shrink-0 rounded-full bg-emerald-400" role="img" aria-label={`${c.unread} unread`} />
                )}
              </Link>
            </li>
          ))}
        </ul>
        {newFriends.length > 0 && (
          <>
            <p className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-3">Friends</p>
            <ul className="px-1.5 pb-1.5">
              {newFriends.map((f) => (
                <li key={f.id}>
                  <Link href={`/messages/${f.id}`} onClick={onOpen} className="flex min-h-16 items-center gap-3 rounded-xl px-2 py-2 hover:bg-card-2">
                    <PresenceAvatar person={f} size="h-14 w-14" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold text-ink">{f.name}</span>
                      <span className="block text-[13px] text-ink-3">Start a chat</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
        </>
      )}
    </div>
  );
}
