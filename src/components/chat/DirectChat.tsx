"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import type { ChatMessage, ReactionView, Thread } from "@/lib/messages";
import { sendChatMessage } from "@/components/ui/upload";
import { mediaLabel } from "@/lib/media-rules";
import { MESSAGES_READ_EVENT, useLiveEvent, useVisiblePoll } from "@/components/layout/live";
import ChatFrame, { ChatHeader } from "./ChatFrame";
import ChatComposer from "./ChatComposer";
import MessageList, { type ChatItem } from "./MessageList";
import { ActiveLabel, PresenceAvatar } from "./Presence";
import { useDockWindow } from "./pane";
import { ChevronLeftIcon, CloseIcon, ExpandIcon, MessagesIcon, TrashIcon } from "@/components/ui/icons";

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
 * A message request from someone who isn't a friend: reply below to accept, or Accept, Delete
 * (hidden until they write again) or Block. Their photos, videos and voice stay hidden until then.
 */
function RequestBar({ name, base, userId, onAccepted, onGone }: { name: string; base: string; userId: string; onAccepted: () => void; onGone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function act(url: string, method: "POST" | "DELETE", then: () => void, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setError(null);
    const res = await fetch(url, { method }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setError("That didn't work. Check your connection and try again.");
    window.dispatchEvent(new Event(MESSAGES_READ_EVENT)); // the chat list moves it out of Requests
    then();
  }
  const btn = "inline-flex min-h-11 flex-1 items-center justify-center rounded-xl px-3 text-sm font-semibold disabled:opacity-50";
  return (
    <div className="shrink-0 border-t border-line bg-card-2 px-3 py-3">
      <p className="text-center text-sm text-ink-2">
        <span className="font-semibold text-ink">{name}</span> isn&apos;t your friend. Reply to accept their message request, or:
      </p>
      <div className="mt-2 flex gap-2">
        <button type="button" disabled={busy} onClick={() => act(`${base}/request`, "POST", onAccepted)} className={`${btn} bg-emerald-400 text-emerald-950 hover:bg-emerald-300`}>
          Accept
        </button>
        <button type="button" disabled={busy} onClick={() => act(`${base}/request`, "DELETE", onGone)} className={`${btn} text-ink-2 ring-1 ring-line-strong hover:bg-card-3`}>
          Delete
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => act(`/api/blocks/${encodeURIComponent(userId)}`, "POST", onGone, `Block ${name}? You won't see each other's messages, profiles or photos.`)}
          className={`${btn} text-rose-200 ring-1 ring-rose-500/40 hover:bg-rose-500/10`}
        >
          Block
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-center text-xs text-rose-300">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * A chat with another planter: live updates, photos/videos/voice, replies, reactions, unsend,
 * "Seen", deleting the chat (for you only) and (for friends) their active status. With someone who isn't a friend, the first message
 * is a message request: the sender sees "Request sent", the other person can reply or accept.
 */
export default function DirectChat({ initial }: { initial: Thread }) {
  const [partner, setPartner] = useState(initial.partner);
  const [messages, setMessages] = useState(initial.messages);
  const [hasMore, setHasMore] = useState(initial.hasMore);
  const [seenAt, setSeenAt] = useState(initial.seenAt);
  const [gone, setGone] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const dock = useDockWindow();
  const router = useRouter();
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
    // Replying to a request, or a first message to a non-friend: the request state changed.
    if (partner.request === "incoming" || (!partner.friends && !messages.length)) refresh();
    return null;
  }

  /** The request was deleted, or they were blocked: leave the chat. */
  function leave() {
    if (dock) dock.close();
    else router.push("/messages");
  }

  /** Deletes the chat for the viewer only (they keep theirs), then leaves it. */
  async function deleteChat() {
    if (!window.confirm(`Delete your chat with ${partner.name}? Its messages are cleared for you only — ${firstName} keeps theirs and isn't told.`)) return;
    setDeleteError(null);
    const res = await fetch(base, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) return setDeleteError("Couldn't delete the chat. Check your connection and try again.");
    window.dispatchEvent(new Event(MESSAGES_READ_EVENT)); // the chat list drops it
    leave();
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
        {messages.length > 0 && !gone && (
          <button
            type="button"
            onClick={deleteChat}
            aria-label="Delete chat"
            title="Delete chat"
            className={dock ? dockBtn : "grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink-3 hover:bg-card-3 hover:text-rose-300"}
          >
            <TrashIcon className={dock ? "h-4 w-4" : "h-5 w-5"} />
          </button>
        )}
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

      {deleteError && (
        <p role="alert" className="shrink-0 border-b border-line bg-card-2 px-4 py-2 text-center text-xs text-rose-300">
          {deleteError}
        </p>
      )}
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
                  <MessagesIcon className="h-4 w-4 text-emerald-300" /> {partner.friends ? "Say hi to your planting friend!" : `Say hi to ${firstName}!`}
                </p>
                {!partner.friends && partner.canSend && (
                  <p className="mx-auto mt-2 max-w-xs text-xs text-ink-3">You&apos;re not friends yet, so your first message goes to their Message Requests.</p>
                )}
              </div>
            }
          />
          {partner.request === "incoming" && <RequestBar name={partner.name} base={base} userId={partner.id} onAccepted={refresh} onGone={leave} />}
          {partner.canSend ? (
            <ChatComposer
              onSend={send}
              placeholder={partner.request === "incoming" ? "Reply to accept…" : "Message…"}
              maxLength={MESSAGE_MAX}
              note={partner.request === "outgoing" ? `Message request sent. ${firstName} will see it in their Message Requests and can reply.` : undefined}
              replyingTo={
                replyTo && {
                  key: replyTo.id,
                  label: `Replying to ${replyTo.mine ? "yourself" : firstName}`,
                  preview: replyTo.body || (replyTo.media ? mediaLabel(replyTo.media.type) : ""),
                }
              }
              onCancelReply={() => setReplyTo(null)}
            />
          ) : (
            <p className="shrink-0 border-t border-line bg-card px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-center text-sm text-ink-3">
              {partner.reason}
            </p>
          )}
        </>
      )}
    </ChatFrame>
  );
}
