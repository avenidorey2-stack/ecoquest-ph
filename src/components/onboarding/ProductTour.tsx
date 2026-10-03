"use client";

import {
  AnimatePresence,
  MotionConfig,
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type MotionValue,
  type Variants,
} from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
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

/** Scroll a page target (and room for the card) into view, only when it's needed. */
function bringIntoView(el: HTMLElement, cardH: number, prefer: Side[] | undefined, reduce: boolean) {
  if (isPinned(el)) return;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const r = el.getBoundingClientRect();
  const w = Math.min(CARD_MAX_W, vw - 2 * MARGIN);
  const spot = spotlightBox(r, vw, vh);
  const fullyVisible = r.top >= SAFE_TOP && r.bottom <= vh - MARGIN;
  if (fullyVisible && spot && placeCard(spot, w, cardH, vw, vh, prefer).arrow) return;

  const room = vh - MARGIN - SAFE_TOP;
  const pair = r.height + GAP + cardH;
  const top = pair <= room ? SAFE_TOP + (room - pair) / 2 : r.height <= room ? SAFE_TOP + (room - r.height) / 2 : SAFE_TOP;
  const delta = r.top - top;
  if (Math.abs(delta) > 4) window.scrollBy({ top: delta, behavior: reduce ? "auto" : "smooth" });
}

type Geo = { rect: Box | null; vw: number; vh: number; fallback: boolean };

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
  const [geo, setGeo] = useState<Geo | null>(null);
  const [size, setSize] = useState({ content: 0, footer: 0 });
  const sizeRef = useRef(size);
  const cardRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement & HTMLAnchorElement>(null);

  const step = steps[index];
  const total = steps.length;
  const last = index === total - 1;
  const go = (delta: number) => setNav(([i]) => [Math.min(Math.max(i + delta, 0), total - 1), delta]);

  // Spotlight + card geometry as motion values: the first placement jumps, every later one
  // springs from wherever it is — so the spotlight and card morph from step to step.
  const sx = useMotionValue(0);
  const sy = useMotionValue(0);
  const sw = useMotionValue(0);
  const sh = useMotionValue(0);
  const ring = useMotionValue(0);
  const cx = useMotionValue(0);
  const cy = useMotionValue(0);
  const ch = useMotionValue(0);
  const arrowAt = useMotionValue(0);
  const shown = useMotionValue(0);
  const cardScale = useTransform(shown, [0, 1], [0.94, 1]);
  const placed = useRef(false);

  // Follow the target every frame (page scroll, the card reveal settling, rotation, resize).
  useEffect(() => {
    const current = steps[index];
    let raf = 0;
    let prev = "";
    const tick = () => {
      const { el, fallback } = resolveTarget(current);
      const r = el?.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const sig = r ? `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)},${Math.round(r.height)},${vw},${vh},${fallback}` : `-,${vw},${vh}`;
      if (sig !== prev) {
        prev = sig;
        setGeo({ rect: r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null, vw, vh, fallback });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    // Two frames in, the new step's card has been measured — scroll if the target needs it.
    let scroll = requestAnimationFrame(() => {
      scroll = requestAnimationFrame(() => {
        const { el } = resolveTarget(current);
        if (el) bringIntoView(el, sizeRef.current.content + sizeRef.current.footer, current.prefer, reduce);
      });
    });
    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(scroll);
    };
  }, [index, steps, reduce]);

  // Natural height of the step content and footer (the card animates to it).
  useEffect(() => {
    const content = contentRef.current;
    const footer = footerRef.current;
    if (!content || !footer) return;
    const ro = new ResizeObserver(() => {
      const next = { content: content.offsetHeight, footer: footer.offsetHeight };
      sizeRef.current = next;
      setSize((s) => (s.content === next.content && s.footer === next.footer ? s : next));
    });
    ro.observe(content);
    ro.observe(footer);
    return () => ro.disconnect();
  }, []);

  const layout = useMemo(() => {
    if (!geo || !size.content) return null;
    const w = Math.min(CARD_MAX_W, geo.vw - 2 * MARGIN);
    const spot = geo.rect ? spotlightBox(geo.rect, geo.vw, geo.vh) : null;
    const place = placeCard(spot, w, size.content + size.footer, geo.vw, geo.vh, step.prefer);
    return { w, spot, place, vw: geo.vw, vh: geo.vh };
  }, [geo, size, step.prefer]);

  useLayoutEffect(() => {
    if (!layout) return;
    const { spot, place, vw, vh } = layout;
    // No target: the spotlight closes to a point at the center (the whole screen dims).
    const s = spot ?? { x: vw / 2, y: vh / 2, width: 0, height: 0 };
    const pairs: [MotionValue<number>, number][] = [
      [sx, s.x],
      [sy, s.y],
      [sw, s.width],
      [sh, s.height],
      [ring, spot ? 1 : 0],
      [cx, place.x],
      [cy, place.y],
      [ch, size.content],
      [arrowAt, place.arrowOffset],
    ];
    if (!placed.current || reduce) {
      for (const [mv, v] of pairs) mv.jump(v);
    } else {
      for (const [mv, v] of pairs) animate(mv, v, SPRING);
    }
    if (!placed.current) {
      placed.current = true;
      animate(shown, 1, reduce ? { duration: 0 } : { ...SPRING, bounce: 0.25 });
      // The card was `visibility: hidden` until now, so it couldn't take focus earlier.
      primaryRef.current?.focus({ preventScroll: true });
    }
  }, [layout, reduce, size.content, sx, sy, sw, sh, ring, cx, cy, ch, arrowAt, shown]);

  // Keep keyboard focus on the card's main button as steps change.
  useEffect(() => {
    if (!cardRef.current?.contains(document.activeElement)) primaryRef.current?.focus({ preventScroll: true });
  }, [index]);

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

  const arrow = layout?.place.arrow ?? null;
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
        <rect width="100%" height="100%" fill="rgb(2 44 34 / 0.62)" mask={`url(#${maskId})`} />
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
        className="absolute left-0 top-0 rounded-2xl bg-white text-slate-900 shadow-[0_24px_60px_-20px_rgba(2,44,34,.55)] ring-1 ring-emerald-900/10"
        style={{ x: cx, y: cy, width: layout?.w ?? CARD_MAX_W, opacity: shown, scale: cardScale, visibility: layout ? "visible" : "hidden" }}
      >
        <AnimatePresence initial={false}>
          {arrow && (
            <motion.span
              key={arrow}
              aria-hidden
              className="absolute h-3.5 w-3.5 rotate-45 rounded-[3px] bg-white"
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
          className="absolute right-2.5 top-2.5 z-10 grid h-9 w-9 place-items-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
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
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-emerald-50 to-lime-50 text-emerald-700 ring-1 ring-emerald-100">
                    <Icon className="h-5 w-5" />
                  </span>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">
                    Step {index + 1} of {total}
                  </p>
                </div>
                {index === 0 && invitedBy && (
                  <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs text-emerald-800">
                    You were invited by <strong>{invitedBy}</strong>
                  </p>
                )}
                <h2 id={titleId} className="mt-3 text-[17px] font-bold leading-snug text-slate-900">
                  {step.title}
                </h2>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{step.body}</p>
                {step.bullets && (
                  <ul className="mt-3 space-y-1.5">
                    {step.bullets.map((b) => (
                      <li key={b} className="flex gap-2.5 text-sm text-slate-700">
                        <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden />
                        {b}
                      </li>
                    ))}
                  </ul>
                )}
                {geo?.fallback && (
                  <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-100">
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
                className="h-11 flex-1 rounded-full border border-slate-200 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              >
                Back
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onClose()}
                className="h-11 flex-1 rounded-full text-sm font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
              >
                Skip tour
              </button>
            )}
            {!last ? (
              <button
                ref={primaryRef}
                type="button"
                onClick={() => go(1)}
                className="h-11 flex-1 rounded-full bg-emerald-700 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-800"
              >
                {index === 0 ? "Show me around" : "Next"}
              </button>
            ) : hasCity ? (
              <button
                ref={primaryRef}
                type="button"
                onClick={() => onClose()}
                className="h-11 flex-1 rounded-full bg-emerald-700 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-800"
              >
                Start planting
              </button>
            ) : (
              <Link
                ref={primaryRef}
                href="/profile"
                onClick={() => onClose(true)}
                className="grid h-11 flex-1 place-items-center rounded-full bg-emerald-700 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-800"
              >
                Set my city
              </Link>
            )}
          </div>
          <div className="mt-4 h-1 overflow-hidden rounded-full bg-slate-100" aria-hidden>
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
