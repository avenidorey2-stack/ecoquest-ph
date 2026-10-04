"use client";

import {
  AnimatePresence,
  MotionConfig,
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type Variants,
} from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { TOUR_OPEN_EVENT } from "@/components/layout/ScrollReveal";
import { GAP, MARGIN, placeCard, spotlightBox, type Box, type Side } from "@/lib/tour-placement";
import {
  BellIcon,
  CloseIcon,
  CoinIcon,
  DashboardIcon,
  FlagIcon,
  GiftIcon,
  MapIcon,
  MedalIcon,
  PinIcon,
  SproutIcon,
  TreeIcon,
  TrophyIcon,
  UsersIcon,
  WalletIcon,
} from "@/components/ui/icons";

type Step = {
  /** `data-tour` key of the element to spotlight; none = a centered card. */
  target?: string;
  /** Used when the target isn't on screen — on phones the sidebar lives behind the menu button. */
  fallback?: string;
  prefer?: Side[];
  Icon: (p: { className?: string }) => React.ReactNode;
  title: string;
  body: string;
  bullets?: string[];
};

const SIDEBAR = { fallback: "menu", prefer: ["right", "bottom", "top"] as Side[] };

function tourSteps(hasCity: boolean): Step[] {
  return [
    {
      Icon: SproutIcon,
      title: "Welcome to EcoQuest PH!",
      body: "Plant real trees in your city, prove it with a photo, and earn points you can turn into rewards. This quick tour shows you where everything is.",
    },
    {
      target: "nav",
      ...SIDEBAR,
      Icon: DashboardIcon,
      title: "Your main menu",
      body: "Every part of EcoQuest PH is one tap away. You can always come back to the Dashboard — your home base.",
    },
    {
      target: "nav-profile",
      ...SIDEBAR,
      Icon: PinIcon,
      title: "Set your home city first",
      body: "In Profile, choose your city or municipality. It decides which planting slots you can claim and which local leaderboard you're on.",
      bullets: ["Verify your email too, so your location shows as Active"],
    },
    {
      target: "impact",
      Icon: SproutIcon,
      title: "Your eco-impact score",
      body: "A snapshot of everything you've planted so far.",
      bullets: ["Plants planted, plus your national and city rank", "Points earned this week", "Your level and an account health checklist"],
    },
    {
      target: "map",
      Icon: MapIcon,
      title: "Claim a slot on the map",
      body: "Pins are planting sites in your city. Tap a pin, then press “Claim slot”.",
      bullets: ["Green — open, ready to claim", "Blue — a quest you already claimed", "Gray — full for now"],
    },
    {
      target: "quests",
      Icon: FlagIcon,
      title: "Plant, then upload proof",
      body: "Every slot you claim becomes a quest here.",
      bullets: [
        "Plant the listed tree species at the site",
        "Upload a photo or video and enter how many you planted",
        "Once our team verifies it, you earn points and XP",
      ],
    },
    {
      target: "points",
      Icon: CoinIcon,
      title: "Your points balance",
      body: "Points come from verified plantings and referral bonuses. Tap this anytime to open Rewards.",
    },
    {
      target: "wallet",
      Icon: WalletIcon,
      title: "Turn points into rewards",
      body: "Your reward wallet keeps track of what you've redeemed.",
      bullets: ["Cash out to GCash or Maya", "Claim Grab and Shopee vouchers", "See pending cash-outs at a glance"],
    },
    {
      target: "nav-shop",
      ...SIDEBAR,
      Icon: SproutIcon,
      title: "Seedling Shop",
      body: "Need trees to plant? Order native seedlings using your planting points.",
    },
    {
      target: "nav-transactions",
      ...SIDEBAR,
      Icon: GiftIcon,
      title: "Track orders and rewards",
      body: "Transactions lists every seedling order and reward redemption, with live status updates.",
    },
    {
      target: "leaderboard",
      Icon: TrophyIcon,
      title: "Climb the leaderboard",
      body: "See this week's top planters in your city.",
      bullets: ["Weekly points reset every Monday", "Open “Full board” for the national ranking", "Tap a planter to see their profile"],
    },
    {
      target: "level",
      Icon: MedalIcon,
      title: "Level up and earn badges",
      body: "Every verified planting gives you XP that raises your level. See your badges — and the ones still ahead — in Achievements.",
    },
    {
      target: "bell",
      Icon: BellIcon,
      title: "Notifications",
      body: "The bell lights up when your planting is reviewed, a reward is processed, or an order is updated.",
    },
    {
      target: "referral",
      Icon: UsersIcon,
      title: "Invite friends, earn more",
      body: "Share your invite link. You get 100 bonus points when each friend's first planting is verified.",
    },
    {
      target: "nav-trees",
      ...SIDEBAR,
      Icon: TreeIcon,
      title: "Tree Directory",
      body: "Learn about native Philippine trees — what each one is good for and where it's being planted near you.",
    },
    {
      target: "tour-replay",
      ...SIDEBAR,
      Icon: FlagIcon,
      title: "You're ready to plant!",
      body: hasCity
        ? "Find an open slot on the map and claim your first quest. You can replay this tour anytime from here."
        : "Start by setting your home city so you can see slots near you. You can replay this tour anytime from here.",
    },
  ];
}

const SPRING = { type: "spring", bounce: 0.18, visualDuration: 0.5 } as const;
/** Page scroll: same timing as the spotlight, but no overshoot. */
const SCROLL = { type: "spring", bounce: 0, visualDuration: 0.5, restDelta: 0.5 } as const;
const CARD_MAX_W = 360;
/** Page targets scroll clear of the sticky header (h-16). */
const SAFE_TOP = 72;

// Step content slides in the direction of travel while the card morphs around it.
const SLIDE: Variants = {
  enter: (dir: number) => ({ opacity: 0, x: dir * 18, filter: "blur(4px)" }),
  center: { opacity: 1, x: 0, filter: "blur(0px)", transition: { ...SPRING, opacity: { duration: 0.2 } } },
  exit: (dir: number) => ({ opacity: 0, x: dir * -18, filter: "blur(4px)", transition: { duration: 0.15 } }),
};

const subscribeNoop = () => () => {};

function isShown(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
}

function findVisible(key: string) {
  for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${key}"]`)) if (isShown(el)) return el;
  return null;
}

function resolveTarget(step: Step): { el: HTMLElement | null; fallback: boolean } {
  if (!step.target) return { el: null, fallback: false };
  const el = findVisible(step.target);
  if (el) return { el, fallback: false };
  return { el: step.fallback ? findVisible(step.fallback) : null, fallback: !!step.fallback };
}

/** Inside the fixed sidebar or the sticky header: scrolling the page won't move it. */
function isPinned(el: HTMLElement) {
  for (let n: HTMLElement | null = el; n; n = n.parentElement) {
    const pos = getComputedStyle(n).position;
    if (pos === "fixed" || pos === "sticky") return true;
  }
  return false;
}

/** How far to scroll so a page target (and room for the card) is in view; 0 when it already is. */
function scrollNeeded(el: HTMLElement, r: Box, cardW: number, cardH: number, prefer: Side[] | undefined) {
  if (isPinned(el)) return 0;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const spot = spotlightBox(r, vw, vh);
  const fullyVisible = r.y >= SAFE_TOP && r.y + r.height <= vh - MARGIN;
  if (fullyVisible && spot && placeCard(spot, cardW, cardH, vw, vh, prefer).arrow) return 0;

  const room = vh - MARGIN - SAFE_TOP;
  const pair = r.height + GAP + cardH;
  const top = pair <= room ? SAFE_TOP + (room - pair) / 2 : r.height <= room ? SAFE_TOP + (room - r.height) / 2 : SAFE_TOP;
  // Only as far as the page can actually scroll, so the planned spotlight matches where the target lands.
  const maxScroll = document.documentElement.scrollHeight - vh;
  const delta = Math.min(Math.max(window.scrollY + r.y - top, 0), maxScroll) - window.scrollY;
  return Math.abs(delta) > 4 ? delta : 0;
}

const toBox = (r: DOMRect): Box => ({ x: r.x, y: r.y, width: r.width, height: r.height });

/** Spotlight + card placement for a target rect (null = centered card, no spotlight). */
function computeLayout(rect: Box | null, contentH: number, footerH: number, prefer: Side[] | undefined) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.min(CARD_MAX_W, vw - 2 * MARGIN);
  const spot = rect ? spotlightBox(rect, vw, vh) : null;
  return { w, spot, place: placeCard(spot, w, contentH + footerH, vw, vh, prefer), vw, vh, contentH };
}
type Layout = ReturnType<typeof computeLayout>;
type View = { w: number; arrow: Side | null; fallback: boolean };

function useGeometry() {
  const sx = useMotionValue(0);
  const sy = useMotionValue(0);
  const sw = useMotionValue(0);
  const sh = useMotionValue(0);
  const ring = useMotionValue(0);
  const cx = useMotionValue(0);
  const cy = useMotionValue(0);
  const ch = useMotionValue(0);
  const arrowAt = useMotionValue(0);
  return useMemo(() => ({ sx, sy, sw, sh, ring, cx, cy, ch, arrowAt }), [sx, sy, sw, sh, ring, cx, cy, ch, arrowAt]);
}
type Geometry = ReturnType<typeof useGeometry>;

/** Target values in Geometry key order (index 7 = content height). */
function layoutTargets({ spot, place, vw, vh, contentH }: Layout) {
  // No target: the spotlight closes to a point at the center (the whole screen dims).
  const s = spot ?? { x: vw / 2, y: vh / 2, width: 0, height: 0 };
  return [s.x, s.y, s.width, s.height, spot ? 1 : 0, place.x, place.y, contentH, place.arrowOffset];
}

function applyLayout(g: Geometry, layout: Layout, smooth: boolean) {
  const targets = layoutTargets(layout);
  Object.values(g).forEach((mv, i) => (smooth ? animate(mv, targets[i], SPRING) : mv.jump(targets[i])));
  return targets;
}

const isAnimating = (g: Geometry) => Object.values(g).some((mv) => mv.isAnimating());

function TourLayer({
  steps,
  hasCity,
  invitedBy,
  onClose,
}: {
  steps: Step[];
  hasCity: boolean;
  invitedBy: string | null;
  /** `stay`: the user is following a link, so don't navigate back to the dashboard. */
  onClose: (stay?: boolean) => void;
}) {
  const reduce = !!useReducedMotion();
  const titleId = useId();
  const maskId = useId();
  const [[index, dir], setNav] = useState<[number, number]>([0, 1]);
  const [view, setView] = useState<View | null>(null);
  const viewRef = useRef(view);
  const sizeRef = useRef({ content: 0, footer: 0 });
  const cardRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement & HTMLAnchorElement>(null);

  const step = steps[index];
  const total = steps.length;
  const last = index === total - 1;
  const go = (delta: number) => setNav(([i]) => [Math.min(Math.max(i + delta, 0), total - 1), delta]);

  // Spotlight + card geometry as motion values: the first placement jumps, every step change
  // springs from wherever it is — so the spotlight and card morph from step to step.
  const g = useGeometry();
  const shown = useMotionValue(0);
  const cardScale = useTransform(shown, [0, 1], [0.94, 1]);
  const placed = useRef(false);
  /** Targets the motion values were last sent to. */
  const applied = useRef<number[] | null>(null);
  /** Page scroll the tour is driving (in step with the spotlight). */
  const scrollAnim = useRef<{ stop: () => void } | null>(null);
  const scrolling = useRef(false);

  const show = (next: View) => {
    const prev = viewRef.current;
    if (prev && prev.w === next.w && prev.arrow === next.arrow && prev.fallback === next.fallback) return;
    viewRef.current = next;
    setView(next);
  };

  // Step change: measure the new card, work out where the target WILL be once the page has
  // scrolled, then start the spotlight, the card and the page scroll together in this frame.
  // Nothing waits a frame and nothing gets re-aimed mid-flight, so there's no hitch.
  useLayoutEffect(() => {
    const card = cardRef.current;
    const content = contentRef.current;
    const footer = footerRef.current;
    if (!card || !content || !footer) return;
    const current = steps[index];
    card.style.width = `${Math.min(CARD_MAX_W, window.innerWidth - 2 * MARGIN)}px`;
    const size = { content: content.offsetHeight, footer: footer.offsetHeight };
    sizeRef.current = size;

    const { el, fallback } = resolveTarget(current);
    let rect = el ? toBox(el.getBoundingClientRect()) : null;
    const w = Math.min(CARD_MAX_W, window.innerWidth - 2 * MARGIN);
    const delta = el && rect ? scrollNeeded(el, rect, w, size.content + size.footer, current.prefer) : 0;
    if (rect) rect = { ...rect, y: rect.y - delta };
    const layout = computeLayout(rect, size.content, size.footer, current.prefer);

    const smooth = placed.current && !reduce;
    show({ w: layout.w, arrow: layout.place.arrow, fallback });
    applied.current = applyLayout(g, layout, smooth);

    scrollAnim.current?.stop();
    scrolling.current = false;
    if (delta) {
      const from = window.scrollY;
      if (smooth) {
        scrolling.current = true;
        scrollAnim.current = animate(from, from + delta, {
          ...SCROLL,
          onUpdate: (v) => window.scrollTo({ top: v, behavior: "instant" }),
          onComplete: () => (scrolling.current = false),
        });
      } else {
        window.scrollTo({ top: from + delta, behavior: "instant" });
      }
    }

    if (!placed.current) {
      placed.current = true;
      animate(shown, 1, reduce ? { duration: 0 } : { ...SPRING, bounce: 0.25 });
    }
  }, [index, steps, reduce, g, shown]);

  // A wheel or swipe takes the page back from the tour's scroll.
  useEffect(() => {
    const release = () => {
      scrollAnim.current?.stop();
      scrolling.current = false;
    };
    window.addEventListener("wheel", release, { passive: true });
    window.addEventListener("touchstart", release, { passive: true });
    return () => {
      window.removeEventListener("wheel", release);
      window.removeEventListener("touchstart", release);
      scrollAnim.current?.stop();
    };
  }, []);

  // Between step changes, stay glued to the target (the user scrolling, rotation, resize, the
  // card's text reflowing). Pure movement follows 1:1; a new card side or size springs.
  useEffect(() => {
    const current = steps[index];
    let el: HTMLElement | null = null;
    let fallback = false;
    let vw = 0;
    let vh = 0;
    let settling = false;
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (scrolling.current || isAnimating(g)) {
        settling = true;
        return;
      }
      if (!el || !el.isConnected || vw !== window.innerWidth || vh !== window.innerHeight) {
        ({ el, fallback } = resolveTarget(current));
        vw = window.innerWidth;
        vh = window.innerHeight;
      }
      const r = el?.getBoundingClientRect();
      const { content, footer } = sizeRef.current;
      const layout = computeLayout(r ? toBox(r) : null, content, footer, current.prefer);
      const targets = layoutTargets(layout);
      const prev = applied.current;
      if (prev && targets.every((v, i) => Math.abs(v - prev[i]) < 0.5)) {
        settling = false;
        return;
      }
      const v = viewRef.current;
      const reshaped = !v || v.arrow !== layout.place.arrow || v.w !== layout.w || !prev || prev[7] !== layout.contentH;
      show({ w: layout.w, arrow: layout.place.arrow, fallback });
      applied.current = applyLayout(g, layout, !reduce && (settling || reshaped));
      settling = false;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [index, steps, reduce, g]);

  // Natural height of the step content and footer; the follow loop picks up changes.
  useEffect(() => {
    const content = contentRef.current;
    const footer = footerRef.current;
    if (!content || !footer) return;
    const ro = new ResizeObserver(() => {
      sizeRef.current = { content: content.offsetHeight, footer: footer.offsetHeight };
    });
    ro.observe(content);
    ro.observe(footer);
    return () => ro.disconnect();
  }, []);

  // Below-the-fold sections normally wait to spring in on scroll; during the tour they'd move
  // under the spotlight, so show them all now.
  useEffect(() => {
    document.documentElement.dataset.eqTour = "";
    window.dispatchEvent(new Event(TOUR_OPEN_EVENT));
    return () => {
      delete document.documentElement.dataset.eqTour;
    };
  }, []);

  // Keep keyboard focus on the card's main button as steps change. The card is
  // `visibility: hidden` until first placed, so it can't take focus before `ready`.
  const ready = view !== null;
  useEffect(() => {
    if (ready && !cardRef.current?.contains(document.activeElement)) primaryRef.current?.focus({ preventScroll: true });
  }, [index, ready]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" && !last) go(1);
      else if (e.key === "ArrowLeft" && index > 0) go(-1);
      else if (e.key === "Tab" && cardRef.current) {
        // Keep Tab inside the card.
        const items = cardRef.current.querySelectorAll<HTMLElement>("button, a[href]");
        const first = items[0];
        const final = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          final.focus();
        } else if (!e.shiftKey && document.activeElement === final) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const { sx, sy, sw, sh, ring, cx, cy, ch, arrowAt } = g;
  const arrow = view?.arrow ?? null;
  const arrowStyle =
    arrow === "top"
      ? { top: -6, left: arrowAt, marginLeft: -7 }
      : arrow === "bottom"
        ? { bottom: -6, left: arrowAt, marginLeft: -7 }
        : arrow === "left"
          ? { left: -6, top: arrowAt, marginTop: -7 }
          : { right: -6, top: arrowAt, marginTop: -7 };
  const Icon = step.Icon;

  return (
    <motion.div
      className="fixed inset-0 z-[2000] m-0"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.2 } }}
    >
      {/* Dimmed screen with a rounded cut-out over the current target; it also blocks page clicks. */}
      <svg className="absolute inset-0 h-full w-full" aria-hidden>
        <defs>
          <mask id={maskId}>
            <rect width="100%" height="100%" fill="white" />
            <motion.rect rx={14} fill="black" width={sw} height={sh} style={{ x: sx, y: sy }} />
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgb(1 8 5 / 0.74)" mask={`url(#${maskId})`} />
        <motion.rect
          rx={14}
          fill="none"
          stroke="#6ee7b7"
          strokeWidth={2}
          width={sw}
          height={sh}
          style={{ x: sx, y: sy, opacity: ring }}
          className="eq-tour-ring"
        />
      </svg>

      <motion.div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="absolute left-0 top-0 rounded-2xl bg-card text-ink shadow-[0_24px_60px_-20px_rgba(2,44,34,.55)] ring-1 ring-emerald-400/10"
        style={{ x: cx, y: cy, width: view?.w ?? CARD_MAX_W, opacity: shown, scale: cardScale, visibility: view ? "visible" : "hidden" }}
      >
        <AnimatePresence initial={false}>
          {arrow && (
            <motion.span
              key={arrow}
              aria-hidden
              className="absolute h-3.5 w-3.5 rotate-45 rounded-[3px] bg-card"
              style={arrowStyle}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.1 } }}
            />
          )}
        </AnimatePresence>

        <button
          type="button"
          onClick={() => onClose()}
          aria-label="Close tour"
          className="absolute right-2.5 top-2.5 z-10 grid h-9 w-9 place-items-center rounded-full text-ink-4 transition-colors hover:bg-card-2 hover:text-ink-2"
        >
          <CloseIcon className="h-4 w-4" />
        </button>

        <motion.div className="overflow-hidden rounded-t-2xl" style={{ height: ch }}>
          <div ref={contentRef} className="relative">
            <AnimatePresence mode="popLayout" initial={false} custom={dir}>
              <motion.div
                key={index}
                custom={dir}
                variants={SLIDE}
                initial="enter"
                animate="center"
                exit="exit"
                className="p-5 pb-4"
                aria-live="polite"
              >
                <div className="flex items-center gap-3 pr-8">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-emerald-400/10 to-lime-400/10 text-emerald-400 ring-1 ring-emerald-400/20">
                    <Icon className="h-5 w-5" />
                  </span>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-400">
                    Step {index + 1} of {total}
                  </p>
                </div>
                {index === 0 && invitedBy && (
                  <p className="mt-3 rounded-lg bg-emerald-400/10 px-3 py-1.5 text-xs text-emerald-300">
                    You were invited by <strong>{invitedBy}</strong>
                  </p>
                )}
                <h2 id={titleId} className="mt-3 text-[17px] font-bold leading-snug text-ink">
                  {step.title}
                </h2>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{step.body}</p>
                {step.bullets && (
                  <ul className="mt-3 space-y-1.5">
                    {step.bullets.map((b) => (
                      <li key={b} className="flex gap-2.5 text-sm text-ink-2">
                        <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden />
                        {b}
                      </li>
                    ))}
                  </ul>
                )}
                {view?.fallback && (
                  <p className="mt-3 rounded-lg bg-amber-400/10 px-3 py-2 text-xs text-amber-200 ring-1 ring-amber-400/30">
                    On this screen, find it in the menu (☰) at the top left.
                  </p>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>

        <div ref={footerRef} className="px-5 pb-5">
          <div className="flex gap-2">
            {index > 0 ? (
              <button
                type="button"
                onClick={() => go(-1)}
                className="h-11 flex-1 rounded-full border border-line text-sm font-semibold text-ink-2 transition-colors hover:bg-card-2"
              >
                Back
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onClose()}
                className="h-11 flex-1 rounded-full text-sm font-medium text-ink-3 transition-colors hover:bg-card-2 hover:text-ink-2"
              >
                Skip tour
              </button>
            )}
            {!last ? (
              <button
                ref={primaryRef}
                type="button"
                onClick={() => go(1)}
                className="h-11 flex-1 rounded-full bg-emerald-400 text-sm font-semibold text-emerald-950 shadow-sm transition-colors hover:bg-emerald-300"
              >
                {index === 0 ? "Show me around" : "Next"}
              </button>
            ) : hasCity ? (
              <button
                ref={primaryRef}
                type="button"
                onClick={() => onClose()}
                className="h-11 flex-1 rounded-full bg-emerald-400 text-sm font-semibold text-emerald-950 shadow-sm transition-colors hover:bg-emerald-300"
              >
                Start planting
              </button>
            ) : (
              <Link
                ref={primaryRef}
                href="/profile"
                onClick={() => onClose(true)}
                className="grid h-11 flex-1 place-items-center rounded-full bg-emerald-400 text-sm font-semibold text-emerald-950 shadow-sm transition-colors hover:bg-emerald-300"
              >
                Set my city
              </Link>
            )}
          </div>
          <div className="mt-4 h-1 overflow-hidden rounded-full bg-card-2" aria-hidden>
            <motion.div
              className="h-full origin-left rounded-full bg-gradient-to-r from-lime-400 to-emerald-600"
              initial={false}
              animate={{ scaleX: (index + 1) / total }}
              transition={SPRING}
            />
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

/**
 * First-visit guided tour of the dashboard: dims the screen, spotlights each feature in turn
 * and explains it in a card that points at it. Replayable from the menu (/dashboard?tour=1).
 */
export default function ProductTour({
  hasCity,
  invitedBy,
  replay = false,
}: {
  hasCity: boolean;
  invitedBy: string | null;
  /** Opened from "Take the tour": closing returns to the plain dashboard URL. */
  replay?: boolean;
}) {
  const router = useRouter();
  const mounted = useSyncExternalStore(subscribeNoop, () => true, () => false);
  const [open, setOpen] = useState(true);
  const steps = useMemo(() => tourSteps(hasCity), [hasCity]);

  function close(stay = false) {
    setOpen(false);
    fetch("/api/onboarding", { method: "POST" })
      .catch(() => {})
      .finally(() => {
        if (stay) return;
        if (replay) router.replace("/dashboard", { scroll: false });
        else router.refresh();
      });
  }

  if (!mounted) return null;
  return createPortal(
    <MotionConfig reducedMotion="user">
      <AnimatePresence>{open && <TourLayer key="tour" steps={steps} hasCity={hasCity} invitedBy={invitedBy} onClose={close} />}</AnimatePresence>
    </MotionConfig>,
    document.body,
  );
}
