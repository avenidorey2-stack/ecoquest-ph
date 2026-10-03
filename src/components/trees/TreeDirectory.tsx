"use client";

import { AnimatePresence, MotionConfig, motion, type Variants } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

export type TreeCard = {
  id: string;
  slug: string;
  name: string;
  scientificName: string;
  category: string;
  description: string;
  benefits: string[];
  imageUrl: string;
  totalPlanted: number;
  plantingGoal: number;
  /** Plants of this species verified in the viewer's city. */
  localPlanted: number;
  /** Open slots for this species in the viewer's city. */
  openSlotsInCity: number;
  /** "📍 Active in: …" label. */
  activeIn: string;
};

const pct = (t: TreeCard) => (t.plantingGoal > 0 ? Math.min(100, (t.totalPlanted / t.plantingGoal) * 100) : 0);
const fmt = (n: number) => n.toLocaleString("en-PH");

// Scroll reveal for categories below the fold: the group staggers its children, each
// rising in on a soft spring. `transform` strings run on WAAPI (off the main thread).
const REVEAL_GROUP: Variants = { hidden: {}, shown: { transition: { staggerChildren: 0.06 } } };
const REVEAL_ITEM: Variants = {
  hidden: { opacity: 0, transform: "translateY(20px) scale(0.96)" },
  shown: {
    opacity: 1,
    transform: "translateY(0px) scale(1)",
    transition: { type: "spring", bounce: 0.25, visualDuration: 0.5 },
  },
};

function Progress({ tree, light = false }: { tree: TreeCard; light?: boolean }) {
  const value = pct(tree);
  return (
    <div>
      <div
        className={`h-2 overflow-hidden rounded-full ${light ? "bg-white/25" : "bg-emerald-100"}`}
        role="progressbar"
        aria-label={`${tree.name} planting progress`}
        aria-valuenow={tree.totalPlanted}
        aria-valuemin={0}
        aria-valuemax={tree.plantingGoal}
      >
        <div
          className="eq-fill h-full rounded-full bg-gradient-to-r from-lime-300 via-emerald-400 to-emerald-500"
          style={{ width: `${Math.max(value, tree.totalPlanted > 0 ? 2 : 0)}%` }}
        />
      </div>
      <p className={`mt-1.5 text-xs ${light ? "text-white/90" : "text-slate-600"}`}>
        <strong className={light ? "text-white" : "text-slate-900"}>{fmt(tree.totalPlanted)}</strong> out of {fmt(tree.plantingGoal)} planted
      </p>
    </div>
  );
}

function DetailsModal({ tree, city, onClose }: { tree: TreeCard; city: string | null; onClose: () => void }) {
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeButton.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden"; // keep the page behind from scrolling
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  return (
    <motion.div
      className="fixed inset-0 z-[2100] m-0 flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tree-modal-title"
        className="relative max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
        initial={{ y: 40, opacity: 0, scale: 0.97 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 30, opacity: 0, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 300, damping: 28 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative aspect-[16/9] w-full sm:aspect-[2/1]">
          {/* eslint-disable-next-line @next/next/no-img-element -- generated SVG / admin-provided URL */}
          <img src={tree.imageUrl} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-emerald-950/80 via-emerald-950/10 to-transparent" />
          <button
            ref={closeButton}
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-white/90 text-slate-700 shadow hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            ✕
          </button>
          <div className="absolute inset-x-0 bottom-0 p-5 text-white">
            <span className="inline-block rounded-full bg-white/20 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider backdrop-blur">
              {tree.category}
            </span>
            <h2 id="tree-modal-title" className="mt-2 text-2xl font-bold sm:text-3xl">
              {tree.name}
            </h2>
            <p className="text-sm italic text-emerald-100">{tree.scientificName}</p>
          </div>
        </div>

        <div className="space-y-5 p-5 sm:p-6">
          <p className="text-[15px] leading-relaxed text-slate-700">{tree.description}</p>

          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Ecological benefits</h3>
            <ul className="mt-2 space-y-2">
              {tree.benefits.map((b) => (
                <li key={b} className="flex gap-2.5 text-sm text-slate-700">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-100 text-[11px] text-emerald-700" aria-hidden>
                    ✓
                  </span>
                  {b}
                </li>
              ))}
            </ul>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-cream-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">National progress</p>
              <div className="mt-2">
                <Progress tree={tree} />
              </div>
            </div>
            <div className="rounded-2xl bg-emerald-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">{city ? `In ${city}` : "Near you"}</p>
              {city ? (
                <p className="mt-2 text-sm text-slate-700">
                  <strong className="text-lg text-emerald-800">{fmt(tree.localPlanted)}</strong> planted locally
                  <span className="block text-xs text-slate-500">
                    {tree.openSlotsInCity > 0
                      ? `${tree.openSlotsInCity} open planting slot${tree.openSlotsInCity === 1 ? "" : "s"} in your city`
                      : "No open slots for this species in your city yet"}
                  </span>
                </p>
              ) : (
                <p className="mt-2 text-sm text-slate-600">
                  <Link href="/profile" className="font-semibold text-emerald-700">
                    Set your home city
                  </Link>{" "}
                  to see local stats.
                </p>
              )}
            </div>
          </div>

          {tree.openSlotsInCity > 0 && (
            <Link
              href="/dashboard"
              className="block rounded-xl bg-emerald-600 py-2.5 text-center text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Find a {tree.name} slot on the map
            </Link>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function TreeDirectory({
  categories,
  city,
}: {
  categories: { title: string; trees: TreeCard[] }[];
  city: string | null;
}) {
  const [selected, setSelected] = useState<TreeCard | null>(null);
  // Return focus to the card that opened the modal.
  const opener = useRef<HTMLButtonElement | null>(null);
  // Stable identity: the modal's keyboard/focus effect depends on it.
  const close = useCallback(() => {
    setSelected(null);
    opener.current?.focus();
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      {/* Reveals itself (below), so the portal-wide ScrollReveal leaves it alone. */}
      <div className="space-y-9" data-reveal-skip>
        {categories.map((category, index) => (
          // The first category is on screen at load (CSS stagger, visible before hydration);
          // later ones reveal as they scroll into view.
          <motion.section
            key={category.title}
            aria-labelledby={`cat-${category.title}`}
            {...(index > 0 && { initial: "hidden", whileInView: "shown", viewport: { once: true, amount: 0.15 } })}
            variants={REVEAL_GROUP}
          >
            <motion.div variants={REVEAL_ITEM} className="mb-3 flex items-baseline justify-between gap-3">
              <h2 id={`cat-${category.title}`} className="text-lg font-bold text-slate-900">
                {category.title}
              </h2>
              <span className="text-xs text-slate-400">{category.trees.length} species</span>
            </motion.div>
            <motion.ul
              variants={REVEAL_GROUP}
              className={`grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 ${index === 0 ? "eq-stagger eq-spring" : ""}`}
            >
              {category.trees.map((tree) => (
                <motion.li key={tree.id} variants={REVEAL_ITEM}>
                  <button
                    type="button"
                    onClick={(e) => {
                      opener.current = e.currentTarget;
                      setSelected(tree);
                    }}
                    aria-haspopup="dialog"
                    aria-label={`${tree.name} — view details`}
                    className="group relative block aspect-[6/5] w-full overflow-hidden rounded-2xl text-left shadow-sm ring-1 ring-slate-200/70 transition duration-300 hover:-translate-y-1 hover:shadow-[0_20px_40px_-18px_rgba(6,78,59,.55)] focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-400"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- generated SVG / admin-provided URL */}
                    <img
                      src={tree.imageUrl}
                      alt=""
                      loading="lazy"
                      className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-b from-emerald-950/70 via-transparent to-emerald-950/85" />
                    <div className="absolute inset-x-0 top-0 p-4 text-white">
                      <h3 className="text-xl font-bold drop-shadow">{tree.name}</h3>
                      <p className="mt-0.5 text-xs font-medium text-emerald-100">📍 {tree.activeIn}</p>
                    </div>
                    <div className="absolute inset-x-0 bottom-0 p-4">
                      <Progress tree={tree} light />
                    </div>
                  </button>
                </motion.li>
              ))}
            </motion.ul>
          </motion.section>
        ))}
      </div>

      <AnimatePresence>{selected && <DetailsModal key={selected.id} tree={selected} city={city} onClose={close} />}</AnimatePresence>
    </MotionConfig>
  );
}
