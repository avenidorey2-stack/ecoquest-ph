"use client";

import { useState } from "react";

/** Read-only value with a click-to-copy button (falls back to a prompt if clipboard is blocked). */
export default function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt(label, value);
    }
  }

  return (
    <button
      onClick={copy}
      title="Click to copy"
      className="group flex w-full items-center gap-2 rounded-xl border border-dashed border-emerald-400/40 bg-emerald-400/[0.06] px-3 py-3 text-left transition-colors hover:border-emerald-500 hover:bg-emerald-400/10"
    >
      <span className="min-w-0 flex-1 truncate font-mono text-xs text-emerald-200">{value}</span>
      <span
        className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold ${copied ? "bg-emerald-400 text-emerald-950" : "bg-card text-emerald-400 ring-1 ring-emerald-400/20 group-hover:ring-emerald-400"}`}
        aria-live="polite"
      >
        {copied ? "Copied!" : "Copy"}
      </span>
    </button>
  );
}
