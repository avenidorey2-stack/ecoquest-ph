"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CloseIcon, MoreIcon } from "@/components/ui/icons";

export type ChatItem = {
  id: string;
  mine: boolean;
  body: string;
  media: { url: string; type: string } | null;
  createdAt: string;
  deleted: boolean;
  /** Shown above the bubble when the chat has more than two kinds of author (e.g. the team). */
  author?: string;
  /** Only the author can unsend. */
  canUnsend: boolean;
};

const TZ = "Asia/Manila";
const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
/** Messages closer than this to the next one from the same side share one time stamp. */
const GROUP_MS = 5 * 60_000;
/** "At the bottom" within this many pixels: new messages then keep the view at the bottom. */
const NEAR_BOTTOM_PX = 120;

function dayLabel(iso: string) {
  const d = new Date(iso);
  const key = dayKey.format(d);
  const now = Date.now();
  if (key === dayKey.format(now)) return "Today";
  if (key === dayKey.format(now - 86_400_000)) return "Yesterday";
  const sameYear = key.slice(0, 4) === dayKey.format(now).slice(0, 4);
  return d.toLocaleDateString("en-PH", { timeZone: TZ, weekday: "short", month: "short", day: "numeric", year: sameYear ? undefined : "numeric" });
}

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("en-PH", { timeZone: TZ, hour: "numeric", minute: "2-digit" });

/** Full-screen photo viewer with a Close button and Escape. */
function Lightbox({ url, onClose }: { url: string; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    close.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCloseRef.current();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  return (
    <div role="dialog" aria-modal="true" aria-label="Photo" className="eq-fade fixed inset-0 z-[1500] grid place-items-center bg-black/90 p-4" onClick={onClose}>
      {/* eslint-disable-next-line @next/next/no-img-element -- private chat media behind an access check */}
      <img src={url} alt="" className="max-h-full max-w-full rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
      <button
        ref={close}
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] grid h-11 w-11 place-items-center rounded-full bg-black/60 text-white ring-1 ring-white/20 hover:bg-black/80"
      >
        <CloseIcon />
      </button>
    </div>
  );
}

function Media({ media, mine, onOpen, onLoad }: { media: NonNullable<ChatItem["media"]>; mine: boolean; onOpen: () => void; onLoad: () => void }) {
  const corner = mine ? "rounded-br-md" : "rounded-bl-md";
  if (media.type.startsWith("video/")) {
    return (
      <video
        src={media.url}
        controls
        playsInline
        preload="metadata"
        onLoadedMetadata={onLoad}
        className={`block max-h-80 w-64 max-w-full rounded-2xl ${corner} bg-black`}
      />
    );
  }
  return (
    <button type="button" onClick={onOpen} aria-label="Open photo" className={`block overflow-hidden rounded-2xl ${corner}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- private chat media behind an access check */}
      <img src={media.url} alt="" loading="lazy" decoding="async" onLoad={onLoad} className="block max-h-80 min-h-24 min-w-24 max-w-full bg-card-2 object-cover" />
    </button>
  );
}

/**
 * A chat's messages, oldest at the top, with a date line for each day and a time under each run
 * of messages. Keeps the newest message in view as messages arrive or the keyboard opens (unless
 * the reader scrolled up), and keeps the reader's place when older messages load above.
 */
export default function MessageList({
  items,
  onUnsend,
  seenAt,
  top,
  empty,
}: {
  items: ChatItem[];
  onUnsend: (id: string) => Promise<string | null>;
  /** When the other person last read the chat: "Seen" goes under the last message they've read. */
  seenAt?: string | null;
  /** Above the first message, e.g. a Load Earlier button. */
  top?: React.ReactNode;
  empty: React.ReactNode;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const edges = useRef<{ first?: string; last?: string; height: number }>({ height: 0 });
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ id: string; text: string } | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);

  const toBottom = () => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  };

  // New messages: stay at the bottom if the reader was there (or sent it). Older ones loaded
  // above: keep what the reader was looking at in place.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const first = items[0]?.id;
    const last = items.at(-1);
    const prev = edges.current;
    if (prev.last === last?.id && prev.first !== first && prev.first) {
      el.scrollTop += el.scrollHeight - prev.height;
    } else if (prev.last !== last?.id && (atBottom.current || last?.mine || !prev.last)) {
      toBottom();
      atBottom.current = true;
    }
    edges.current = { first, last: last?.id, height: el.scrollHeight };
  }, [items]);

  // The keyboard opening (or the window resizing) shrinks the list: keep the bottom in view.
  useEffect(() => {
    const el = scroller.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => atBottom.current && toBottom());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  async function unsend(id: string) {
    setBusy(true);
    setError(null);
    const problem = await onUnsend(id);
    setBusy(false);
    if (problem) setError({ id, text: problem });
    else setMenuFor(null);
  }

  // "Seen" under the newest of my messages that the other person has read.
  const seenId = seenAt ? items.findLast((m) => m.mine && !m.deleted && m.createdAt <= seenAt)?.id : undefined;
  const lastMineId = items.findLast((m) => m.mine)?.id;

  return (
    <div
      ref={scroller}
      onScroll={(e) => {
        const el = e.currentTarget;
        atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
      }}
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-4"
    >
      {top}
      {items.length === 0 ? (
        <div className="grid h-full place-items-center px-6 text-center">{empty}</div>
      ) : (
        <ol aria-label="Messages" className="space-y-0.5">
          {items.map((m, i) => {
            const prev = items[i - 1];
            const next = items[i + 1];
            const newDay = !prev || dayKey.format(new Date(prev.createdAt)) !== dayKey.format(new Date(m.createdAt));
            const runEnds = !next || next.mine !== m.mine || next.author !== m.author || +new Date(next.createdAt) - +new Date(m.createdAt) > GROUP_MS;
            const runStarts = newDay || !prev || prev.mine !== m.mine || prev.author !== m.author;
            const side = m.mine ? "items-end" : "items-start";
            const canMenu = m.canUnsend && !m.deleted;
            const seen = m.id === seenId && m.id === lastMineId;
            return (
              <li key={m.id} className={`flex flex-col ${side} ${runStarts ? "pt-2" : ""}`}>
                {newDay && (
                  <p className="my-2 w-full text-center text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3" suppressHydrationWarning>
                    {dayLabel(m.createdAt)}
                  </p>
                )}
                {runStarts && m.author && <p className="mb-0.5 px-1 text-xs font-semibold text-ink-3">{m.author}</p>}
                <div className={`flex max-w-[85%] items-center gap-1 sm:max-w-[75%] ${m.mine ? "flex-row-reverse" : ""}`}>
                  <div className={`flex min-w-0 flex-col gap-1 ${side}`}>
                    {m.deleted ? (
                      <p className="rounded-2xl border border-dashed border-line-strong px-3.5 py-2 text-sm italic text-ink-3">
                        {m.mine ? "You unsent a message" : "Message unsent"}
                      </p>
                    ) : (
                      <>
                        {m.media && (
                          <Media media={m.media} mine={m.mine} onOpen={() => setPhoto(m.media!.url)} onLoad={() => atBottom.current && toBottom()} />
                        )}
                        {m.body && (
                          <p
                            className={`whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[15px] leading-snug ${
                              m.mine ? "rounded-br-md bg-emerald-400 text-emerald-950" : "rounded-bl-md bg-card-3 text-ink"
                            }`}
                          >
                            {m.body}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                  {canMenu && (
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setMenuFor(menuFor === m.id ? null : m.id);
                      }}
                      aria-label="Message options"
                      aria-expanded={menuFor === m.id}
                      className="eq-hit relative grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-3 hover:bg-card-3 hover:text-ink"
                    >
                      <MoreIcon className="h-4 w-4" />
                    </button>
                  )}
                </div>
                {menuFor === m.id && (
                  <div className="mt-1 flex flex-wrap items-center justify-end gap-2 rounded-xl border border-line-strong bg-card-2 p-2 text-sm">
                    <span className="px-1 text-ink-2">Unsend for everyone?</span>
                    <button type="button" onClick={() => setMenuFor(null)} className="min-h-10 rounded-lg px-3 font-semibold text-ink-2 hover:bg-card-3">
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => unsend(m.id)}
                      className="min-h-10 rounded-lg bg-rose-500/15 px-3 font-semibold text-rose-300 ring-1 ring-rose-500/30 hover:bg-rose-500/25 disabled:opacity-50"
                    >
                      {busy ? "Unsending…" : "Unsend"}
                    </button>
                    {error?.id === m.id && (
                      <p role="alert" className="basis-full text-right text-xs text-rose-300">
                        {error.text}
                      </p>
                    )}
                  </div>
                )}
                {(runEnds || seen) && (
                  <p className="mb-1 mt-0.5 px-1 text-[11px] text-ink-3">
                    {runEnds && (
                      <time dateTime={m.createdAt} suppressHydrationWarning>
                        {timeOf(m.createdAt)}
                      </time>
                    )}
                    {seen && <span className="font-semibold text-emerald-300">{runEnds ? " · " : ""}Seen</span>}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {photo && <Lightbox url={photo} onClose={() => setPhoto(null)} />}
    </div>
  );
}
