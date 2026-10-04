"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import GrowingTreeCelebration from "./GrowingTreeCelebration";

export type Celebration = {
  questId: string;
  points: number;
  plantCount: number;
  plantType: string;
};

/** Plays the growing-tree animation once for each newly approved quest. */
export default function CelebrationGate({ celebrations, balance }: { celebrations: Celebration[]; balance: number }) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const current = celebrations[index];
  if (!current) return null;
  // `balance` already includes every queued quest; take off the ones still to be celebrated.
  const balanceAfter = balance - celebrations.slice(index + 1).reduce((sum, c) => sum + c.points, 0);

  async function handleContinue() {
    const next = index + 1;
    setIndex(next);
    await fetch(`/api/quests/${current.questId}/celebrate`, { method: "POST" }).catch(() => {});
    if (next >= celebrations.length) router.refresh();
  }

  return (
    <GrowingTreeCelebration
      key={current.questId}
      points={current.points}
      balanceAfter={balanceAfter}
      plantCount={current.plantCount}
      plantType={current.plantType}
      onContinue={handleContinue}
    />
  );
}
