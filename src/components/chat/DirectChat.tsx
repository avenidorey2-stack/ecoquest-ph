"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import type { ChatMessage, ReactionView, Thread } from "@/lib/messages";
import { sendChatMessage } from "@/components/ui/upload";
import { MESSAGES_READ_EVENT, useLiveEvent, useVisiblePoll } from "@/components/layout/live";
import ChatFrame, { ChatHeader } from "./ChatFrame";
import ChatComposer from "./ChatComposer";
import MessageList, { type ChatItem } from "./MessageList";
import { ActiveLabel, PresenceAvatar } from "./Presence";
import { useDockWindow } from "./pane";
import { ChevronLeftIcon, CloseIcon, ExpandIcon, MessagesIcon } from "@/components/ui/icons";

const dockBtn = "grid h-9 w-9 shrink-0 place-items-center rounded-full text-emerald-300 hover:bg-card-3";

const MESSAGE_MAX = 2000; // = MESSAGE_MAX in lib/messages (server-validated)
/** Fallback when live pings aren't available (local development, or the connection dropped). */
const POLL_MS = 15_000;

const byTime = (a: ChatMessage, b: ChatMessage) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);

/** Merges a fetched page into what's on screen: fetched messages replace their old copies. */
function merge(current: ChatMessage[], fetched: ChatMessage[]) {
  const byId = new Map(current.map((m) => [m.id, m]));
  for (const m of fetched) byId.set(m.id, m);
  return [...byId.values()].sort(byTime);
}

/** "You replied to Ana", "Ana replied to you", … */
function replyLabel(m: ChatMessage, quotedMine: boolean, them: string) {
  if (m.mine) return quotedMine ? "You replied to yourself" : `You replied to ${them}`;
  return quotedMine ? `${them} replied to you` : `${them} replied to themself`;
}

/**
 * A chat with a friend: live updates, photos/videos, replies, reactions, unsend, "Seen" and
 * their active status.
 */
export default function DirectChat({ initial }: { initial: Thread }) {
  const [partner, setPartner] = useState(initial.partner);
  const [messages, setMessages] = useState(initial.messages);
  const [hasMore, setHasMore] = useState(initial.hasMore);
  const [seenAt, setSeenAt] = useState(initial.seenAt);
  const [gone, setGone] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const dock = useDockWindow();
  const firstName = partner.name.split(/\s+/)[0];
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
    const extra: Record<string, string> = replyTo ? { replyTo: replyTo.id } : {};
    const data = await sendChatMessage({ sendUrl: base, uploadUrl: `${base}/upload` }, text, file, onProgress, extra);
    if (data.error) return data.error;
    setMessages((cur) => merge(cur, [data.message as ChatMessage]));
    setReplyTo(null);
    window.dispatchEvent(new Event(MESSAGES_READ_EVENT)); // the chat list shows it as the latest
    return null;
  }

  const setReactions = (id: string, reactions: ReactionView[]) => setMessages((cur) => cur.map((m) => (m.id === id ? { ...m, reactions } : m)));

  // Shows the reaction at once; puts it back if saving fails.
  async function react(id: string, emoji: string | null) {
    const before = messages.find((m) => m.id === id)?.reactions ?? [];
    setReactions(id, [...before.filter((r) => !r.mine), ...(emoji ? [{ emoji, mine: true }] : [])]);
    const res = await fetch(`${base}/${encodeURIComponent(id)}/reaction`, {
      method: emoji ? "PUT" : "DELETE",
      headers: { "Content-Type": "application/json" },
      body: emoji ? JSON.stringify({ emoji }) : undefined,
    }).catch(() => null);
    if (!res?.ok) return setReactions(id, before);
    const data: { reactions: ReactionView[] } = await res.json();
    setReactions(id, data.reactions);
  }

  const toItem = (m: ChatMessage): ChatItem => ({
    ...m,
    canUnsend: m.mine,
    replyTo: m.replyTo && { id: m.replyTo.id, label: replyLabel(m, m.replyTo.mine, firstName), preview: m.replyTo.preview, media: m.replyTo.media },
  });

  async function unsend(id: string) {
    const res = await fetch(`${base}/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) return "Couldn't unsend. Check your connection and try again.";
    setMessages((cur) => cur.map((m) => (m.id === id ? { ...m, deleted: true, body: "", media: null, reactions: [], replyTo: null } : m)));
    if (replyTo?.id === id) setReplyTo(null);
    return null;
  }

  return (
    <ChatFrame label={`Chat with ${partner.name}`}>
      <ChatHeader>
        {!dock && (
          <Link href="/messages" aria-label="Back to Messages" className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-emerald-300 hover:bg-card-3 lg:hidden">
            <ChevronLeftIcon className="h-6 w-6" />
          </Link>
        )}
        <Link href={`/planters/${partner.id}`} className={`flex min-w-0 flex-1 items-center rounded-xl py-1 pr-2 hover:bg-card-2 ${dock ? "gap-2 pl-1" : "gap-3"}`}>
          <PresenceAvatar person={partner} size={dock ? "h-8 w-8" : undefined} />
          <span className="min-w-0">
            <span className={`block truncate font-semibold text-ink ${dock ? "text-sm" : "text-base"}`}>{partner.name}</span>
            <ActiveLabel presence={partner} className="block truncate text-xs" />
          </span>
        </Link>
        {/* Pop-up window (desktop): open full size, minimize to a bubble, or close — like Facebook. */}
        {dock && (
          <>
            <Link href={`/messages/${partner.id}`} onClick={dock.close} aria-label="Open in Messages" title="Open in Messages" className={dockBtn}>
              <ExpandIcon className="h-4 w-4" />
            </Link>
            <button type="button" onClick={dock.minimize} aria-label="Minimize chat" title="Minimize" className={dockBtn}>
              <span className="block h-0.5 w-3.5 rounded-full bg-current" aria-hidden />
            </button>
            <button type="button" onClick={dock.close} aria-label="Close chat" title="Close" className={dockBtn}>
              <CloseIcon className="h-5 w-5" />
            </button>
          </>
        )}
      </ChatHeader>

      {gone ? (
        <div className="grid flex-1 place-items-center p-6 text-center text-sm text-ink-3">This chat is no longer available.</div>
      ) : (
        <>
          <MessageList
            items={messages.map(toItem)}
            onUnsend={unsend}
            onReact={partner.canSend ? react : undefined}
            onReply={partner.canSend ? (item) => setReplyTo(messages.find((m) => m.id === item.id) ?? null) : undefined}
            otherName={firstName}
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
            <ChatComposer
              onSend={send}
              placeholder="Message…"
              maxLength={MESSAGE_MAX}
              replyingTo={
                replyTo && {
                  key: replyTo.id,
                  label: `Replying to ${replyTo.mine ? "yourself" : firstName}`,
                  preview: replyTo.body || (replyTo.media?.type.startsWith("video/") ? "Video" : "Photo"),
                }
              }
              onCancelReply={() => setReplyTo(null)}
            />
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
