"use client";

import { useEffect, useRef } from "react";

const RESUME_MS = 1200;

/**
 * Freezes the backdrop's animations while the page is touched or scrolled. Touch input wakes the
 * main thread every frame, and each wake re-samples every running animation, so a swipe over the
 * moving backdrop kept a budget phone ~4x busier than over a still one. Leaves and fireflies drift
 * slowly enough that a pause for the length of a swipe isn't noticeable. Render inside `.eq-eco-bg`.
 */
export default function PauseWhileScrolling() {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const bg = ref.current?.parentElement;
    if (!bg) return;
    let timer = 0;
    const pause = () => {
      if (timer) clearTimeout(timer);
      else bg.classList.add("eq-eco-bg--paused");
      timer = window.setTimeout(() => {
        bg.classList.remove("eq-eco-bg--paused");
        timer = 0;
      }, RESUME_MS);
    };
    const opts = { passive: true, capture: true } as const;
    window.addEventListener("touchstart", pause, opts);
    window.addEventListener("touchmove", pause, opts);
    window.addEventListener("scroll", pause, opts);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("touchstart", pause, opts);
      window.removeEventListener("touchmove", pause, opts);
      window.removeEventListener("scroll", pause, opts);
      bg.classList.remove("eq-eco-bg--paused");
    };
  }, []);

  return <span ref={ref} hidden />;
}
