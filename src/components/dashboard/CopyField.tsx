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
      className="group flex w-full items-center gap-2 rounded-xl border border-dashed border-emerald-300 bg-emerald-50/60 px-3 py-2.5 text-left transition-colors hover:border-emerald-500 hover:bg-emerald-50"
    >
      <span className="min-w-0 flex-1 truncate font-mono text-xs text-emerald-900">{value}</span>
      <span
        className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold ${copied ? "bg-emerald-600 text-white" : "bg-white text-emerald-700 ring-1 ring-emerald-200 group-hover:ring-emerald-400"}`}
        aria-live="polite"
      >
        {copied ? "Copied!" : "Copy"}
      </span>
    </button>
  );
}
