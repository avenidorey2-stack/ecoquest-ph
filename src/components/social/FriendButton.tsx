"use client";

import { useEffect, useState } from "react";
import type { FriendState } from "@/lib/friends";
import { UserCheckIcon, UserPlusIcon } from "@/components/ui/icons";

const base =
  "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-semibold transition-colors disabled:opacity-60 sm:text-sm";
const styles = {
  primary: `${base} bg-emerald-400 text-emerald-950 hover:bg-emerald-300`,
  ghost: `${base} border border-emerald-400/40 bg-emerald-400/10 text-emerald-200 hover:bg-emerald-400/20`,
  muted: `${base} border border-line-strong bg-card-2 text-ink-2 hover:bg-card-3`,
  danger: `${base} border border-rose-400/40 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20`,
};

/**
 * Add Friend → Requested (tap to cancel) · Accept / Decline · Friends (tap, then Unfriend).
 * `onChange` reports the new state, e.g. so a list can drop an answered request.
 */
export default function FriendButton({
  userId,
  initial,
  onChange,
}: {
  userId: string;
  initial: FriendState;
  onChange?: (state: FriendState) => void;
}) {
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmUnfriend, setConfirmUnfriend] = useState(false);

  // The Unfriend step closes by itself, so a stray tap can't linger as a trap.
  useEffect(() => {
    if (!confirmUnfriend) return;
    const t = setTimeout(() => setConfirmUnfriend(false), 4000);
    return () => clearTimeout(t);
  }, [confirmUnfriend]);

  if (state === "SELF") return null;

  async function send(method: "POST" | "DELETE") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/friends/${encodeURIComponent(userId)}`, { method });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      setState(data.state);
      setConfirmUnfriend(false);
      onChange?.(data.state);
    } catch (e) {
      setError(e instanceof Error && e.message !== "Failed to fetch" ? e.message : "No connection. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <div className="flex gap-2">
        {state === "NONE" && (
          <button type="button" disabled={busy} onClick={() => send("POST")} className={styles.ghost}>
            <UserPlusIcon className="h-4 w-4" /> Add Friend
          </button>
        )}
        {state === "REQUESTED" && (
          <button type="button" disabled={busy} onClick={() => send("DELETE")} className={styles.muted} aria-label="Requested. Tap to cancel the request">
            Requested
          </button>
        )}
        {state === "INCOMING" && (
          <>
            <button type="button" disabled={busy} onClick={() => send("POST")} className={styles.primary}>
              Accept
            </button>
            <button type="button" disabled={busy} onClick={() => send("DELETE")} className={styles.muted}>
              Decline
            </button>
          </>
        )}
        {state === "FRIENDS" &&
          (confirmUnfriend ? (
            <button type="button" disabled={busy} onClick={() => send("DELETE")} className={styles.danger}>
              Unfriend
            </button>
          ) : (
            <button type="button" onClick={() => setConfirmUnfriend(true)} className={styles.ghost} aria-label="Friends. Tap for options">
              <UserCheckIcon className="h-4 w-4" /> Friends
            </button>
          ))}
      </div>
      {error && (
        <p role="alert" className="text-[11px] text-rose-300">
          {error}
        </p>
      )}
    </div>
  );
}
