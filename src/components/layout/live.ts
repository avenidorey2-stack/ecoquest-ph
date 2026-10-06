"use client";

import { createContext, useContext, useEffect, useRef } from "react";

// Live pings: the database pings the user's secret Supabase Realtime channel ("notify:<token>")
// after a notification ("notify") or a direct message ("message") is saved for them. Pings carry
// no data; listeners fetch what's new. One connection per page is shared by every listener.
// Without Supabase (local dev) nothing arrives and listeners rely on their polling fallback.

export type LiveEvent = "notify" | "message";
const EVENTS: LiveEvent[] = ["notify", "message"];

const REALTIME_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const REALTIME_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

type Connection = { users: number; listeners: Map<LiveEvent, Set<() => void>>; close: () => void };
const connections = new Map<string, Connection>();

function connect(channel: string): Connection {
  const existing = connections.get(channel);
  if (existing) return existing;

  const listeners = new Map(EVENTS.map((e) => [e, new Set<() => void>()]));
  const emit = (event: LiveEvent) => listeners.get(event)?.forEach((fn) => fn());
  let stopped = false;
  let cleanup = () => {};
  if (REALTIME_URL && REALTIME_KEY) {
    // Loaded on demand so pages don't pay for the client until it's needed.
    import("@supabase/realtime-js")
      .then(({ RealtimeClient }) => {
        if (stopped) return;
        const client = new RealtimeClient(`${REALTIME_URL.replace(/^http/i, "ws")}/realtime/v1`, {
          params: { apikey: REALTIME_KEY },
        });
        const sub = client.channel(channel);
        for (const event of EVENTS) sub.on("broadcast", { event }, () => emit(event));
        // (Re)connected: catch up on anything sent while the connection was down.
        sub.subscribe((status) => status === "SUBSCRIBED" && EVENTS.forEach(emit));
        cleanup = () => {
          client.removeChannel(sub).catch(() => {});
          client.disconnect().catch(() => {});
        };
      })
      .catch(() => {}); // no live updates; polling still runs
  }

  const connection: Connection = {
    users: 0,
    listeners,
    close: () => {
      stopped = true;
      cleanup();
      connections.delete(channel);
    },
  };
  connections.set(channel, connection);
  return connection;
}

/** The signed-in user's live channel, provided by the app shell. */
export const LiveChannel = createContext<string | undefined>(undefined);

/** Calls `onEvent` whenever a ping of this kind arrives (and after (re)connecting). */
export function useLiveEvent(event: LiveEvent, onEvent: () => void) {
  const channel = useContext(LiveChannel);
  const callback = useRef(onEvent);
  useEffect(() => {
    callback.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!channel) return;
    const connection = connect(channel);
    const fn = () => callback.current();
    connection.users++;
    connection.listeners.get(event)?.add(fn);
    return () => {
      connection.listeners.get(event)?.delete(fn);
      if (--connection.users === 0) connection.close();
    };
  }, [channel, event]);
}

/** Runs `fn` every `ms` while the tab is visible, and when it becomes visible again. */
export function useVisiblePoll(fn: () => void, ms: number) {
  const callback = useRef(fn);
  useEffect(() => {
    callback.current = fn;
  }, [fn]);
  useEffect(() => {
    const tick = () => document.visibilityState === "visible" && callback.current();
    const id = setInterval(tick, ms);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [ms]);
}

/** Fired after a chat is read, so the header badge updates at once. */
export const MESSAGES_READ_EVENT = "eq:messages-read";
