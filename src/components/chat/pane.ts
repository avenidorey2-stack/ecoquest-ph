"use client";

import { createContext, useContext } from "react";

/** True inside the Messages screen's chat pane (desktop: chat list on the left, chat on the right). */
export const ChatPane = createContext(false);
export const useInChatPane = () => useContext(ChatPane);

/** Set inside a pop-up chat window (desktop, bottom-right like Facebook): its header buttons. */
export type DockControls = { minimize: () => void; close: () => void };
export const ChatDockWindow = createContext<DockControls | null>(null);
export const useDockWindow = () => useContext(ChatDockWindow);

/**
 * Outer classes of a chat screen. Phones: covers the app like Messenger. Desktop: a card under
 * the app header — filling the right side of the Messages screen, or centred on its own page.
 */
export function chatFrameClass(inPane: boolean) {
  const phone = "fixed inset-x-0 top-0 z-[1150] flex h-dvh flex-col bg-canvas";
  return inPane
    ? `${phone} lg:static lg:z-auto lg:h-full lg:min-h-0 lg:flex-1 lg:bg-transparent`
    : `${phone} lg:relative lg:z-auto lg:mx-auto lg:h-[calc(100dvh-8rem)] lg:w-full lg:max-w-3xl lg:bg-transparent lg:px-6 lg:py-4`;
}
