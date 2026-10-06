"use client";

import { useEffect, useState } from "react";
import type { FriendState } from "@/lib/friends";
import { ClockIcon, UserCheckIcon, UserPlusIcon } from "@/components/ui/icons";

const base =
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 font-semibold transition-colors disabled:opacity-60";
const SIZES = { sm: "min-h-10 text-xs sm:text-sm", lg: "min-h-11 px-4 text-sm" };
const LOOKS = {
  // "Add Friend" and "Accept Request" are the actions to see first: solid green.
  primary: "bg-emerald-400 text-emerald-950 hover:bg-emerald-300",
  ghost: "border border-emerald-400/40 bg-emerald-400/10 text-emerald-200 hover:bg-emerald-400/20",
  muted: "border border-line-strong bg-card-2 text-ink-2 hover:bg-card-3",
  danger: "border border-rose-400/40 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20",
};

/**
 * Add Friend → Request Sent (tap to cancel) · Accept Request / Decline · Friends (tap, then Unfriend).
 * `onChange` reports the new state, e.g. so a list can drop an answered request.
 */
export default function FriendButton({
  userId,
  initial,
  onChange,
  size = "sm",
  stretch = false,
}: {
  userId: string;
  initial: FriendState;
  onChange?: (state: FriendState) => void;
  /** "lg" on profiles: a full 44px button. */
  size?: keyof typeof SIZES;
  /** Fill the available width (e.g. sharing a row with Message on a phone). */
  stretch?: boolean;
}) {
  const cls = (look: keyof typeof LOOKS) => `${base} ${SIZES[size]} ${LOOKS[look]} ${stretch ? "flex-1" : ""}`;
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
    <div className={`flex flex-col items-end gap-1 ${stretch ? "min-w-0 flex-1" : "shrink-0"}`}>
      <div className={`flex gap-2 ${stretch ? "w-full" : ""}`}>
        {state === "NONE" && (
          <button type="button" disabled={busy} onClick={() => send("POST")} className={cls("primary")}>
            <UserPlusIcon className="h-4 w-4 shrink-0" /> Add Friend
          </button>
        )}
        {state === "REQUESTED" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => send("DELETE")}
            className={cls("muted")}
            title="Tap to cancel the request"
            aria-label="Request sent. Tap to cancel the request"
          >
            <ClockIcon className="h-4 w-4 shrink-0" /> Request Sent
          </button>
        )}
        {state === "INCOMING" && (
          <>
            <button type="button" disabled={busy} onClick={() => send("POST")} className={cls("primary")}>
              <UserPlusIcon className="h-4 w-4 shrink-0" /> Accept Request
            </button>
            <button type="button" disabled={busy} onClick={() => send("DELETE")} className={cls("muted")}>
              Decline
            </button>
          </>
        )}
        {state === "FRIENDS" &&
          (confirmUnfriend ? (
            <button type="button" disabled={busy} onClick={() => send("DELETE")} className={cls("danger")}>
              Unfriend
            </button>
          ) : (
            <button type="button" onClick={() => setConfirmUnfriend(true)} className={cls("ghost")} aria-label="Friends. Tap for options">
              <UserCheckIcon className="h-4 w-4 shrink-0" /> Friends
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
