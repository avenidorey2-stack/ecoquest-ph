"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

/**
 * Cycles through `words` in place: the old word blurs and lifts away while the next rises in,
 * and the slot morphs to the new word's width. Static (first word) under reduced motion.
 */
export default function MorphWord({ words, className = "", every = 2600 }: { words: string[]; className?: string; every?: number }) {
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);
  useEffect(() => {
    if (reduce || words.length < 2) return;
    const id = setInterval(() => setI((n) => (n + 1) % words.length), every);
    return () => clearInterval(id);
  }, [reduce, words.length, every]);

  return (
    <>
      <span className="sr-only">{words[0]}</span>
      <motion.span
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
