"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { CityHit } from "@/lib/psgc";
import { CloseIcon, SearchIcon } from "@/components/ui/icons";

const DEBOUNCE_MS = 200;

/**
 * Search box over the admin slot map: type a city or municipality, pick it, and the map zooms
 * to its outline. Arrow keys move through the suggestions; Enter picks; Escape closes.
 */
export default function PlaceSearch({ onPick, busy }: { onPick: (hit: CityHit) => void; busy?: boolean }) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<{ q: string; results: CityHit[] } | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();
  const q = query.trim();

  useEffect(() => {
    if (q.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/admin/geo/places?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((data) => {
          setHits({ q, results: data.results });
          setActive(0);
        })
        .catch(() => {});
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const results = q.length >= 2 && hits?.q === q ? hits.results : null;
  const showList = open && q.length >= 2 && results !== null;

  function choose(hit: CityHit) {
    setQuery(hit.name);
    setOpen(false);
    onPick(hit);
  }

  return (
    // Stops map clicks/drags from starting under the box (Leaflet listens on the map container).
    <div ref={root} className="w-full max-w-sm" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      <label className="flex h-11 items-center gap-2 rounded-xl border border-line-strong bg-card-2/95 px-3 shadow-2xl backdrop-blur focus-within:border-emerald-400/60">
        <SearchIcon className={`h-5 w-5 shrink-0 ${busy ? "animate-pulse text-emerald-300" : "text-ink-3"}`} />
        <span className="sr-only">Find a city or municipality</span>
        <input
          type="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && results?.length ? `${listId}-${active}` : undefined}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (!showList || !results?.length) return;
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              const step = e.key === "ArrowDown" ? 1 : -1;
              setActive((i) => (i + step + results.length) % results.length);
            } else if (e.key === "Enter") {
              e.preventDefault();
              choose(results[active]);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder="Find a city or municipality"
          autoComplete="off"
          enterKeyHint="search"
          className="h-full min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink-4 sm:text-sm [&::-webkit-search-cancel-button]:hidden"
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

      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="mt-1 max-h-72 overflow-y-auto rounded-2xl border border-line-strong bg-card-2 p-1 shadow-2xl"
        >
          {results.length === 0 ? (
            <li className="px-3 py-2.5 text-sm text-ink-3">No city or municipality named “{q}”.</li>
          ) : (
            results.map((hit, i) => (
              <li
                key={hit.code}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onPointerEnter={() => setActive(i)}
                onClick={() => choose(hit)}
                className={`flex min-h-11 cursor-pointer flex-col justify-center rounded-xl px-3 py-1.5 ${i === active ? "bg-card-3" : ""}`}
              >
                <span className="text-sm font-semibold text-ink">{hit.name}</span>
                <span className="text-xs text-ink-3">{hit.province}</span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
