"use client";

import { useState } from "react";
import PlanterProfileModal from "./PlanterProfileModal";

/**
 * Transparent full-row button for a leaderboard entry (place inside a `relative` row):
 * clicking anywhere on the row — avatar, name or score — opens the planter's profile modal.
 */
export default function PlanterProfileTrigger({ userId, name }: { userId: string; name: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`View ${name}'s profile`}
        className="absolute inset-0 z-[1] cursor-pointer rounded-[inherit] transition-colors hover:bg-emerald-500/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500"
      />
      {open && <PlanterProfileModal userId={userId} onClose={() => setOpen(false)} />}
    </>
  );
}
