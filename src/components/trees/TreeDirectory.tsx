"use client";

import { AnimatePresence, LayoutGroup, MotionConfig, motion, type Variants } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PhotoCredit } from "@/data/tree-photos";
import { CloseIcon, PinIcon } from "@/components/ui/icons";

export type TreeCard = {
  id: string;
  slug: string;
  name: string;
  scientificName: string;
  category: string;
  description: string;
  benefits: string[];
  /** Card-size image (photo, or the generated illustration when there's no photo). */
  cardImage: string;
  /** Full-size image for the details view. */
  fullImage: string;
  credit: PhotoCredit | null;
  totalPlanted: number;
  plantingGoal: number;
  /** Plants of this species verified in the viewer's city. */
  localPlanted: number;
  /** Open slots for this species in the viewer's city. */
  openSlotsInCity: number;
  /** "Active in: …" label. */
  activeIn: string;
};

const pct = (t: TreeCard) => (t.plantingGoal > 0 ? Math.min(100, (t.totalPlanted / t.plantingGoal) * 100) : 0);
const fmt = (n: number) => n.toLocaleString("en-PH");

/** One spring for the card ↔ details morph, so photo, title and frame move as one. */
const MORPH = { type: "spring", bounce: 0.16, visualDuration: 0.5 } as const;

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

function Progress({ tree, onPhoto = false }: { tree: TreeCard; onPhoto?: boolean }) {
  const value = pct(tree);
  return (
    <div>
      <div
        className={`h-2 overflow-hidden rounded-full ${onPhoto ? "bg-white/25 backdrop-blur" : "bg-emerald-400/15"}`}
        role="progressbar"
        aria-label={`${tree.name} planting progress`}
        aria-valuenow={tree.totalPlanted}
        aria-valuemin={0}
        aria-valuemax={tree.plantingGoal}
      >
        <div
          className="eq-fill h-full rounded-full bg-gradient-to-r from-lime-300 via-emerald-400 to-emerald-500 shadow-[0_0_10px_rgba(52,211,153,.7)]"
          style={{ width: `${Math.max(value, tree.totalPlanted > 0 ? 2 : 0)}%` }}
        />
      </div>
      <p className={`mt-1.5 text-xs ${onPhoto ? "text-white/90" : "text-ink-2"}`}>
        <strong className={onPhoto ? "text-white" : "text-ink"}>{fmt(tree.totalPlanted)}</strong> out of {fmt(tree.plantingGoal)} planted
      </p>
    </div>
  );
}

export function Credit({ credit }: { credit: PhotoCredit }) {
  if (credit.ai) {
    return (
      <p className="text-[11px] leading-relaxed text-ink-4">
        AI-generated image (
        <a href={credit.source} target="_blank" rel="noreferrer" className="underline decoration-ink-4/40 underline-offset-2 hover:text-ink-2">
          {credit.author}
        </a>
        ) — an artist&apos;s impression; the real tree may look different.
      </p>
    );
  }
  return (
    <p className="text-[11px] leading-relaxed text-ink-4">
      {credit.shows && <span className="text-ink-3">Photo shows a close relative, {credit.shows}. </span>}
      Photo:{" "}
      <a href={credit.source} target="_blank" rel="noreferrer" className="underline decoration-ink-4/40 underline-offset-2 hover:text-ink-2">
        {credit.author}
      </a>{" "}
      · {credit.license} · Wikimedia Commons
    </p>
  );
}

function DetailsModal({ tree, city, onClose }: { tree: TreeCard; city: string | null; onClose: () => void }) {
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeButton.current?.focus({ preventScroll: true });
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
    <div className="fixed inset-0 z-[2100] m-0 flex items-end justify-center p-0 sm:items-center sm:p-4" onClick={onClose}>
      <motion.div
        className="absolute inset-0 bg-canvas/80 backdrop-blur-md"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: { duration: 0.25 } }}
        aria-hidden
      />
      {/* The frame shares the card's layoutId, so the card itself grows into this sheet. */}
      <motion.div
        layoutId={`tree-${tree.id}`}
        transition={MORPH}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tree-modal-title"
        className="relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[1.75rem] border border-line bg-card shadow-[0_40px_120px_-30px_rgba(16,185,129,.35)] sm:rounded-[1.75rem]"
        style={{ borderRadius: 28 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative aspect-[16/10] w-full shrink-0 overflow-hidden sm:aspect-[2/1]">
          <motion.img
            layoutId={`tree-photo-${tree.id}`}
            transition={MORPH}
            src={tree.fullImage}
            alt={`${tree.name} (${tree.scientificName})`}
            className="absolute inset-0 h-full w-full object-cover"
          />
          <motion.div
            className="absolute inset-0 bg-gradient-to-t from-card via-card/20 to-transparent"
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
          />
          <motion.button
            exit={{ opacity: 0, transition: { duration: 0.08 } }}
            ref={closeButton}
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 grid h-11 w-11 place-items-center rounded-full bg-black/40 text-white ring-1 ring-white/20 backdrop-blur transition-colors hover:bg-black/60"
          >
            <CloseIcon className="h-4 w-4" />
          </motion.button>
          <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6">
            <motion.span
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0, transition: { delay: 0.2 } }}
              exit={{ opacity: 0, transition: { duration: 0.1 } }}
              className="inline-block rounded-full bg-emerald-400/15 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-emerald-300 ring-1 ring-emerald-400/30 backdrop-blur"
            >
              {tree.category}
            </motion.span>
            <motion.h2 layoutId={`tree-name-${tree.id}`} transition={MORPH} id="tree-modal-title" className="mt-2 w-fit text-3xl font-bold text-white drop-shadow sm:text-4xl">
              {tree.name}
            </motion.h2>
            <motion.p exit={{ opacity: 0, transition: { duration: 0.08 } }} className="text-sm italic text-emerald-100/80">
              {tree.scientificName}
            </motion.p>
          </div>
        </div>

        {/* Body content fades up after the frame has mostly morphed. */}
        <motion.div
          className="space-y-5 overflow-y-auto p-5 sm:p-6"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0, transition: { delay: 0.18, type: "spring", bounce: 0.2, visualDuration: 0.45 } }}
          exit={{ opacity: 0, transition: { duration: 0.12 } }}
        >
          <p className="text-[15px] leading-relaxed text-ink-2">{tree.description}</p>

          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-3">Ecological benefits</h3>
            <ul className="mt-2 space-y-2">
              {tree.benefits.map((b) => (
                <li key={b} className="flex gap-2.5 text-sm text-ink-2">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-400/15 text-[11px] text-emerald-400" aria-hidden>
                    ✓
                  </span>
                  {b}
                </li>
              ))}
            </ul>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-line bg-card-2 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-3">National progress</p>
              <div className="mt-2">
                <Progress tree={tree} />
              </div>
            </div>
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-400">{city ? `In ${city}` : "Near you"}</p>
              {city ? (
                <p className="mt-2 text-sm text-ink-2">
                  <strong className="text-lg text-emerald-300">{fmt(tree.localPlanted)}</strong> planted locally
                  <span className="block text-xs text-ink-3">
                    {tree.openSlotsInCity > 0
                      ? `${tree.openSlotsInCity} open planting slot${tree.openSlotsInCity === 1 ? "" : "s"} in your city`
                      : "No open slots for this species in your city yet"}
                  </span>
                </p>
              ) : (
                <p className="mt-2 text-sm text-ink-2">
                  <Link href="/profile" className="font-semibold text-emerald-400">
                    Set your home city
                  </Link>{" "}
                  to see local stats.
                </p>
              )}
            </div>
          </div>

          {tree.openSlotsInCity > 0 && (
            <Link href="/dashboard" className="block rounded-xl bg-emerald-400 py-2.5 text-center text-sm font-semibold text-emerald-950 hover:bg-emerald-300">
              Find a {tree.name} slot on the map
            </Link>
          )}

          {tree.credit && <Credit credit={tree.credit} />}
        </motion.div>
      </motion.div>
    </div>
  );
}

function TreeTile({
  tree,
  open,
  settling,
  onOpen,
  onSettled,
}: {
  tree: TreeCard;
  open: boolean;
  /** Details just closed: the tile is morphing back, so its text waits until it lands. */
  settling: boolean;
  onOpen: (el: HTMLButtonElement) => void;
  onSettled: () => void;
}) {
  return (
    <motion.button
      type="button"
      layoutId={`tree-${tree.id}`}
      transition={MORPH}
      onClick={(e) => onOpen(e.currentTarget)}
      onLayoutAnimationComplete={() => settling && onSettled()}
      aria-haspopup="dialog"
      aria-label={`${tree.name} — view details`}
      // While its details are open the tile stays in the grid (holding its place) but hidden.
      style={{ borderRadius: 24, visibility: open ? "hidden" : "visible" }}
      className="group relative block aspect-[4/5] w-full overflow-hidden text-left ring-1 ring-white/10 transition-shadow duration-300 hover:shadow-[0_24px_60px_-20px_rgba(16,185,129,.45)] hover:ring-emerald-400/40 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-400"
    >
      <motion.img
        layoutId={`tree-photo-${tree.id}`}
        transition={MORPH}
        src={tree.cardImage}
        alt=""
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover transition-[scale] duration-700 ease-out group-hover:scale-[1.06]"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-transparent via-45% to-black/80" />
      <motion.div
        className="absolute inset-0"
        initial={false}
        animate={{ opacity: settling ? 0 : 1 }}
        transition={{ duration: settling ? 0 : 0.25 }}
      >
        <div className="absolute inset-x-0 top-0 p-4">
          <motion.h3 layoutId={`tree-name-${tree.id}`} transition={MORPH} className="w-fit text-xl font-bold text-white drop-shadow">
            {tree.name}
          </motion.h3>
          <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-emerald-50/90">
            <PinIcon className="h-3.5 w-3.5 shrink-0 text-emerald-300" />
            {tree.activeIn}
          </p>
        </div>
        {tree.credit?.shows && (
          <span className="absolute right-3 top-3 rounded-full bg-black/45 px-2 py-0.5 text-[10px] font-medium text-white/85 ring-1 ring-white/15 backdrop-blur">
            Related species
          </span>
        )}
        <div className="absolute inset-x-0 bottom-0 p-4">
          <Progress tree={tree} onPhoto />
        </div>
      </motion.div>
    </motion.button>
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
  const [settling, setSettling] = useState<string | null>(null);
  // Return focus to the card that opened the details, once it has morphed back into place.
  const opener = useRef<HTMLButtonElement | null>(null);
  const settleTimer = useRef(0);
  const settled = useCallback(() => {
    window.clearTimeout(settleTimer.current);
    setSettling(null);
    opener.current?.focus({ preventScroll: true });
  }, []);
  // Stable identity: the modal's keyboard/focus effect depends on it.
  const close = useCallback(() => {
    setSelected((current) => {
      if (current) setSettling(current.id);
      return null;
    });
    // Fallback for when no layout animation runs (reduced motion): settle anyway.
    window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(settled, 900);
  }, [settled]);
  useEffect(() => () => window.clearTimeout(settleTimer.current), []);

  return (
    <MotionConfig reducedMotion="user">
      <LayoutGroup>
        {/* Reveals itself (below), so the portal-wide ScrollReveal leaves it alone. */}
        <div className="space-y-10" data-reveal-skip>
          {categories.map((category, index) => (
            // The first category is on screen at load (CSS stagger, visible before hydration);
            // later ones reveal as they scroll into view.
            <motion.section
              key={category.title}
              aria-labelledby={`cat-${category.title}`}
              {...(index > 0 && { initial: "hidden", whileInView: "shown", viewport: { once: true, amount: 0.15 } })}
              variants={REVEAL_GROUP}
            >
              <motion.div variants={REVEAL_ITEM} className="mb-4 flex items-baseline justify-between gap-3">
                <h2 id={`cat-${category.title}`} className="text-lg font-semibold tracking-tight text-ink">
                  {category.title}
                </h2>
                <span className="text-xs text-ink-4">{category.trees.length} species</span>
              </motion.div>
              <motion.ul
                variants={REVEAL_GROUP}
                className={`grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4 ${index === 0 ? "eq-stagger eq-spring" : ""}`}
              >
                {category.trees.map((tree) => (
                  <motion.li key={tree.id} variants={REVEAL_ITEM}>
                    <TreeTile
                      tree={tree}
                      open={selected?.id === tree.id}
                      settling={settling === tree.id}
                      onSettled={settled}
                      onOpen={(el) => {
                        opener.current = el;
                        setSelected(tree);
                      }}
                    />
                  </motion.li>
                ))}
              </motion.ul>
            </motion.section>
          ))}
        </div>

        <AnimatePresence>{selected && <DetailsModal key={selected.id} tree={selected} city={city} onClose={close} />}</AnimatePresence>
      </LayoutGroup>
    </MotionConfig>
  );
}
