"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Blocks a planter after a confirmation, then shows Settings (where blocked users can be unblocked). */
export default function BlockButton({ userId, name }: { userId: string; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function block() {
    const ok = window.confirm(
      `Block ${name}? You won't see each other in search, on profiles or in photos, and any friendship ends. You can unblock them in Settings.`,
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/blocks/${encodeURIComponent(userId)}`, { method: "POST" }).catch(() => null);
    if (res?.ok) {
      router.replace("/settings#blocked");
      return;
    }
    setBusy(false);
    setError("Couldn't block. Try again.");
  }

  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        onClick={block}
        disabled={busy}
        className="min-h-10 rounded-xl px-3 text-xs font-semibold text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-50"
      >
        {busy ? "Blocking…" : "Block"}
      </button>
      {error && (
        <span role="alert" className="text-[11px] text-rose-200">
          {error}
        </span>
      )}
    </span>
  );
}
