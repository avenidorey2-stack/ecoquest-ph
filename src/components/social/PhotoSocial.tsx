"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PhotoComment, PhotoThread } from "@/lib/photo-social";
import { timeAgo } from "@/lib/format";
import { ChatIcon, CloseIcon, HeartIcon, SendIcon, TrashIcon } from "@/components/ui/icons";
import { Avatar } from "@/components/social/UserSearch";

export type Reactions = { likeCount: number; commentCount: number; likedByMe: boolean };

const COMMENT_MAX = 500;
const bar = "inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors";

/**
 * Like button and comments for one planting photo, in the full-screen viewer. The like updates at
 * once (rolled back if the request fails); comments load when the panel opens. `onChange` reports
 * new counts so the gallery behind can update its badges.
 */
export default function PhotoSocial({
  photoId,
  initial,
  commentsOff = false,
  onChange,
}: {
  photoId: string;
  initial: Reactions;
  /** The owner turned comments off: no Comments button unless there are old ones to see (owner). */
  commentsOff?: boolean;
  onChange?: (r: Reactions) => void;
}) {
  const [r, setR] = useState(initial);
  const [panel, setPanel] = useState(false);
  const report = useRef(onChange);
  useEffect(() => {
    report.current = onChange;
  }, [onChange]);
  const update = useCallback((next: Reactions) => {
    setR(next);
    report.current?.(next);
  }, []);

  async function toggleLike() {
    const before = r;
    const liked = !r.likedByMe;
    update({ ...r, likedByMe: liked, likeCount: Math.max(0, r.likeCount + (liked ? 1 : -1)) });
    try {
      const res = await fetch(`/api/photos/${encodeURIComponent(photoId)}/like`, { method: liked ? "POST" : "DELETE" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      update({ ...before, likedByMe: data.likedByMe, likeCount: data.likeCount });
    } catch {
      update(before);
    }
  }

  return (
    <>
      <div className="flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={toggleLike}
          aria-pressed={r.likedByMe}
          aria-label={r.likedByMe ? "Unlike" : "Like"}
          className={`${bar} ${r.likedByMe ? "bg-rose-500/20 text-rose-200 ring-1 ring-rose-400/40" : "bg-white/10 text-white hover:bg-white/20"}`}
        >
          <HeartIcon filled={r.likedByMe} className={`h-5 w-5 ${r.likedByMe ? "text-rose-400" : ""}`} />
          {r.likeCount.toLocaleString("en-PH")}
        </button>
        {!(commentsOff && r.commentCount === 0) && (
          <button type="button" onClick={() => setPanel(true)} aria-label="Comments" className={`${bar} bg-white/10 text-white hover:bg-white/20`}>
            <ChatIcon className="h-5 w-5" />
            {r.commentCount.toLocaleString("en-PH")}
          </button>
        )}
      </div>
      {commentsOff && (
        <p className="mt-1 text-center text-xs text-white/60">Comments are turned off for this photo.</p>
      )}
      {panel && (
        <CommentsPanel
          photoId={photoId}
          onClose={() => setPanel(false)}
          onCount={(commentCount) => update({ ...r, commentCount })}
        />
      )}
    </>
  );
}

function CommentsPanel({ photoId, onClose, onCount }: { photoId: string; onClose: () => void; onCount: (n: number) => void }) {
  const [thread, setThread] = useState<PhotoThread | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<PhotoComment | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const countRef = useRef(onCount);
  useEffect(() => {
    countRef.current = onCount;
  }, [onCount]);

  useEffect(() => {
    let live = true;
    fetch(`/api/photos/${encodeURIComponent(photoId)}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(res.status === 404 ? "This photo isn't available to you anymore." : (data.error ?? "load"));
        if (!live) return;
        setThread(data);
        setFailed(null);
        countRef.current(data.commentCount);
      })
      .catch((e: Error) => live && setFailed(e.message === "load" || e.message === "Failed to fetch" ? "Couldn't load comments. Check your connection." : e.message));
    return () => {
      live = false;
    };
  }, [photoId, attempt]);

  const reload = () => setAttempt((n) => n + 1);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch(`/api/photos/${encodeURIComponent(photoId)}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, parentId: replyTo?.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't post your comment.");
      setText("");
      setReplyTo(null);
      reload();
    } catch (err) {
      setSendError(err instanceof Error && err.message !== "Failed to fetch" ? err.message : "No connection. Try again.");
    } finally {
      setSending(false);
    }
  }

  async function remove(c: PhotoComment) {
    if (!window.confirm(c.replies.length ? "Delete this comment and its replies?" : "Delete this comment?")) return;
    const res = await fetch(`/api/comments/${encodeURIComponent(c.id)}`, { method: "DELETE" }).catch(() => null);
    if (res?.ok) reload();
  }

  const now = new Date();
  const item = (c: PhotoComment, reply = false) => (
    <li key={c.id} className={reply ? "mt-3" : ""}>
      <div className="flex gap-2.5">
        <Link href={`/planters/${c.author.id}`} className="shrink-0">
          <Avatar card={c.author} size={reply ? "h-7 w-7" : "h-9 w-9"} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="rounded-2xl bg-card-3/70 px-3 py-2">
            <Link href={`/planters/${c.author.id}`} className="text-xs font-semibold text-ink hover:text-emerald-200">
              {c.author.name}
            </Link>
            <p className="whitespace-pre-wrap break-words text-sm text-ink-2">{c.body}</p>
          </div>
          <div className="mt-0.5 flex items-center gap-1 pl-2 text-[11px] text-ink-3">
            <time dateTime={c.createdAt}>{timeAgo(new Date(c.createdAt), now)}</time>
            <button
              type="button"
              onClick={() => {
                setReplyTo(c);
                input.current?.focus();
              }}
              className="min-h-8 rounded px-2 font-semibold hover:text-emerald-200"
            >
              Reply
            </button>
            {c.canDelete && (
              <button type="button" onClick={() => remove(c)} aria-label="Delete comment" className="grid min-h-8 min-w-8 place-items-center rounded hover:text-rose-300">
                <TrashIcon className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {c.replies.length > 0 && <ul className="border-l border-line pl-3">{c.replies.map((x) => item(x, true))}</ul>}
        </div>
      </div>
    </li>
  );

  return (
    <div
      className="absolute inset-0 z-20 flex flex-col justify-end bg-black/50"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          e.preventDefault();
          onClose();
        }
      }}
    >
      <section
        aria-label="Comments"
        className="mx-auto flex max-h-[78dvh] w-full max-w-lg flex-col rounded-t-3xl text-left border border-line-strong bg-card-2 text-ink shadow-2xl sm:mb-4 sm:rounded-3xl"
      >
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
          <h2 className="text-sm font-semibold">Comments {thread ? `(${thread.commentCount})` : ""}</h2>
          <button type="button" onClick={onClose} aria-label="Close comments" className="grid h-10 w-10 place-items-center rounded-full text-ink-3 hover:bg-card-3 hover:text-ink">
            <CloseIcon className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          {failed ? (
            <div className="space-y-3 py-6 text-center text-sm text-ink-3">
              <p>{failed}</p>
              <button type="button" onClick={reload} className="min-h-10 rounded-xl px-4 font-semibold text-emerald-300 ring-1 ring-emerald-400/40 hover:bg-emerald-400/10">
                Try Again
              </button>
            </div>
          ) : !thread ? (
            <ul aria-label="Loading comments" className="space-y-4 motion-safe:animate-pulse">
              {[0, 1, 2].map((i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="h-9 w-9 shrink-0 rounded-full bg-card-3" />
                  <span className="h-14 flex-1 rounded-2xl bg-card-3" />
                </li>
              ))}
            </ul>
          ) : thread.comments.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-3">No comments yet. Be the first to say something nice!</p>
          ) : (
            <ul className="space-y-4">{thread.comments.map((c) => item(c))}</ul>
          )}
        </div>

        {thread?.commentsOff ? (
          <p className="border-t border-line px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 text-center text-xs text-ink-3">
            Comments are turned off. Turn them back on in Settings → Privacy.
          </p>
        ) : (
        <form onSubmit={send} className="border-t border-line px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
          {replyTo && (
            <p className="mb-2 flex items-center justify-between rounded-lg bg-card-3/70 px-3 py-1.5 text-xs text-ink-2">
              Replying to {replyTo.author.name}
              <button type="button" onClick={() => setReplyTo(null)} aria-label="Cancel reply" className="grid h-8 w-8 place-items-center rounded text-ink-3 hover:text-ink">
                <CloseIcon className="h-4 w-4" />
              </button>
            </p>
          )}
          <div className="flex items-end gap-2">
            <label className="sr-only" htmlFor={`comment-${photoId}`}>
              Write a comment
            </label>
            <textarea
              id={`comment-${photoId}`}
              ref={input}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) send(e);
              }}
              rows={1}
              maxLength={COMMENT_MAX}
              placeholder={replyTo ? "Write a reply…" : "Write a comment…"}
              className="max-h-28 min-h-11 flex-1 resize-none rounded-xl border border-line-strong bg-card px-3 py-2.5 text-sm text-ink outline-none focus:border-emerald-400/60"
            />
            <button
              type="submit"
              disabled={!text.trim() || sending}
              aria-label="Send"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-400 text-emerald-950 hover:bg-emerald-300 disabled:opacity-40"
            >
              <SendIcon className="h-5 w-5" />
            </button>
          </div>
          {sendError && (
            <p role="alert" className="mt-1.5 text-xs text-rose-300">
              {sendError}
            </p>
          )}
        </form>
        )}
      </section>
    </div>
  );
}
