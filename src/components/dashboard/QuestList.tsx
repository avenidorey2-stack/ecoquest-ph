"use client";

import Link from "next/link";
import { useId, useState } from "react";
import type { CompletedTask, DashboardQuest } from "@/lib/dashboard";
import QuestProofToggle from "./QuestProofToggle";

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" });

/** Progress bar: verified part (emerald) + submitted-but-unreviewed part (amber). */
function QuestProgress({ value, pending = 0, max }: { value: number; pending?: number; max: number }) {
  const pct = (n: number) => (max > 0 ? Math.max(0, Math.min(100, (n / max) * 100)) : 0);
  const done = pct(value);
  const waiting = Math.min(100 - done, pct(pending));
  return (
    <div
      className="flex h-2 w-full overflow-hidden rounded-full bg-card-2"
      role="progressbar"
      aria-valuenow={Math.min(value + pending, max)}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuetext={pending ? `${value} verified, ${pending} awaiting review, of ${max}` : `${value} of ${max}`}
    >
      <div className="eq-fill h-full bg-gradient-to-r from-emerald-500 to-lime-400 shadow-[0_0_10px_rgba(52,211,153,.5)] transition-[width] duration-700" style={{ width: `${done}%` }} />
      {waiting > 0 && (
        <div
          className="h-full bg-amber-400 bg-[repeating-linear-gradient(135deg,transparent_0_4px,rgba(255,255,255,.35)_4px_8px)] transition-[width] duration-700"
          style={{ width: `${waiting}%` }}
        />
      )}
    </div>
  );
}

/** Active quests (unfinished only) with a collapsible list of every completed task. */
export default function QuestList({
  quests,
  completed,
  completedTotal,
}: {
  quests: DashboardQuest[];
  completed: CompletedTask[];
  completedTotal: number;
}) {
  const [showCompleted, setShowCompleted] = useState(false);
  const panelId = useId();

  return (
    <div className="space-y-4">
      {quests.length === 0 ? (
        <p className="rounded-xl bg-emerald-400/10 p-4 text-center text-sm text-emerald-300">
          🎉 All caught up! Claim a slot on the map to start your next quest.
        </p>
      ) : (
        <ul className="space-y-4">
          {quests.map((q) => {
            return (
              <li key={q.id}>
                {/* Header: title + subtitle only — no fraction badge on any card. */}
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">
                    {q.href ? (
                      <Link href={q.href} className="hover:text-emerald-400">
                        {q.title}
                      </Link>
                    ) : (
                      q.title
                    )}
                  </p>
                  <p className="truncate text-xs text-ink-3" title={q.detail}>
                    {q.detail}
                  </p>
                </div>
                {/* Planting quest cards have no progress bar; milestones show a bar with "X of Y" text. */}
                {q.kind === "milestone" && (
                  <div className="mt-2 flex items-center gap-3">
                    <div className="flex-1">
                      <QuestProgress value={q.current} pending={q.pending} max={q.target} />
                    </div>
                    {q.progressLabel && (
                      <span className="shrink-0 text-[11px] font-semibold text-ink-2">{q.progressLabel}</span>
                    )}
                  </div>
                )}
                {q.uploadQuestId && <QuestProofToggle questId={q.uploadQuestId} context={q.proof} />}
              </li>
            );
          })}
        </ul>
      )}

      {completedTotal > 0 && (
        <div className="border-t border-line pt-3">
          <button
            type="button"
            onClick={() => setShowCompleted((s) => !s)}
            aria-expanded={showCompleted}
            aria-controls={panelId}
            className="flex min-h-11 w-full items-center justify-between rounded-lg px-2 text-left text-xs font-semibold text-emerald-300 hover:bg-emerald-400/10"
          >
            <span>
              ✓ Completed ({completedTotal.toLocaleString("en-PH")})
            </span>
            <svg
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden
              className={`h-4 w-4 transition-transform duration-300 ${showCompleted ? "rotate-180" : ""}`}
            >
              <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
            </svg>
          </button>
          {/* Hidden until clicked; grid-rows 0fr → 1fr animates to the list's natural height. */}
          <div
            id={panelId}
            role="region"
            aria-label="Completed tasks"
            inert={!showCompleted}
            className={`grid transition-[grid-template-rows] duration-300 ease-out ${showCompleted ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
          >
            <div className="overflow-hidden">
              <ul className="mt-2 max-h-72 space-y-1.5 overflow-y-auto pr-1">
                {completed.map((t) => (
                  <li key={t.id} className="flex items-start gap-2.5 rounded-lg bg-emerald-400/[0.06] px-2.5 py-2">
                    <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-emerald-400 text-[9px] font-bold text-emerald-950" aria-hidden>
                      ✓
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-ink">{t.title}</p>
                      <p className="truncate text-[11px] text-ink-3">{t.detail}</p>
                    </div>
                    {t.completedAt && (
                      <time dateTime={t.completedAt} className="shrink-0 text-[10px] text-ink-4">
                        {fmtDate(t.completedAt)}
                      </time>
                    )}
                  </li>
                ))}
              </ul>
              {completed.filter((t) => t.kind === "planting").length < completedTotal - completed.filter((t) => t.kind === "milestone").length && (
                <p className="mt-2 text-center text-[11px] text-ink-4">Showing your latest completed plantings.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
