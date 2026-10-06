"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { PlanterCard } from "@/lib/friends";
import FriendButton from "@/components/social/FriendButton";
import { CloseIcon, SearchIcon } from "@/components/ui/icons";

const MIN = 2;
const DEBOUNCE_MS = 250;
/** Always shown this close to the top of the page. */
const TOP_ZONE = 80;
/** Scrolling up at least this fast (px per ms) brings the bar back. */
const FAST_UP = 0.5;

/**
 * Planter search under the header, on every page. Hides while scrolling down and pops back on a
 * quick scroll up (or near the top); stays put while it's being used. Scroll handling is one
 * passive listener, throttled to animation frames, toggling a transform (GPU) — no layout work.
 */
export default function UserSearch() {
  const [hidden, setHidden] = useState(false);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  // Results and errors remember the query they belong to, so a stale answer is never shown as current.
  const [data, setData] = useState<{ q: string; results: PlanterCard[] } | null>(null);
  const [errorFor, setErrorFor] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const active = useRef(false);
  useEffect(() => {
    active.current = open;
  }, [open]);

  // Hide on scroll down, show on a fast scroll up.
  useEffect(() => {
    let lastY = window.scrollY;
    let lastT = performance.now();
    let frame = 0;
    const update = () => {
      frame = 0;
      const y = window.scrollY;
      const t = performance.now();
      const dy = y - lastY;
      const speed = -dy / Math.max(t - lastT, 1);
      if (y < TOP_ZONE || active.current) setHidden(false);
      else if (dy > 4) setHidden(true);
      else if (speed > FAST_UP) setHidden(false);
      lastY = y;
      lastT = t;
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  // Close on a tap outside or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Debounced search; a newer query cancels the older request.
  const q = query.trim();
  useEffect(() => {
    if (q.length < MIN) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        if (!res.ok) throw new Error();
        setData({ q, results: (await res.json()).results });
      } catch {
        if (!ctrl.signal.aborted) setErrorFor(q);
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, attempt]);

  const error = errorFor === q;
  const loading = q.length >= MIN && data?.q !== q && !error;
  // While a new query loads, the previous results stay (dimmed) instead of flashing empty.
  const results = data?.results ?? null;

  const showPanel = open && q.length > 0;

  return (
    <div
      ref={root}
      className={`sticky top-16 z-[990] border-b border-line/70 bg-canvas transition-[transform,opacity] duration-200 ease-out lg:bg-canvas/80 lg:backdrop-blur-md ${
        hidden ? "pointer-events-none -translate-y-full opacity-0" : ""
      }`}
    >
      <div className="relative mx-auto max-w-3xl px-4 py-2 sm:px-6">
        <label className="flex h-11 items-center gap-2 rounded-xl border border-line-strong bg-card-2 px-3 focus-within:border-emerald-400/60">
          <SearchIcon className="h-5 w-5 shrink-0 text-ink-3" />
          <span className="sr-only">Search planters</span>
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => {
              // Search again on reopening: friend states or blocks may have changed since.
              if (!open) setAttempt((n) => n + 1);
              setOpen(true);
            }}
            placeholder="Search planters by name"
            autoComplete="off"
            enterKeyHint="search"
            className="h-full min-h-0 min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-4 [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setOpen(false);
              }}
              aria-label="Clear search"
              className="-mr-1.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg text-ink-3 hover:bg-card-3 hover:text-ink"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          )}
        </label>

        {showPanel && (
          <div className="absolute inset-x-4 top-full z-10 mt-1 max-h-[60dvh] overflow-y-auto rounded-2xl border border-line-strong bg-card-2 shadow-2xl sm:inset-x-6">
            {q.length < MIN ? (
              <p className="px-4 py-3 text-sm text-ink-3">Type at least {MIN} letters.</p>
            ) : error ? (
              <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-ink-2">
                Couldn&apos;t search. Check your connection.
                <button
                  type="button"
                  onClick={() => {
                    setErrorFor(null);
                    setAttempt((n) => n + 1);
                  }} className="min-h-10 rounded-lg px-3 font-semibold text-emerald-300 hover:bg-card-3">
                  Try Again
                </button>
              </div>
            ) : loading && !results?.length ? (
              <ul aria-label="Searching" className="divide-y divide-line motion-safe:animate-pulse">
                {[0, 1, 2].map((i) => (
                  <li key={i} className="flex items-center gap-3 px-4 py-3">
                    <span className="h-10 w-10 shrink-0 rounded-full bg-card-3" />
                    <span className="flex-1 space-y-2">
                      <span className="block h-3 w-2/5 rounded bg-card-3" />
                      <span className="block h-2.5 w-1/3 rounded bg-card-3" />
                    </span>
                  </li>
                ))}
              </ul>
            ) : !loading && results?.length === 0 ? (
              <p className="px-4 py-3 text-sm text-ink-3">No planters named “{q}”.</p>
            ) : (
              <ul className={`divide-y divide-line ${loading ? "opacity-60" : ""}`}>
                {results?.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                    <Link
                      href={`/planters/${p.id}`}
                      onClick={() => {
                        setOpen(false);
                        setQuery("");
                      }}
                      className="flex min-w-0 flex-1 items-center gap-3 rounded-lg py-1 hover:text-emerald-200">
                      <Avatar card={p} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-ink">
                          <Highlight text={p.name} query={q} />
                        </span>
                        <span className="block truncate text-xs text-ink-3">
                          Lv {p.level}
                          {p.city && ` · ${p.city}`}
                        </span>
                      </span>
                    </Link>
                    <FriendButton key={`${p.id}-${p.state}`} userId={p.id} initial={p.state} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** `text` with the first case-insensitive match of `query` highlighted ("gab" in "Ma. Gabby"). */
function Highlight({ text, query }: { text: string; query: string }) {
  const at = query ? text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase()) : -1;
  if (at < 0) return text;
  return (
    <>
      {text.slice(0, at)}
      <mark className="rounded-sm bg-emerald-400/20 text-emerald-200">{text.slice(at, at + query.length)}</mark>
      {text.slice(at + query.length)}
    </>
  );
}

export function Avatar({ card, size = "h-10 w-10" }: { card: { name: string; image: string | null }; size?: string }) {
  return card.image ? (
    // eslint-disable-next-line @next/next/no-img-element -- uploaded avatar or OAuth photo
    <img src={card.image} alt="" loading="lazy" className={`${size} shrink-0 rounded-full object-cover`} />
  ) : (
    <span className={`${size} grid shrink-0 place-items-center rounded-full bg-emerald-400 text-sm font-bold text-emerald-950`}>
      {card.name.slice(0, 1).toUpperCase()}
    </span>
  );
}
