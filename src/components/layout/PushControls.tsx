"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { disablePush, enablePush, PUSH_CONFIGURED, pushState, type PushState } from "@/lib/push-client";
import { BellIcon, CloseIcon } from "@/components/ui/icons";

const DISMISS_KEY = "eq-push-prompt-dismissed";
const noSubscribe = () => () => {};
function readDismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/** This device's notification state; null until checked (the server can't know it). */
function usePushState() {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    pushState()
      .then((s) => live && setState(s))
      .catch(() => live && setState("unsupported"));
    return () => {
      live = false;
    };
  }, []);
  async function run(action: () => Promise<PushState>) {
    setBusy(true);
    setFailed(false);
    try {
      setState(await action());
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }
  return { state, busy, failed, turnOn: () => run(enablePush), turnOff: () => run(disablePush) };
}

const HINTS: Record<PushState, string> = {
  on: "New messages, friend requests, likes and quest updates show on this device, even when EcoQuest is closed.",
  off: "Get new messages and updates on this device, even when EcoQuest is closed.",
  denied: "Notifications are blocked for EcoQuest in this browser. Allow them in your browser's site settings, then come back.",
  "ios-install": "On iPhone: tap Share, then “Add to Home Screen”. Open EcoQuest from your Home Screen to turn notifications on.",
  unsupported: "This browser can't show notifications. Try Chrome, Edge, Firefox or Safari.",
};

/** Settings row: the "Phone Notifications" switch for this device, with what it needs if it can't. */
export function PushSettingRow() {
  const { state, busy, failed, turnOn, turnOff } = usePushState();
  const on = state === "on";
  if (!PUSH_CONFIGURED) return null;
  const canSwitch = state === "on" || state === "off";
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line pb-3">
      <span>
        <span className="block text-sm font-semibold text-ink">Phone Notifications</span>
        <span className="block text-xs text-ink-3">{state ? HINTS[state] : "Checking this device…"}</span>
        {failed && (
          <span role="alert" className="mt-1 block text-xs text-rose-300">
            Couldn&apos;t turn notifications on. Try again, or use a different browser (private windows can&apos;t get notifications).
          </span>
        )}
      </span>
      {canSwitch && (
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Phone Notifications"
          disabled={busy}
          onClick={on ? turnOff : turnOn}
          className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 ${on ? "bg-emerald-400" : "bg-card-3 ring-1 ring-line-strong"}`}
        >
          <span className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${on ? "translate-x-5" : ""}`} />
        </button>
      )}
    </div>
  );
}

/** A small "Turn On Notifications" card above the chats, until it's turned on or dismissed. */
export function PushBanner() {
  const { state, busy, failed, turnOn } = usePushState();
  // Remembered per browser; hidden while rendering on the server.
  const stored = useSyncExternalStore(noSubscribe, readDismissed, () => true);
  const [dismissed, setDismissed] = useState(false);
  if (stored || dismissed || (state !== "off" && state !== "ios-install")) return null;
  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
  };
  return (
    <div className="mx-3 mb-2 flex items-start gap-3 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-3">
      <BellIcon className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold text-ink">Never Miss a Message</p>
        <p className="text-xs text-ink-2">{state === "ios-install" ? HINTS["ios-install"] : "Get notified on this device when friends message you."}</p>
        {failed && <p role="alert" className="mt-1 text-xs text-rose-300">Couldn&apos;t turn notifications on here. Try again, or use a normal (not private) window.</p>}
        {state === "off" && (
          <button
            type="button"
            onClick={turnOn}
            disabled={busy}
            className="mt-2 min-h-10 rounded-full bg-emerald-400 px-4 text-sm font-bold text-emerald-950 hover:bg-emerald-300 disabled:opacity-50"
          >
            {busy ? "Turning On…" : "Turn On Notifications"}
          </button>
        )}
      </div>
      <button type="button" onClick={dismiss} aria-label="Dismiss" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-3 hover:bg-card-3 hover:text-ink">
        <CloseIcon className="h-4 w-4" />
      </button>
    </div>
  );
}
