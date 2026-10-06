"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ConversationRow } from "@/lib/messages";
import type { PlanterCard } from "@/lib/friends";
import { MESSAGES_READ_EVENT, useLiveEvent, useVisiblePoll } from "@/components/layout/live";
import { PushBanner } from "@/components/layout/PushControls";
import ChatList from "./ChatList";
import { ChatPane } from "./pane";

const POLL_MS = 30_000;

/**
 * The Messages screen. Phones: the chat list, and a chat opens full screen over it. Desktop:
 * like Messenger on a computer — the chats on the left and the open chat filling the right,
 * both fitted to the window under the app header.
 */
export default function Inbox({ initial, friends: initialFriends, children }: { initial: ConversationRow[]; friends: PlanterCard[]; children: React.ReactNode }) {
  const [rows, setRows] = useState(initial);
  const [friends, setFriends] = useState(initialFriends);
  const pathname = usePathname();
  const onList = pathname === "/messages";
  const activeId = onList ? undefined : decodeURIComponent(pathname.split("/")[2] ?? "");
  const box = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/messages", { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return;
    const data = await res.json();
    setRows(data.conversations);
    setFriends(data.friends);
  }, []);
  useLiveEvent("message", refresh);
  useVisiblePoll(refresh, POLL_MS);
  // A chat was read or a message sent: update the previews and unread dots now.
  useEffect(() => {
    window.addEventListener(MESSAGES_READ_EVENT, refresh);
    return () => window.removeEventListener(MESSAGES_READ_EVENT, refresh);
  }, [refresh]);

  // Desktop: fill the window below the app header (the page itself doesn't scroll).
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const desktop = window.matchMedia("(min-width: 1024px)");
    const fit = () => {
      el.style.height = desktop.matches ? `${Math.max(420, window.innerHeight - el.getBoundingClientRect().top - window.scrollY)}px` : "";
    };
    fit();
    window.addEventListener("resize", fit);
    desktop.addEventListener("change", fit);
    return () => {
      window.removeEventListener("resize", fit);
      desktop.removeEventListener("change", fit);
    };
  }, []);

  return (
    <ChatPane value>
      <div ref={box} className="flex w-full flex-1 lg:min-h-0 lg:flex-none lg:gap-4 lg:px-6 lg:py-4">
        <div className={`${onList ? "block" : "hidden"} mx-auto w-full max-w-2xl px-4 py-6 sm:px-6 lg:mx-0 lg:block lg:h-full lg:w-[22rem] lg:max-w-none lg:shrink-0 lg:p-0 xl:w-[24rem]`}>
          <section aria-label="Chats" className="eq-panel flex flex-col overflow-hidden rounded-2xl border border-line/80 bg-card pt-3 shadow-sm lg:h-full">
            <h2 className="px-4 pb-2 text-xl font-bold text-ink">Chats</h2>
            <PushBanner />
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <ChatList rows={rows} friends={friends} activeId={activeId} />
            </div>
          </section>
        </div>
        <div className={`${onList ? "hidden lg:flex" : "flex"} min-w-0 flex-1 flex-col lg:h-full`}>{children}</div>
      </div>
    </ChatPane>
  );
}
