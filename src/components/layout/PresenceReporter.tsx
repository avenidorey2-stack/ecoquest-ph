"use client";

import { useEffect } from "react";
import { syncPushSubscription } from "@/lib/push-client";

function report(state: "away" | "active") {
  const body = JSON.stringify({ state });
  // sendBeacon still delivers while the page is closing; fetch may be cancelled.
  if (state === "away" && navigator.sendBeacon?.("/api/presence", new Blob([body], { type: "application/json" }))) return;
  fetch("/api/presence", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
}

/**
 * Tells the server the moment the planter leaves (closes the tab, switches tabs or apps, locks
 * the phone) and comes back, so friends see "Active 1m ago" counting up right away instead of
 * "Active Now". While the app is open, the Messages badge check marks them active every 30 s.
 * Also keeps this device's push subscription (if they turned notifications on) up to date.
 */
export default function PresenceReporter() {
  useEffect(() => {
    const onVisibility = () => report(document.visibilityState === "hidden" ? "away" : "active");
    const onHide = () => report("away");
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onHide);
    syncPushSubscription();
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onHide);
    };
  }, []);
  return null;
}
