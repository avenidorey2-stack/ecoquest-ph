"use client";

import { useEffect, useRef } from "react";

/** The keyboard counts as open once it covers more than this much of the screen. */
const KEYBOARD_PX = 120;

/**
 * Full-height chat screen. Phones: covers the app like Messenger and follows the visible part of
 * the screen (visualViewport), so when the keyboard opens the chat header stays at the top and
 * the message box sits right on the keyboard, with the messages in between. Without this, iOS
 * slides the whole page up under the keyboard and the header scrolls away. Desktop: fills the
 * main area under the app header. The page behind doesn't scroll while a chat is open.
 */
export default function ChatFrame({ label, children }: { label: string; children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const desktop = window.matchMedia("(min-width: 1024px)");
    const vv = window.visualViewport;
    let frame = 0;
    const fit = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (desktop.matches) {
          el.style.transform = "";
          el.style.height = `${Math.max(360, window.innerHeight - el.getBoundingClientRect().top)}px`;
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
  }, []);

  return (
    <section
      ref={ref}
      aria-label={label}
      className="group/chat fixed inset-x-0 top-0 z-[1150] flex h-dvh flex-col bg-canvas lg:relative lg:z-auto lg:mx-auto lg:h-[calc(100dvh-8rem)] lg:w-full lg:max-w-3xl lg:bg-transparent lg:px-6 lg:py-4"
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:rounded-2xl lg:border lg:border-line/80 lg:bg-card lg:shadow-sm">
        {children}
      </div>
    </section>
  );
}

/** Top bar of a chat: back link, then whatever identifies the chat, then actions. */
export function ChatHeader({ children }: { children: React.ReactNode }) {
  return (
    <header className="flex shrink-0 items-center gap-2 border-b border-line bg-card px-2 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-3 lg:pt-2">
      {children}
    </header>
  );
}
