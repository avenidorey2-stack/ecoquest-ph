"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Ticket } from "@/lib/support";
import { SendIcon } from "@/components/ui/icons";

const MESSAGE_MAX = 2000;
const fmt = (iso: string) =>
  new Date(iso).toLocaleString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/**
 * A problem report as a chat. `team` is the Admin Portal view: their own (team) messages sit on the
 * right, and they can resolve or reopen the report. New messages arrive via the page's auto-refresh.
 */
export default function SupportThread({ ticket, team = false }: { ticket: Ticket; team?: boolean }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLLIElement>(null);
  const count = ticket.messages.length;

  // Keep the newest message in view as the conversation grows.
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [count]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/support/${encodeURIComponent(ticket.id)}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't send your message.");
      setText("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error && err.message !== "Failed to fetch" ? err.message : "No connection. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(status: "OPEN" | "CLOSED") {
    setBusy(true);
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
    <section className="eq-panel flex min-h-[60dvh] flex-col overflow-hidden rounded-2xl border border-line/80 bg-card shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-ink">{ticket.subject}</h2>
          <p className="text-xs text-ink-3">
            {team ? `${ticket.user.name}${ticket.user.email ? ` · ${ticket.user.email}` : ""} · ` : ""}Opened {fmt(ticket.createdAt)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${
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
              className="min-h-10 rounded-xl border border-line-strong bg-card-2 px-3 text-sm font-semibold text-ink-2 hover:bg-card-3 disabled:opacity-50"
            >
              {closed ? "Reopen" : "Mark Resolved"}
            </button>
          )}
        </div>
      </header>

      <ol className="flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-label="Messages">
        {ticket.messages.map((m) => {
          const mine = team ? m.fromTeam : !m.fromTeam;
          return (
            <li key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${mine ? "rounded-br-md bg-emerald-400/15 ring-1 ring-emerald-400/25" : "rounded-bl-md bg-card-3/80"}`}>
                <p className="text-xs font-semibold text-ink-2">{m.authorName}</p>
                <p className="whitespace-pre-wrap break-words text-sm text-ink">{m.body}</p>
                <time dateTime={m.createdAt} className="mt-1 block text-[11px] text-ink-3">
                  {fmt(m.createdAt)}
                </time>
              </div>
            </li>
          );
        })}
        <li ref={end} aria-hidden />
      </ol>

      <form onSubmit={send} className="border-t border-line px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        {closed && !team && <p className="mb-2 text-xs text-ink-3">This report is resolved. Reply if you still need help and it will reopen.</p>}
        <div className="flex items-end gap-2">
          <label htmlFor="support-reply" className="sr-only">
            Write a message
          </label>
          <textarea
            id="support-reply"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            maxLength={MESSAGE_MAX}
            placeholder={team ? "Reply to the planter…" : "Write a message to our team…"}
            className="max-h-40 min-h-11 flex-1 resize-y rounded-xl border border-line-strong bg-card-2 px-3 py-2.5 text-sm text-ink outline-none focus:border-emerald-400/60"
          />
          <button
            type="submit"
            disabled={!text.trim() || busy}
            aria-label="Send"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-400 text-emerald-950 hover:bg-emerald-300 disabled:opacity-40"
          >
            <SendIcon className="h-5 w-5" />
          </button>
        </div>
        {error && (
          <p role="alert" className="mt-1.5 text-xs text-rose-300">
            {error}
          </p>
        )}
      </form>
    </section>
  );
}
