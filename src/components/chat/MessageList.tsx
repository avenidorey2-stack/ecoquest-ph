"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { MoreIcon, ReplyIcon, SmileIcon } from "@/components/ui/icons";
import MediaViewer from "./MediaViewer";
import SwipeBubble from "./SwipeBubble";

type Media = { url: string; type: string };

export type ChatItem = {
  id: string;
  mine: boolean;
  body: string;
  media: Media | null;
  createdAt: string;
  deleted: boolean;
  /** Shown above the bubble when the chat has more than two kinds of author (e.g. the team). */
  author?: string;
  /** Only the author can unsend. */
  canUnsend: boolean;
  /** The earlier message this one replies to: "You replied to Ana" + a preview. */
  replyTo?: { id: string; label: string; preview: string; media: Media | null } | null;
  reactions?: { emoji: string; mine: boolean }[];
};

/** Reactions offered, like Messenger's (the server accepts only these). */
export const REACTION_CHOICES = ["❤️", "😆", "😮", "😢", "😠", "👍"];

const TZ = "Asia/Manila";
const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
/** Messages closer than this to the next one from the same side share one time stamp. */
const GROUP_MS = 5 * 60_000;
/** "At the bottom" within this many pixels: new messages then keep the view at the bottom. */
const NEAR_BOTTOM_PX = 120;
const FLASH_MS = 1400;

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

function MediaBubble({ media, mine, onOpen, onLoad }: { media: Media; mine: boolean; onOpen: () => void; onLoad: () => void }) {
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
      <img src={media.url} alt="" loading="lazy" decoding="async" draggable={false} onLoad={onLoad} className="block max-h-80 min-h-24 min-w-24 max-w-full bg-card-2 object-cover" />
    </button>
  );
}

/** The reactions under a bubble: up to three kinds, and how many in all. Tap to react. */
function ReactionPill({
  reactions,
  mine,
  otherName,
  onClick,
}: {
  reactions: NonNullable<ChatItem["reactions"]>;
  mine: boolean;
  otherName: string;
  onClick?: () => void;
}) {
  const kinds = [...new Set(reactions.map((r) => r.emoji))].slice(0, 3);
  const label = reactions.map((r) => `${r.emoji} ${r.mine ? "You" : otherName}`).join(", ");
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      aria-label={`Reactions: ${label}`}
      title={label}
      className={`absolute -bottom-3 z-[1] flex h-6 items-center gap-0.5 rounded-full bg-card-2 px-1.5 text-[13px] leading-none shadow ring-2 ring-card ${mine ? "left-2" : "right-2"}`}
    >
      {kinds.map((k) => (
        <span key={k}>{k}</span>
      ))}
      {reactions.length > 1 && <span className="pl-0.5 text-[11px] font-semibold text-ink-2">{reactions.length}</span>}
    </button>
  );
}

const toolBtn = "grid h-8 w-8 place-items-center rounded-full text-ink-3 hover:bg-card-3 hover:text-ink";

type Panel = { id: string; mode: "react" | "sheet" | "unsend" };

/**
 * A chat's messages, oldest at the top, with a date line for each day and a time under each run
 * of messages. Keeps the newest message in view as messages arrive or the keyboard opens (unless
 * the reader scrolled up), and keeps the reader's place when older messages load above.
 *
 * With `onReact` / `onReply`: hover a message (computers) for React · Reply · More buttons; on
 * phones drag a message toward the middle to reply, or hold it for reactions and actions. Replies
 * show the message they answer above them (tap it to jump there).
 */
export default function MessageList({
  items,
  onUnsend,
  onReact,
  onReply,
  otherName = "Them",
  seenAt,
  top,
  empty,
}: {
  items: ChatItem[];
  onUnsend: (id: string) => Promise<string | null>;
  /** React to a message (`null` removes your reaction). */
  onReact?: (id: string, emoji: string | null) => void;
  onReply?: (item: ChatItem) => void;
  /** Who the other reactions are from, for screen readers ("❤️ Ana"). */
  otherName?: string;
  /** When the other person last read the chat: "Seen" goes under the last message they've read. */
  seenAt?: string | null;
  /** Above the first message, e.g. a Load Earlier button. */
  top?: React.ReactNode;
  empty: React.ReactNode;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const edges = useRef<{ first?: string; last?: string; height: number }>({ height: 0 });
  const [panel, setPanel] = useState<Panel | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ id: string; text: string } | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

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

  // An open reaction bar or menu closes on Escape or a tap anywhere else.
  useEffect(() => {
    if (!panel) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPanel(null);
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (!t?.closest?.(`[data-panel-for="${panel.id}"]`)) setPanel(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [panel]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), FLASH_MS);
    return () => clearTimeout(t);
  }, [flash]);

  function toggle(id: string, mode: Panel["mode"]) {
    setError(null);
    setPanel((p) => (p?.id === id && p.mode === mode ? null : { id, mode }));
  }

  function jumpTo(id: string) {
    const el = document.getElementById(`msg-${id}`);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    setFlash(id);
  }

  async function unsend(id: string) {
    setBusy(true);
    setError(null);
    const problem = await onUnsend(id);
    setBusy(false);
    if (problem) setError({ id, text: problem });
    else setPanel(null);
  }

  function react(m: ChatItem, emoji: string) {
    const current = m.reactions?.find((r) => r.mine)?.emoji;
    onReact?.(m.id, current === emoji ? null : emoji);
    setPanel(null);
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
            const runStarts = newDay || !prev || prev.mine !== m.mine || prev.author !== m.author || !!m.replyTo;
            const side = m.mine ? "items-end" : "items-start";
            const canUnsend = m.canUnsend && !m.deleted;
            const canReact = !!onReact && !m.deleted;
            const canReply = !!onReply && !m.deleted;
            const hasTools = canUnsend || canReact || canReply;
            const reactions = m.deleted ? [] : (m.reactions ?? []);
            const mineNow = reactions.find((r) => r.mine)?.emoji;
            const open = panel?.id === m.id ? panel.mode : null;
            const seen = m.id === seenId && m.id === lastMineId;
            return (
              <li key={m.id} id={`msg-${m.id}`} data-panel-for={m.id} className={`group/msg flex flex-col ${side} ${runStarts ? "pt-2" : ""}`}>
                {newDay && (
                  <p className="my-2 w-full text-center text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3" suppressHydrationWarning>
                    {dayLabel(m.createdAt)}
                  </p>
                )}
                {runStarts && m.author && <p className="mb-0.5 px-1 text-xs font-semibold text-ink-3">{m.author}</p>}
                {m.replyTo && !m.deleted && (
                  <button
                    type="button"
                    onClick={() => jumpTo(m.replyTo!.id)}
                    className={`flex max-w-[75%] flex-col ${side} sm:max-w-[65%]`}
                    aria-label={`${m.replyTo.label}: ${m.replyTo.preview}. Show that message`}
                  >
                    <span className="flex items-center gap-1 px-1 pb-0.5 text-[11px] text-ink-3">
                      <ReplyIcon className="h-3 w-3" /> {m.replyTo.label}
                    </span>
                    <span className="-mb-2 flex max-w-full items-center gap-2 rounded-2xl bg-card-2 px-3 pb-3.5 pt-1.5 text-left text-[13px] text-ink-3 ring-1 ring-line hover:bg-card-3">
                      {m.replyTo.media?.type.startsWith("image/") && (
                        // eslint-disable-next-line @next/next/no-img-element -- private chat media behind an access check
                        <img src={m.replyTo.media.url} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                      )}
                      <span className="line-clamp-2 break-words">{m.replyTo.preview}</span>
                    </span>
                  </button>
                )}
                <div className={`flex max-w-[85%] items-center gap-1 sm:max-w-[75%] ${m.mine ? "flex-row-reverse" : ""} ${reactions.length ? "mb-3" : ""}`}>
                  <SwipeBubble
                    mine={m.mine}
                    onReply={canReply ? () => onReply!(m) : undefined}
                    onLongPress={hasTools ? () => toggle(m.id, "sheet") : undefined}
                  >
                    <div
                      className={`flex min-w-0 flex-col gap-1 rounded-2xl transition-shadow duration-300 ${side} ${
                        flash === m.id ? "shadow-[0_0_0_3px_rgba(52,211,153,.55)]" : ""
                      }`}
                    >
                      {m.deleted ? (
                        <p className="rounded-2xl border border-dashed border-line-strong px-3.5 py-2 text-sm italic text-ink-3">
                          {m.mine ? "You unsent a message" : "Message unsent"}
                        </p>
                      ) : (
                        <>
                          {m.media && (
                            <MediaBubble media={m.media} mine={m.mine} onOpen={() => setPhoto(m.media!.url)} onLoad={() => atBottom.current && toBottom()} />
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
                    {reactions.length > 0 && <ReactionPill reactions={reactions} mine={m.mine} otherName={otherName} onClick={canReact ? () => toggle(m.id, "react") : undefined} />}
                  </SwipeBubble>

                  {/* Computers: React · Reply · More beside the bubble on hover (or keyboard focus). */}
                  {hasTools && (
                    <div
                      className={`flex shrink-0 items-center opacity-0 transition-opacity group-hover/msg:opacity-100 focus-within:opacity-100 pointer-coarse:hidden ${
                        m.mine ? "flex-row-reverse" : ""
                      } ${open ? "opacity-100" : ""}`}
                    >
                      {canReact && (
                        <button type="button" onClick={() => toggle(m.id, "react")} aria-label="React" title="React" aria-expanded={open === "react"} className={toolBtn}>
                          <SmileIcon className="h-[18px] w-[18px]" />
                        </button>
                      )}
                      {canReply && (
                        <button type="button" onClick={() => onReply!(m)} aria-label="Reply" title="Reply" className={toolBtn}>
                          <ReplyIcon className="h-[18px] w-[18px]" />
                        </button>
                      )}
                      {canUnsend && (
                        <button type="button" onClick={() => toggle(m.id, "unsend")} aria-label="More" title="More" aria-expanded={open === "unsend"} className={toolBtn}>
                          <MoreIcon className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Reaction bar: from the React button, the reactions under a bubble, or a long press. */}
                {(open === "react" || open === "sheet") && (
                  <div className="eq-fade mt-1 flex max-w-full flex-col gap-1.5" style={{ alignItems: m.mine ? "flex-end" : "flex-start" }}>
                    {canReact && (
                      <div role="group" aria-label="Reactions" className="flex items-center gap-0.5 rounded-full border border-line-strong bg-card-2 p-1 shadow-lg">
                        {REACTION_CHOICES.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => react(m, emoji)}
                            aria-label={mineNow === emoji ? `Remove ${emoji}` : `React ${emoji}`}
                            aria-pressed={mineNow === emoji}
                            className={`grid h-10 w-10 place-items-center rounded-full text-[22px] leading-none transition-transform hover:scale-110 hover:bg-card-3 ${
                              mineNow === emoji ? "bg-emerald-400/20 ring-1 ring-emerald-400/50" : ""
                            }`}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    )}
                    {open === "sheet" && (canReply || canUnsend) && (
                      <div className="flex gap-1.5">
                        {canReply && (
                          <button
                            type="button"
                            onClick={() => {
                              setPanel(null);
                              onReply!(m);
                            }}
                            className="flex min-h-10 items-center gap-1.5 rounded-full border border-line-strong bg-card-2 px-4 text-sm font-semibold text-ink-2 hover:bg-card-3"
                          >
                            <ReplyIcon className="h-4 w-4" /> Reply
                          </button>
                        )}
                        {canUnsend && (
                          <button
                            type="button"
                            onClick={() => setPanel({ id: m.id, mode: "unsend" })}
                            className="min-h-10 rounded-full bg-rose-500/15 px-4 text-sm font-semibold text-rose-300 ring-1 ring-rose-500/30 hover:bg-rose-500/25"
                          >
                            Unsend
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {open === "unsend" && (
                  <div className="mt-1 flex flex-wrap items-center justify-end gap-2 rounded-xl border border-line-strong bg-card-2 p-2 text-sm">
                    <span className="px-1 text-ink-2">Unsend for everyone?</span>
                    <button type="button" onClick={() => setPanel(null)} className="min-h-10 rounded-lg px-3 font-semibold text-ink-2 hover:bg-card-3">
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
      {photo && <MediaViewer url={photo} onClose={() => setPhoto(null)} />}
    </div>
  );
}
