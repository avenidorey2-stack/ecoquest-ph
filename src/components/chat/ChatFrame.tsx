"use client";

import { useEffect, useRef } from "react";
import { chatFrameClass, useDockWindow, useInChatPane } from "./pane";

/** The keyboard counts as open once it covers more than this much of the screen. */
const KEYBOARD_PX = 120;

/**
 * Full-height chat screen. Phones: covers the app like Messenger and follows the visible part of
 * the screen (visualViewport), so when the keyboard opens the chat header stays at the top and
 * the message box sits right on the keyboard, with the messages in between. Without this, iOS
 * slides the whole page up under the keyboard and the header scrolls away. Desktop: fills the
 * main area under the app header (or the Messages screen's chat pane, which sizes itself). The
 * page behind doesn't scroll while a chat is open.
 */
export default function ChatFrame({ label, children }: { label: string; children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const inPane = useInChatPane();
  const inDock = !!useDockWindow();

  useEffect(() => {
    const el = ref.current;
    // A pop-up chat window sizes itself and leaves the page behind scrollable.
    if (!el || inDock) return;
    const desktop = window.matchMedia("(min-width: 1024px)");
    const vv = window.visualViewport;
    let frame = 0;
    const fit = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (desktop.matches) {
          el.style.transform = "";
          el.style.height = inPane ? "" : `${Math.max(360, window.innerHeight - el.getBoundingClientRect().top)}px`;
          delete el.dataset.keyboard;
          return;
        }
        const height = vv?.height ?? window.innerHeight;
        el.style.height = `${height}px`;
        // iOS keeps fixed elements on the layout viewport, which slides up under the keyboard.
        el.style.transform = vv?.offsetTop ? `translateY(${vv.offsetTop}px)` : "";
        if (window.innerHeight - height > KEYBOARD_PX) el.dataset.keyboard = "";
        else delete el.dataset.keyboard;
      });
    };
    fit();
    vv?.addEventListener("resize", fit);
    vv?.addEventListener("scroll", fit);
    window.addEventListener("resize", fit);
    desktop.addEventListener("change", fit);
    const root = document.documentElement;
    root.classList.add("eq-chat-open");
    return () => {
      cancelAnimationFrame(frame);
      vv?.removeEventListener("resize", fit);
      vv?.removeEventListener("scroll", fit);
      window.removeEventListener("resize", fit);
      desktop.removeEventListener("change", fit);
      root.classList.remove("eq-chat-open");
    };
  }, [inPane, inDock]);

  if (inDock) {
    return (
      <section ref={ref} aria-label={label} className="group/chat flex h-full min-h-0 flex-col overflow-hidden bg-card">
        {children}
      </section>
    );
  }
  return (
    <section ref={ref} aria-label={label} className={`group/chat ${chatFrameClass(inPane)}`}>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:rounded-2xl lg:border lg:border-line/80 lg:bg-card lg:shadow-sm">
        {children}
      </div>
    </section>
  );
}

/** Top bar of a chat: back link, then whatever identifies the chat, then actions. */
export function ChatHeader({ children }: { children: React.ReactNode }) {
  const inDock = !!useDockWindow();
  return (
    <header
      className={`flex shrink-0 items-center gap-2 border-b border-line bg-card ${
        inDock ? "px-1.5 py-1.5" : "px-2 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-3 lg:pt-2"
      }`}
    >
      {children}
    </header>
  );
}
