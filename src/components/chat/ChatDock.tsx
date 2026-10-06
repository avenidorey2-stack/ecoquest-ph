"use client";

import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Thread } from "@/lib/messages";
import { MESSAGES_READ_EVENT } from "@/components/layout/live";
import { Avatar } from "@/components/social/UserSearch";
import { CloseIcon } from "@/components/ui/icons";
import DirectChat from "./DirectChat";
import ChatSkeleton from "./ChatSkeleton";
import { ChatDockWindow } from "./pane";

/** Chat windows open side by side; more than this and the oldest is minimized to a bubble. */
const MAX_OPEN = 2;
const MAX_CHATS = 6;
const DESKTOP = "(min-width: 1024px)";

type DockChat = { id: string; minimized: boolean; person?: { name: string; image: string | null } };
type Dock = {
  /** Opens a pop-up chat with this planter. False when it can't (phones, or on the Messages screen). */
  open: (userId: string) => boolean;
};

const DockContext = createContext<Dock | null>(null);
/** The pop-up chat windows (desktop), if there are any here. */
export const useChatDock = () => useContext(DockContext);

/** One pop-up window: loads the chat, then it's a normal DirectChat in a small frame. */
function DockWindow({
  chat,
  update,
  close,
}: {
  chat: DockChat;
  update: (id: string, patch: Partial<DockChat>) => void;
  close: (id: string) => void;
}) {
  const [thread, setThread] = useState<Thread | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    fetch(`/api/messages/${encodeURIComponent(chat.id)}`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: Thread) => {
        if (!live) return;
        setThread(data);
        window.dispatchEvent(new Event(MESSAGES_READ_EVENT)); // opening it read the chat: update the badge
        update(chat.id, { person: { name: data.partner.name, image: data.partner.image } });
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per chat
  }, [chat.id]);

  const controls = useMemo(() => ({ minimize: () => update(chat.id, { minimized: true }), close: () => close(chat.id) }), [chat.id, update, close]);
  return (
    <ChatDockWindow value={controls}>
      <div className="eq-rise pointer-events-auto flex h-[min(455px,calc(100dvh-6rem))] w-[338px] flex-col overflow-hidden rounded-t-xl border border-b-0 border-line-strong bg-card shadow-[0_12px_40px_-8px_rgba(0,0,0,.7)]">
        {thread ? (
          <DirectChat key={thread.partner.id} initial={thread} />
        ) : failed ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-ink-3">
            <p>Couldn&apos;t open this chat.</p>
            <button type="button" onClick={controls.close} className="min-h-10 rounded-full px-4 font-semibold text-emerald-300 ring-1 ring-emerald-400/40 hover:bg-emerald-400/10">
              Close
            </button>
          </div>
        ) : (
          <ChatSkeleton />
        )}
      </div>
    </ChatDockWindow>
  );
}

/**
 * Facebook-style pop-up chats on computers: picking a chat from the header's Chats panel (or a
 * new message arriving) opens a small chat window at the bottom-right, so you can keep using the
 * page. Minimized chats become round photos on the right; up to two windows stay open. Phones
 * open the full-screen chat instead, and the Messages screen has its own chat pane.
 */
export default function ChatDockProvider({ children }: { children: React.ReactNode }) {
  const [chats, setChats] = useState<DockChat[]>([]);
  const pathname = usePathname();
  const onMessages = pathname === "/messages" || pathname.startsWith("/messages/");

  const open = useCallback(
    (userId: string) => {
      if (onMessages || !window.matchMedia(DESKTOP).matches) return false;
      setChats((cur) => {
        const existing = cur.find((c) => c.id === userId);
        let next: DockChat[] = [{ id: userId, minimized: false, person: existing?.person }, ...cur.filter((c) => c.id !== userId)];
        let openCount = 0;
        next = next.map((c) => (!c.minimized && ++openCount > MAX_OPEN ? { ...c, minimized: true } : c));
        return next.slice(0, MAX_CHATS);
      });
      return true;
    },
    [onMessages],
  );

  const update = useCallback((id: string, patch: Partial<DockChat>) => setChats((cur) => cur.map((c) => (c.id === id ? { ...c, ...patch } : c))), []);
  const close = useCallback((id: string) => setChats((cur) => cur.filter((c) => c.id !== id)), []);
  const dock = useMemo(() => ({ open }), [open]);
  const windows = chats.filter((c) => !c.minimized);
  const bubbles = chats.filter((c) => c.minimized);

  return (
    <DockContext value={dock}>
      {children}
      {!onMessages && chats.length > 0 && (
        <div aria-label="Chat windows" role="region" className="pointer-events-none fixed bottom-0 right-4 z-[1250] hidden items-end gap-3 lg:flex">
          {/* Oldest on the left, newest next to the bubbles, like Facebook. */}
          {[...windows].reverse().map((c) => (
            <DockWindow key={c.id} chat={c} update={update} close={close} />
          ))}
          {bubbles.length > 0 && (
            <ul aria-label="Minimized chats" className="pointer-events-auto mb-4 flex flex-col-reverse gap-2">
              {bubbles.map((c) => (
                <li key={c.id} className="group/bubble relative">
                  <button
                    type="button"
                    onClick={() => open(c.id)}
                    aria-label={`Open chat with ${c.person?.name ?? "planter"}`}
                    title={c.person?.name}
                    className="block rounded-full shadow-lg ring-2 ring-card transition-transform hover:scale-105"
                  >
                    <Avatar card={{ name: c.person?.name ?? "?", image: c.person?.image ?? null }} size="h-12 w-12" />
                  </button>
                  <button
                    type="button"
                    onClick={() => close(c.id)}
                    aria-label={`Close chat with ${c.person?.name ?? "planter"}`}
                    className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-card-3 text-ink-2 opacity-0 ring-1 ring-line-strong transition-opacity hover:text-ink focus-visible:opacity-100 group-hover/bubble:opacity-100"
                  >
                    <CloseIcon className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </DockContext>
  );
}
