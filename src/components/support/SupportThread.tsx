"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import type { Ticket } from "@/lib/support";
import { sendChatMessage } from "@/components/ui/upload";
import { useLiveEvent, useVisiblePoll } from "@/components/layout/live";
import ChatFrame, { ChatHeader } from "@/components/chat/ChatFrame";
import ChatComposer from "@/components/chat/ChatComposer";
import MessageList, { type ChatItem } from "@/components/chat/MessageList";
import { ChatIcon, ChevronLeftIcon } from "@/components/ui/icons";

const MESSAGE_MAX = 2000; // = MESSAGE_MAX in lib/support (server-validated)
/** Fallback when live pings aren't available (local development, or the connection dropped). */
const POLL_MS = 10_000;
const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" });

/**
 * A problem report as a full-screen chat. `team` is the Admin Portal view: team messages sit on the
 * right, and they can resolve or reopen the report. Either side can send photos/videos and unsend
 * their own messages. Replies arrive with the live notification ping (each reply notifies the
 * other side), with polling as the fallback.
 */
export default function SupportThread({ ticket, team = false }: { ticket: Ticket; team?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(() => router.refresh(), [router]);
  useLiveEvent("notify", refresh);
  useVisiblePoll(refresh, POLL_MS);

  const base = `/api/support/${encodeURIComponent(ticket.id)}`;
  const items: ChatItem[] = ticket.messages.map((m) => {
    const mine = team ? m.fromTeam : !m.fromTeam;
    return {
      id: m.id,
      mine,
      body: m.body,
      media: m.media,
      createdAt: m.createdAt,
      deleted: m.deleted,
      // Names for the other side, and for teammates' replies in the Admin Portal.
      author: !mine || !m.own ? m.authorName : undefined,
      canUnsend: m.own,
    };
  });

  async function send(text: string, file: File | null, onProgress: (pct: number) => void) {
    const data = await sendChatMessage({ sendUrl: `${base}/messages`, uploadUrl: `${base}/upload` }, text, file, onProgress);
    if (data.error) return data.error;
    router.refresh();
    return null;
  }

  async function unsend(id: string) {
    const res = await fetch(`${base}/messages/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) return "Couldn't unsend. Check your connection and try again.";
    router.refresh();
    return null;
  }

  async function setStatus(status: "OPEN" | "CLOSED") {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/support/${encodeURIComponent(ticket.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }).catch(() => null);
    setBusy(false);
    if (res?.ok) router.refresh();
    else setError("Couldn't update the report. Try again.");
  }

  const closed = ticket.status === "CLOSED";
  return (
    <ChatFrame label={`Report: ${ticket.subject}`}>
      <ChatHeader>
        <Link
          href={team ? "/admin/support" : "/settings/support"}
          aria-label="Back to All Reports"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-emerald-300 hover:bg-card-3"
        >
          <ChevronLeftIcon className="h-6 w-6" />
        </Link>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold text-ink">{ticket.subject}</h2>
          <p className="truncate text-xs text-ink-3">
            {team ? `${ticket.user.name}${ticket.user.email ? ` · ${ticket.user.email}` : ""}` : "EcoQuest Team"} · Opened {fmt(ticket.createdAt)}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${
            closed ? "bg-card-3 text-ink-3 ring-line" : "bg-emerald-400/15 text-emerald-300 ring-emerald-400/30"
          }`}
        >
          {closed ? "Resolved" : "Open"}
        </span>
        {team && (
          <button
            type="button"
            disabled={busy}
            onClick={() => setStatus(closed ? "OPEN" : "CLOSED")}
            className="min-h-11 shrink-0 rounded-xl border border-line-strong bg-card-2 px-3 text-sm font-semibold text-ink-2 hover:bg-card-3 disabled:opacity-50"
          >
            {closed ? "Reopen" : "Mark Resolved"}
          </button>
        )}
      </ChatHeader>
      {error && (
        <p role="alert" className="shrink-0 bg-rose-500/10 px-4 py-2 text-xs text-rose-300">
          {error}
        </p>
      )}

      <MessageList
        items={items}
        onUnsend={unsend}
        empty={
          <p className="flex items-center gap-2 text-sm text-ink-3">
            <ChatIcon className="h-4 w-4" /> No messages yet.
          </p>
        }
      />
      <ChatComposer
        onSend={send}
        maxLength={MESSAGE_MAX}
        placeholder={team ? "Reply to the planter…" : "Write to our team…"}
        note={closed && !team ? "This report is resolved. Reply if you still need help and it will reopen." : undefined}
      />
    </ChatFrame>
  );
}
