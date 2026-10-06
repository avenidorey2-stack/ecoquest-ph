"use client";

import { useSyncExternalStore } from "react";
import { activeLabel, isActiveNow } from "@/lib/active-status";
import { Avatar } from "@/components/social/UserSearch";

const subscribe = (tick: () => void) => {
  const id = setInterval(tick, 15_000);
  return () => clearInterval(id);
};
const thisMinute = () => Math.floor(Date.now() / 60_000);

/**
 * The current time, to the minute, re-rendering as it changes so "Active 5m ago" stays current.
 * Null while rendering on the server and hydrating, so server and browser clocks never disagree.
 */
function useMinuteClock() {
  const minute = useSyncExternalStore(subscribe, thisMinute, () => null);
  return minute === null ? null : minute * 60_000;
}

/** A planter's photo with a green dot while they're active now. */
export function PresenceAvatar({ person, size = "h-10 w-10" }: { person: { name: string; image: string | null; activeAt: string | null }; size?: string }) {
  const now = useMinuteClock();
  return (
    <span className="relative inline-flex shrink-0">
      <Avatar card={person} size={size} />
      {now !== null && isActiveNow(person.activeAt, now) && (
        <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full bg-emerald-400 ring-[3px] ring-card" aria-hidden />
      )}
    </span>
  );
}

/** "Active Now" (green) or "Active 2h ago"; nothing if unknown, hidden or over a week ago. */
export function ActiveLabel({ activeAt, className = "" }: { activeAt: string | null; className?: string }) {
  const now = useMinuteClock();
  const label = now === null ? null : activeLabel(activeAt, now);
  if (!label) return null;
  return (
    <span className={`${label === "Active Now" ? "text-emerald-300" : "text-ink-3"} ${className}`}>
      {label}
    </span>
  );
}
