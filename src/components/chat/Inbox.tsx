"use client";

import { useCallback, useState } from "react";
import type { ConversationRow } from "@/lib/messages";
import type { PlanterCard } from "@/lib/friends";
import { useLiveEvent, useVisiblePoll } from "@/components/layout/live";
import ChatList from "./ChatList";

const POLL_MS = 30_000;

/** Messages home: friends to start a chat with, then the chats (same list as the header panel). */
export default function Inbox({ initial, friends: initialFriends }: { initial: ConversationRow[]; friends: PlanterCard[] }) {
  const [rows, setRows] = useState(initial);
  const [friends, setFriends] = useState(initialFriends);
  const refresh = useCallback(async () => {
    const res = await fetch("/api/messages", { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return;
    const data = await res.json();
    setRows(data.conversations);
    setFriends(data.friends);
  }, []);
  useLiveEvent("message", refresh);
  useVisiblePoll(refresh, POLL_MS);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 text-ink sm:px-6 lg:py-8">
      <section aria-label="Chats" className="eq-panel overflow-hidden rounded-2xl border border-line/80 bg-card pt-3 shadow-sm">
        <h2 className="px-4 pb-2 text-xl font-bold text-ink">Chats</h2>
        <ChatList rows={rows} friends={friends} />
      </section>
    </div>
  );
}
