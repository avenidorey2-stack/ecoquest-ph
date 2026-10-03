"use client";

import { animate } from "motion/react";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

// Page blocks and grid/list items that reveal on scroll, like the Tree Directory.
const CANDIDATES = "main > div > *, [data-reveal-root] > div > *, .eq-stagger > *";

// Same spring as the Tree Directory reveal. `transform` strings run on WAAPI (off the main thread).
const FROM = { opacity: 0, transform: "translateY(20px) scale(0.96)" };
const TO = { opacity: 1, transform: "translateY(0px) scale(1)" };
const SPRING = { type: "spring", bounce: 0.25, visualDuration: 0.5 } as const;
const STAGGER = 0.06;
const MAX_DELAY = 0.3;

/** Fired by the guided tour: it spotlights sections, so they must already be in place. */
export const TOUR_OPEN_EVENT = "eq:tour-open";
const tourOpen = () => "eqTour" in document.documentElement.dataset;

/**
 * Scroll reveal for every portal page. Elements that start below the fold are held hidden
 * (`data-eq-reveal="hidden"`) and spring in, staggered, as they scroll into view; anything on
 * screen at load keeps its CSS entrance. When a reveal finishes its inline transform is removed,
 * so a revealed card never becomes the containing block for a fixed overlay inside it.
 */
export default function ScrollReveal() {
  const pathname = usePathname();

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const main = document.querySelector("main");
    if (!main) return;

    const seen = new WeakSet<Element>();
    const hidden = new Set<HTMLElement>();

    const reveal = (els: HTMLElement[]) => {
      els.forEach((el, i) => {
        hidden.delete(el);
        // Hold the start pose inline so nothing flashes during the stagger delay.
        el.style.opacity = String(FROM.opacity);
        el.style.transform = FROM.transform;
        el.dataset.eqReveal = "shown";
        animate(el, { opacity: [FROM.opacity, TO.opacity], transform: [FROM.transform, TO.transform] }, {
          ...SPRING,
          delay: Math.min(i * STAGGER, MAX_DELAY),
        }).then(() =>
          // Motion commits the final keyframe inline as it finishes; clear it a frame later.
          requestAnimationFrame(() => {
            el.style.removeProperty("opacity");
            el.style.removeProperty("transform");
          }),
        );
      });
    };

    // Reveal once a block is meaningfully on screen: 15% of it, 100px of a tall one, or all of
    // a small one (which also covers the last lines of a page that can't scroll any further).
    const entered = (e: IntersectionObserverEntry) =>
      e.isIntersecting &&
      (e.intersectionRatio >= 0.15 || e.intersectionRect.height >= 100 || e.boundingClientRect.bottom <= window.innerHeight);
    const io = new IntersectionObserver(
      (entries) => {
        const entering = entries.filter((e) => entered(e) && hidden.has(e.target as HTMLElement)).map((e) => e.target as HTMLElement);
        entering.forEach((el) => io.unobserve(el));
        if (entering.length) reveal(entering);
      },
      { threshold: [0, 0.05, 0.1, 0.15, 0.25, 0.5, 1] },
    );

    // Each element is judged once, the first time it's seen: below the fold → hold it hidden.
    const scan = () => {
      const fold = window.innerHeight;
      for (const node of main.querySelectorAll<HTMLElement>(CANDIDATES)) {
        if (seen.has(node)) continue;
        seen.add(node);
        if (node.closest("[data-reveal-skip]")) continue;
        const rect = node.getBoundingClientRect();
        if (rect.height === 0 || rect.top < fold || tourOpen()) continue;
        if (getComputedStyle(node).position === "fixed") continue;
        node.dataset.eqReveal = "hidden";
        hidden.add(node);
        io.observe(node);
      }
    };

    // The tour is starting: show everything that's still waiting, without animating it.
    const showAll = () => {
      for (const el of hidden) {
        io.unobserve(el);
        el.dataset.eqReveal = "shown"; // visible, CSS entrance stays off
      }
      hidden.clear();
    };
    window.addEventListener(TOUR_OPEN_EVENT, showAll);

    scan();
    // Streamed sections and client-rendered lists arrive after the first scan.
    let queued = 0;
    const mo = new MutationObserver(() => {
      if (!queued) queued = requestAnimationFrame(() => ((queued = 0), scan()));
    });
    mo.observe(main, { childList: true, subtree: true });

    return () => {
      window.removeEventListener(TOUR_OPEN_EVENT, showAll);
      mo.disconnect();
      io.disconnect();
      cancelAnimationFrame(queued);
      // Never leave content stuck invisible when the page changes.
      for (const el of hidden) delete el.dataset.eqReveal;
    };
  }, [pathname]);

  return null;
}
