"use client";

import { useEffect, useRef, useState } from "react";
import { ReplyIcon } from "@/components/ui/icons";

/** Drag this far toward the middle of the chat to reply. */
const REPLY_AT_PX = 56;
const MAX_PULL_PX = 80;
/** Hold this long (without moving) to open the message's reactions and actions. */
const LONG_PRESS_MS = 450;
/** Movement that counts as a drag or scroll rather than a press. */
const SLOP_PX = 10;

/**
 * A chat bubble that, on touch screens, replies when dragged toward the middle (right for their
 * messages, left for yours) and opens reactions/actions on a long press, like Messenger. Vertical
 * swipes still scroll the chat. On computers the hover buttons do the same.
 */
export default function SwipeBubble({
  mine,
  onReply,
  onLongPress,
  children,
}: {
  mine: boolean;
  onReply?: () => void;
  onLongPress?: () => void;
  children: React.ReactNode;
}) {
  const [pull, setPull] = useState(0);
  const [settling, setSettling] = useState(false);
  const start = useRef<{ x: number; y: number; id: number; mode: "press" | "drag" | "none" } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressed = useRef(false);
  const dir = mine ? -1 : 1;

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clearTimer, []);

  function onPointerDown(e: React.PointerEvent) {
    if (e.pointerType === "mouse" || (!onReply && !onLongPress)) return;
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId, mode: "press" };
    pressed.current = false;
    setSettling(false);
    clearTimer();
    if (onLongPress) {
      timer.current = setTimeout(() => {
        if (start.current?.mode !== "press") return;
        pressed.current = true;
        start.current.mode = "none";
        navigator.vibrate?.(12);
        onLongPress();
      }, LONG_PRESS_MS);
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const s = start.current;
    if (!s || s.id !== e.pointerId || s.mode === "none") return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (s.mode === "press") {
      if (Math.abs(dx) < SLOP_PX && Math.abs(dy) < SLOP_PX) return;
      clearTimer();
      // Mostly sideways toward the middle: a reply drag. Anything else: let the chat scroll.
      s.mode = onReply && dx * dir > Math.abs(dy) ? "drag" : "none";
      if (s.mode === "drag") (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    }
    if (s.mode === "drag") setPull(Math.max(0, Math.min(MAX_PULL_PX, dx * dir * 0.8)));
  }

  function end(e: React.PointerEvent) {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    clearTimer();
    if (s.mode === "drag" && pull >= REPLY_AT_PX && e.type === "pointerup") {
      navigator.vibrate?.(8);
      onReply?.();
    }
    start.current = null;
    setSettling(true);
    setPull(0);
  }

  const ready = pull >= REPLY_AT_PX;
  return (
    <div className="relative">
      {onReply && pull > 0 && (
        <span
          aria-hidden
          className={`absolute top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full transition-colors ${mine ? "-right-1" : "-left-1"} ${
            ready ? "bg-emerald-400 text-emerald-950" : "bg-card-3 text-ink-2"
          }`}
          style={{ opacity: Math.min(1, pull / REPLY_AT_PX) }}
        >
          <ReplyIcon className={`h-4 w-4 ${mine ? "-scale-x-100" : ""}`} />
        </span>
      )}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={end}
        onPointerCancel={end}
        // After a long press, the tap that ends it must not also open the photo.
        onClickCapture={(e) => {
          if (pressed.current) {
            e.preventDefault();
            e.stopPropagation();
            pressed.current = false;
          }
        }}
        // A touch hold opens our menu, not the phone's (mouse right-clicks are left alone).
        onContextMenu={(e) => (start.current || pressed.current) && e.preventDefault()}
        className={`relative touch-pan-y [-webkit-touch-callout:none] pointer-coarse:select-none ${settling ? "transition-transform duration-200 ease-out" : ""}`}
        style={pull ? { transform: `translateX(${pull * dir}px)` } : undefined}
      >
        {children}
      </div>
    </div>
  );
}
