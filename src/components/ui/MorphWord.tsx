"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/** Phones and touch screens (same query as the phone rules in globals.css). */
const PHONE = "(max-width: 1023px), (pointer: coarse)";
const subscribePhone = (cb: () => void) => {
  const mq = window.matchMedia(PHONE);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
const isPhone = () => window.matchMedia(PHONE).matches;

/**
 * Cycles through `words` in place: the old word blurs and lifts away while the next rises in,
 * and the slot morphs to the new word's width. Static (first word) under reduced motion.
 * Cycles only while on screen: a copy hidden by a breakpoint would otherwise keep animating
 * unseen, which runs on the main thread and drags every other animation with it.
 * Phones get a GPU-only version: no blur and no width morph (both run on the main thread, and
 * each swap stalled a budget phone's whole animated backdrop). The slot is as wide as the
 * longest word instead, and words slide on `transform` strings, which Motion runs as WAAPI.
 */
export default function MorphWord({ words, className = "", every = 2600 }: { words: string[]; className?: string; every?: number }) {
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const [onScreen, setOnScreen] = useState(false);
  const phone = useSyncExternalStore(subscribePhone, isPhone, () => false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, [phone]); // the phone and desktop versions render different elements
  useEffect(() => {
    if (reduce || !onScreen || words.length < 2) return;
    const id = setInterval(() => setI((n) => (n + 1) % words.length), every);
    return () => clearInterval(id);
  }, [reduce, onScreen, words.length, every]);

  if (phone)
    return (
      <>
        <span className="sr-only">{words[0]}</span>
        <span ref={ref} aria-hidden className={`relative inline-grid overflow-hidden text-left align-bottom ${className}`}>
          {words.map((w) => (
            <span key={w} className="invisible col-start-1 row-start-1 whitespace-nowrap">
              {w}
            </span>
          ))}
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={words[i]}
              className="col-start-1 row-start-1 inline-block whitespace-nowrap"
              initial={{ opacity: 0, transform: "translateY(70%)" }}
              animate={{ opacity: 1, transform: "translateY(0%)" }}
              exit={{ opacity: 0, transform: "translateY(-70%)" }}
              transition={{ type: "spring", bounce: 0.2, visualDuration: 0.45 }}
            >
              {words[i]}
            </motion.span>
          </AnimatePresence>
        </span>
      </>
    );

  return (
    <>
      <span className="sr-only">{words[0]}</span>
      <motion.span
        ref={ref}
        layout
        aria-hidden
        className={`relative inline-flex overflow-hidden align-bottom ${className}`}
        transition={{ type: "spring", bounce: 0.2, visualDuration: 0.45 }}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={words[i]}
            className="inline-block whitespace-nowrap"
            initial={{ y: "70%", opacity: 0, filter: "blur(8px)" }}
            animate={{ y: "0%", opacity: 1, filter: "blur(0px)" }}
            exit={{ y: "-70%", opacity: 0, filter: "blur(8px)" }}
            transition={{ type: "spring", bounce: 0.2, visualDuration: 0.45 }}
          >
            {words[i]}
          </motion.span>
        </AnimatePresence>
      </motion.span>
    </>
  );
}
