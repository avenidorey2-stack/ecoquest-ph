"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import type { ChatMessage, Thread } from "@/lib/messages";
import { sendChatMessage } from "@/components/ui/upload";
import { MESSAGES_READ_EVENT, useLiveEvent, useVisiblePoll } from "@/components/layout/live";
import ChatFrame, { ChatHeader } from "./ChatFrame";
import ChatComposer from "./ChatComposer";
import MessageList, { type ChatItem } from "./MessageList";
import { ActiveLabel, PresenceAvatar } from "./Presence";
import { ChevronLeftIcon, MessagesIcon } from "@/components/ui/icons";

const MESSAGE_MAX = 2000; // = MESSAGE_MAX in lib/messages (server-validated)
/** Fallback when live pings aren't available (local development, or the connection dropped). */
const POLL_MS = 15_000;

const toItem = (m: ChatMessage): ChatItem => ({ ...m, canUnsend: m.mine });
const byTime = (a: ChatMessage, b: ChatMessage) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);

/** Merges a fetched page into what's on screen: fetched messages replace their old copies. */
function merge(current: ChatMessage[], fetched: ChatMessage[]) {
  const byId = new Map(current.map((m) => [m.id, m]));
  for (const m of fetched) byId.set(m.id, m);
  return [...byId.values()].sort(byTime);
}

/** A chat with a friend: live updates, photos/videos, unsend, "Seen" and their active status. */
export default function DirectChat({ initial }: { initial: Thread }) {
  const [partner, setPartner] = useState(initial.partner);
  const [messages, setMessages] = useState(initial.messages);
  const [hasMore, setHasMore] = useState(initial.hasMore);
  const [seenAt, setSeenAt] = useState(initial.seenAt);
  const [gone, setGone] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const base = `/api/messages/${encodeURIComponent(partner.id)}`;

  const refresh = useCallback(async () => {
    const res = await fetch(base, { cache: "no-store" }).catch(() => null);
    if (res?.status === 404) return setGone(true);
    if (!res?.ok) return;
    const data: Thread = await res.json();
    setPartner(data.partner);
    setSeenAt(data.seenAt);
    setMessages((cur) => merge(cur, data.messages));
    // Opening the latest messages marked the chat read: update the header badge now.
    window.dispatchEvent(new Event(MESSAGES_READ_EVENT));
  }, [base]);

  useLiveEvent("message", refresh);
  useVisiblePoll(refresh, POLL_MS);

  async function loadOlder() {
    const oldest = messages[0];
    if (!oldest || loadingOlder) return;
    setLoadingOlder(true);
    const res = await fetch(`${base}?before=${encodeURIComponent(oldest.id)}`, { cache: "no-store" }).catch(() => null);
    setLoadingOlder(false);
    if (!res?.ok) return;
    const data: Thread = await res.json();
    setHasMore(data.hasMore);
    setMessages((cur) => merge(cur, data.messages));
  }

  async function send(text: string, file: File | null, onProgress: (pct: number) => void) {
    const data = await sendChatMessage({ sendUrl: base, uploadUrl: `${base}/upload` }, text, file, onProgress);
    if (data.error) return data.error;
    setMessages((cur) => merge(cur, [data.message as ChatMessage]));
    return null;
  }

  async function unsend(id: string) {
    const res = await fetch(`${base}/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) return "Couldn't unsend. Check your connection and try again.";
    setMessages((cur) => cur.map((m) => (m.id === id ? { ...m, deleted: true, body: "", media: null } : m)));
    return null;
  }

  return (
    <ChatFrame label={`Chat with ${partner.name}`}>
      <ChatHeader>
        <Link href="/messages" aria-label="Back to Messages" className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-emerald-300 hover:bg-card-3">
          <ChevronLeftIcon className="h-6 w-6" />
        </Link>
        <Link href={`/planters/${partner.id}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl py-1 pr-2 hover:bg-card-2">
          <PresenceAvatar person={partner} />
          <span className="min-w-0">
            <span className="block truncate text-base font-semibold text-ink">{partner.name}</span>
            <ActiveLabel activeAt={partner.activeAt} className="block truncate text-xs" />
          </span>
        </Link>
      </ChatHeader>

      {gone ? (
        <div className="grid flex-1 place-items-center p-6 text-center text-sm text-ink-3">This chat is no longer available.</div>
      ) : (
        <>
          <MessageList
            items={messages.map(toItem)}
            onUnsend={unsend}
            seenAt={seenAt}
            top={
              hasMore && (
                <div className="mb-2 text-center">
                  <button
                    type="button"
                    onClick={loadOlder}
                    disabled={loadingOlder}
                    className="min-h-10 rounded-full border border-line-strong bg-card-2 px-4 text-sm font-semibold text-ink-2 hover:bg-card-3 disabled:opacity-50"
                  >
                    {loadingOlder ? "Loading…" : "Load Earlier Messages"}
                  </button>
                </div>
              )
            }
            empty={
              <div>
                <PresenceAvatar person={partner} size="h-16 w-16" />
                <p className="mt-3 text-base font-semibold text-ink">{partner.name}</p>
                <p className="mt-1 flex items-center justify-center gap-1.5 text-sm text-ink-3">
                  <MessagesIcon className="h-4 w-4 text-emerald-300" /> Say hi to your planting friend!
                </p>
              </div>
            }
          />
          {partner.canSend ? (
            <ChatComposer onSend={send} placeholder="Message…" maxLength={MESSAGE_MAX} />
          ) : (
            <p className="shrink-0 border-t border-line bg-card px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-center text-sm text-ink-3">
              You can only message friends. Add {partner.name} as a friend to chat again.
            </p>
          )}
        </>
      )}
    </ChatFrame>
  );
}
