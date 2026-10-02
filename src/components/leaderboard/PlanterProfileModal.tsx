"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import type { PublicProfile } from "@/lib/public-profile";
import { CloseIcon, CoinIcon, MedalIcon, TreeIcon } from "@/components/ui/icons";

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" });

type State = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; profile: PublicProfile };

/**
 * Public planter profile in a native modal <dialog> (focus trap, Escape and backdrop for free).
 * Mount it to open; `onClose` fires when the user dismisses it.
 */
export default function PlanterProfileModal({ userId, onClose }: { userId: string; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, setState] = useState<State>({ status: "loading" });
  const [achievementsOpen, setAchievementsOpen] = useState(false);
  const titleId = useId();
  const panelId = useId();

  // Open as a modal on mount. No close() in cleanup: unmounting removes the dialog from the top
  // layer anyway, and a queued "close" event would dismiss the re-opened dialog under StrictMode.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/planters/${encodeURIComponent(userId)}`, { signal: ctrl.signal })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        setState(res.ok ? { status: "ready", profile: body.profile } : { status: "error", message: body.error ?? "Couldn't load this profile." });
      })
      .catch((err) => {
        if (!ctrl.signal.aborted) setState({ status: "error", message: err instanceof Error ? err.message : "Network error." });
      });
    return () => ctrl.abort();
  }, [userId]);

  const profile = state.status === "ready" ? state.profile : null;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={onClose}
      // Clicking the backdrop (the dialog element itself, outside the panel) closes it.
      onClick={(e) => e.target === e.currentTarget && dialogRef.current?.close()}
      className="m-auto max-h-[92vh] w-[calc(100%-1.5rem)] max-w-lg overflow-hidden rounded-3xl bg-transparent p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/60 backdrop:backdrop-blur-sm open:animate-[profile-in_200ms_ease-out]"
    >
      <div className="flex max-h-[92vh] flex-col bg-cream-50">
        {/* Header band */}
        <div className="relative bg-gradient-to-br from-emerald-800 to-emerald-950 px-5 pb-5 pt-6 text-white sm:px-6">
          <button
            onClick={() => dialogRef.current?.close()}
            aria-label="Close profile"
            className="absolute right-3 top-3 rounded-lg p-1.5 text-emerald-100/80 hover:bg-white/10 hover:text-white"
          >
            <CloseIcon className="h-5 w-5" />
          </button>

          {profile ? (
            <div className="flex items-center gap-4">
              {profile.image ? (
                // eslint-disable-next-line @next/next/no-img-element -- uploaded avatar or OAuth photo
                <img src={profile.image} alt="" className="h-20 w-20 shrink-0 rounded-2xl object-cover ring-4 ring-white/15" />
              ) : (
                <span className="grid h-20 w-20 shrink-0 place-items-center rounded-2xl bg-emerald-600 text-3xl font-bold ring-4 ring-white/15">
                  {profile.name.slice(0, 1).toUpperCase()}
                </span>
              )}
              <div className="min-w-0">
                <h2 id={titleId} className="truncate text-xl font-bold">
                  {profile.name}
                </h2>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                  <span className="rounded-full bg-gradient-to-br from-amber-300 to-amber-500 px-2 py-0.5 text-xs font-extrabold text-amber-950">
                    Lv {profile.level}
                  </span>
                  <span className="text-emerald-100">{profile.title}</span>
                </p>
                {profile.city && (
                  <p className="mt-1 truncate text-xs text-emerald-200/80">
                    {profile.city}, {profile.province}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-4" aria-busy={state.status === "loading"}>
              <span className="h-20 w-20 shrink-0 animate-pulse rounded-2xl bg-white/10" />
              <div className="flex-1 space-y-2">
                <h2 id={titleId} className="sr-only">
                  Planter profile
                </h2>
                <span className="block h-5 w-40 animate-pulse rounded bg-white/10" />
                <span className="block h-4 w-24 animate-pulse rounded bg-white/10" />
              </div>
            </div>
          )}

          {profile && (
            <dl className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-white/10 px-3 py-2.5 ring-1 ring-white/10">
                <dt className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-emerald-200">
                  <TreeIcon className="h-3.5 w-3.5" /> Trees planted
                </dt>
                <dd className="text-2xl font-bold">{profile.totalPlants.toLocaleString("en-PH")}</dd>
              </div>
              <div className="rounded-xl bg-white/10 px-3 py-2.5 ring-1 ring-white/10">
                <dt className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-emerald-200">
                  <CoinIcon className="h-3.5 w-3.5" /> Current points
                </dt>
                <dd className="text-2xl font-bold">{profile.points.toLocaleString("en-PH")}</dd>
              </div>
            </dl>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 space-y-5 overflow-y-auto p-5 sm:p-6">
          {state.status === "error" && (
            <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
              {state.message}
            </p>
          )}

          {state.status === "loading" && (
            <div className="grid grid-cols-3 gap-2" aria-label="Loading">
              {Array.from({ length: 6 }, (_, i) => (
                <span key={i} className="aspect-square animate-pulse rounded-xl bg-slate-200/70" />
              ))}
            </div>
          )}

          {profile && (
            <>
              <section aria-label="Proof gallery">
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Proof gallery {profile.totalProofs > 0 && `· ${profile.totalProofs}`}
                </h3>
                {profile.proofs.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500">
                    No approved plantings yet.
                  </p>
                ) : (
                  <ul className="grid max-h-64 grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-4">
                    {profile.proofs.map((p) => {
                      const acquired = fmtDate(p.approvedAt ?? p.submittedAt);
                      const caption = `${p.plantCount} ${p.plantType} · acquired ${acquired}`;
                      return (
                        <li key={p.id}>
                          <a
                            href={p.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={caption}
                            className="group relative block aspect-square overflow-hidden rounded-xl bg-slate-200 ring-1 ring-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                          >
                            {p.mediaType.startsWith("video/") ? (
                              <>
                                <video src={p.url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                                <span className="absolute inset-0 grid place-items-center bg-slate-950/25 text-2xl text-white" aria-hidden>
                                  ▶
                                </span>
                              </>
                            ) : (
                              // eslint-disable-next-line @next/next/no-img-element -- auth-gated proof media
                              <img src={p.url} alt={caption} loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                            )}
                            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/75 to-transparent px-1.5 pb-1 pt-5 text-[10px] font-medium leading-tight text-white">
                              <span className="block truncate">{p.plantType}</span>
                              <span className="block truncate text-white/80">{acquired}</span>
                            </span>
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white">
                <h3>
                  <button
                    type="button"
                    onClick={() => setAchievementsOpen((o) => !o)}
                    aria-expanded={achievementsOpen}
                    aria-controls={panelId}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50"
                  >
                    <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                      <MedalIcon className="h-4 w-4 text-amber-600" />
                      Achievements
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 ring-1 ring-emerald-200">
                        {profile.achievements.length}
                      </span>
                    </span>
                    <svg
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      aria-hidden
                      className={`h-5 w-5 text-slate-400 transition-transform duration-300 ${achievementsOpen ? "rotate-180" : ""}`}
                    >
                      <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                    </svg>
                  </button>
                </h3>
                {/* Collapsed by default; grid-rows 0fr → 1fr animates to the content's natural height. */}
                <div
                  id={panelId}
                  role="region"
                  aria-label="Achievements"
                  inert={!achievementsOpen}
                  className={`grid transition-[grid-template-rows] duration-300 ease-out ${achievementsOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
                >
                  <div className="overflow-hidden">
                    {profile.achievements.length === 0 ? (
                      <p className="border-t border-slate-100 px-4 py-4 text-sm text-slate-500">No badges unlocked yet.</p>
                    ) : (
                      <ul className="grid gap-2 border-t border-slate-100 p-3 sm:grid-cols-2">
                        {profile.achievements.map((a) => (
                          <li key={a.key} className="flex items-start gap-3 rounded-xl bg-cream-50 p-2.5 ring-1 ring-slate-100">
                            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-xl shadow-sm" aria-hidden>
                              {a.icon}
                            </span>
                            <span className="min-w-0">
                              <span className="block text-sm font-semibold text-slate-900">{a.name}</span>
                              <span className="block text-xs text-slate-500">{a.description}</span>
                              <span className="block text-[11px] font-medium text-amber-700">Acquired on {fmtDate(a.unlockedAt)}</span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </section>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-4">
                <p className="text-xs text-slate-400">Planting since {fmtDate(profile.memberSince)}</p>
                <Link
                  href={`/planters/${profile.id}`}
                  className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800"
                >
                  View full profile →
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </dialog>
  );
}
