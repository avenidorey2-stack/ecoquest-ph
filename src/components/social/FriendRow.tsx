"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PlanterCard } from "@/lib/friends";
import FriendButton from "@/components/social/FriendButton";
import { Avatar } from "@/components/social/UserSearch";

/** A planter in a friends list; answering a request refreshes the lists (accepted → Friends). */
export default function FriendRow({ card }: { card: PlanterCard }) {
  const router = useRouter();
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <Link href={`/planters/${card.id}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg py-1 hover:text-emerald-200">
        <Avatar card={card} size="h-11 w-11" />
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-ink">{card.name}</span>
          <span className="block truncate text-xs text-ink-3">
            Lv {card.level}
            {card.city && ` · ${card.city}, ${card.province}`}
          </span>
        </span>
      </Link>
      <FriendButton userId={card.id} initial={card.state} onChange={() => router.refresh()} />
    </li>
  );
}
