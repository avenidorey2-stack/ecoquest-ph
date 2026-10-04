"use client";

import { AnimatePresence, LayoutGroup, MotionConfig, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PhotoCredit } from "@/data/tree-photos";
import { formatPesos } from "@/lib/format";
import OrderSeedlingForm, { type DeliveryDefaults, type PlacedOrder } from "@/components/shop/OrderSeedlingForm";
import { ORDER_COOLDOWN_SECONDS } from "@/lib/delivery";
import { Credit } from "@/components/trees/TreeDirectory";
import { CloseIcon, CoinIcon } from "@/components/ui/icons";

export type ShopProduct = {
  id: string;
  name: string;
  scientificName: string;
  category: string;
  /** Card-size image (photo, or the generated illustration when there's no photo). */
  cardImage: string;
  /** Full-size image for the order sheet. */
  fullImage: string;
  credit: PhotoCredit | null;
  priceInPoints: number;
  /** Cash-on-delivery price; 0 = points only. */
  priceInPesos: number;
  stockQuantity: number;
};

const LOW_STOCK = 10;

/** Same spring as the Tree Directory morph, so the two pages feel alike. */
const MORPH = { type: "spring", bounce: 0.16, visualDuration: 0.5 } as const;

const fmt = (n: number) => n.toLocaleString("en-PH");

function StockBadge({ stock }: { stock: number }) {
  if (stock < 1) {
    return <span className="rounded-full bg-red-500/80 px-2 py-0.5 text-[10px] font-semibold text-white ring-1 ring-red-300/30 backdrop-blur">Sold out</span>;
  }
  if (stock <= LOW_STOCK) {
    return <span className="rounded-full bg-amber-400/90 px-2 py-0.5 text-[10px] font-semibold text-amber-950 backdrop-blur">Only {fmt(stock)} left</span>;
  }
  return null;
}

function OrderSheet({
  product,
  balance,
  maxQuantity,
  deliveryDefaults,
  cooldownUntil,
  onPlaced,
  onClose,
}: {
  product: ShopProduct;
  balance: number;
  maxQuantity: number;
  deliveryDefaults: DeliveryDefaults;
  cooldownUntil: number;
  onPlaced: (order: PlacedOrder) => void;
  onClose: () => void;
}) {
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

  const soldOut = product.stockQuantity < 1;

  return (
    <div className="fixed inset-0 z-[2100] m-0 flex items-end justify-center p-0 sm:items-center sm:p-4" onClick={onClose}>
      <motion.div
        className="absolute inset-0 bg-canvas/80 backdrop-blur-md"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: { duration: 0.25 } }}
        aria-hidden
      />
      {/* The sheet shares the tile's layoutId, so the tile itself grows into it. */}
      <motion.div
        layoutId={`seedling-${product.id}`}
        transition={MORPH}
        role="dialog"
        aria-modal="true"
        aria-labelledby="seedling-sheet-title"
        className="relative flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden border border-line bg-card shadow-[0_40px_120px_-30px_rgba(16,185,129,.35)]"
        style={{ borderRadius: 28 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden sm:aspect-[16/10]">
          <motion.img
            layoutId={`seedling-photo-${product.id}`}
            transition={MORPH}
            src={product.fullImage}
            alt={`${product.name} (${product.scientificName})`}
            className={`absolute inset-0 h-full w-full object-cover ${soldOut ? "grayscale" : ""}`}
          />
          <motion.div
            className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-card to-transparent"
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
          <div className="absolute inset-x-0 bottom-0 p-5">
            <motion.span
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0, transition: { delay: 0.2 } }}
              exit={{ opacity: 0, transition: { duration: 0.1 } }}
              className="inline-block max-w-full truncate rounded-full bg-emerald-400/15 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-emerald-300 ring-1 ring-emerald-400/30 backdrop-blur"
            >
              {product.category}
            </motion.span>
            <motion.h2 layoutId={`seedling-name-${product.id}`} transition={MORPH} id="seedling-sheet-title" className="mt-2 w-fit text-3xl font-bold text-white drop-shadow">
              {product.name}
            </motion.h2>
            <motion.p exit={{ opacity: 0, transition: { duration: 0.08 } }} className="text-sm italic text-emerald-100/80">
              {product.scientificName}
            </motion.p>
          </div>
        </div>

        {/* Body content fades up after the frame has mostly morphed. */}
        <motion.div
          className="space-y-4 overflow-y-auto p-5"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0, transition: { delay: 0.18, type: "spring", bounce: 0.2, visualDuration: 0.45 } }}
          exit={{ opacity: 0, transition: { duration: 0.12 } }}
        >
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="flex items-center gap-1.5 text-2xl font-bold text-emerald-300">
                <CoinIcon className="h-5 w-5 text-amber-400" />
                {fmt(product.priceInPoints)}
                <span className="text-sm font-medium text-ink-3">pts each</span>
              </p>
              {product.priceInPesos > 0 && (
                <p className="text-sm text-ink-2">or {formatPesos(product.priceInPesos)} cash on delivery</p>
              )}
            </div>
            <p
              className={`text-right text-xs font-medium ${
                soldOut ? "text-red-400" : product.stockQuantity <= LOW_STOCK ? "text-amber-300" : "text-ink-3"
              }`}
            >
              {soldOut ? "Out of stock" : `${fmt(product.stockQuantity)} available`}
              <span className="block font-normal text-ink-4">You have {fmt(balance)} pts</span>
            </p>
          </div>

          <div className="border-t border-line pt-4">
            <OrderSeedlingForm
              product={{
                id: product.id,
                name: product.name,
                priceInPoints: product.priceInPoints,
                priceInPesos: product.priceInPesos,
                stockQuantity: product.stockQuantity,
              }}
              balance={balance}
              maxQuantity={maxQuantity}
              deliveryDefaults={deliveryDefaults}
              cooldownUntil={cooldownUntil}
              onPlaced={onPlaced}
            />
          </div>

          {product.credit && <Credit credit={product.credit} />}
        </motion.div>
      </motion.div>
    </div>
  );
}

function SeedlingTile({
  product,
  open,
  settling,
  onOpen,
  onSettled,
}: {
  product: ShopProduct;
  open: boolean;
  /** The sheet just closed: the tile is morphing back, so its text waits until it lands. */
  settling: boolean;
  onOpen: (el: HTMLButtonElement) => void;
  onSettled: () => void;
}) {
  const soldOut = product.stockQuantity < 1;
  return (
    <motion.button
      type="button"
      layoutId={`seedling-${product.id}`}
      transition={MORPH}
      onClick={(e) => onOpen(e.currentTarget)}
      onLayoutAnimationComplete={() => settling && onSettled()}
      aria-haspopup="dialog"
      aria-label={`${product.name}, ${fmt(product.priceInPoints)} points${soldOut ? ", sold out" : ""} — order`}
      // While its sheet is open the tile stays in the grid (holding its place) but hidden.
      style={{ borderRadius: 24, visibility: open ? "hidden" : "visible" }}
      className="group relative block aspect-[4/5] w-full overflow-hidden text-left ring-1 ring-white/10 transition-shadow duration-300 hover:shadow-[0_24px_60px_-20px_rgba(16,185,129,.45)] hover:ring-emerald-400/40 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-400"
    >
      <motion.img
        layoutId={`seedling-photo-${product.id}`}
        transition={MORPH}
        src={product.cardImage}
        alt=""
        loading="lazy"
        className={`absolute inset-0 h-full w-full object-cover transition-[scale] duration-700 ease-out group-hover:scale-[1.06] ${soldOut ? "grayscale" : ""}`}
      />
      {/* Shade only behind the text strips, so the middle of the photo stays clear. */}
      <div className="absolute inset-x-0 top-0 h-2/5 bg-gradient-to-b from-black/70 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/85 to-transparent" />
      <motion.div
        className="absolute inset-0"
        initial={false}
        animate={{ opacity: settling ? 0 : 1 }}
        transition={{ duration: settling ? 0 : 0.25 }}
      >
        <div className="absolute inset-x-0 top-0 p-3.5 sm:p-4">
          <motion.h3 layoutId={`seedling-name-${product.id}`} transition={MORPH} className="w-fit text-lg font-bold leading-tight text-white drop-shadow sm:text-xl">
            {product.name}
          </motion.h3>
          <p className="mt-0.5 truncate text-[11px] italic text-ink/90 drop-shadow sm:text-xs">{product.scientificName}</p>
          {product.credit?.shows && (
            <span className="mt-1.5 inline-block rounded-full bg-black/45 px-2 py-0.5 text-[10px] font-medium text-white/85 ring-1 ring-white/15 backdrop-blur">
              Related species
            </span>
          )}
        </div>
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-3.5 sm:p-4">
          <div className="min-w-0">
            <div className="mb-1.5">
              <StockBadge stock={product.stockQuantity} />
            </div>
            <p className="flex items-center gap-1 text-lg font-bold leading-none text-white">
              <CoinIcon className="h-4 w-4 shrink-0 text-amber-300" />
              {fmt(product.priceInPoints)}
              <span className="text-xs font-medium text-emerald-100/80">pts</span>
            </p>
            {product.priceInPesos > 0 && (
              <p className="mt-1 truncate text-[11px] font-medium text-ink/90">or {formatPesos(product.priceInPesos)} COD</p>
            )}
          </div>
          <span
            aria-hidden
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-400 text-xl font-semibold leading-none text-emerald-950 transition-transform duration-300 group-hover:scale-110"
          >
            +
          </span>
        </div>
      </motion.div>
    </motion.button>
  );
}

/** Seedling grid of compact photo tiles; tapping one grows it into an order sheet. */
export default function SeedlingShop({
  products,
  balance,
  maxQuantity,
  deliveryDefaults,
  cooldownUntil: serverCooldownUntil,
}: {
  products: ShopProduct[];
  balance: number;
  maxQuantity: number;
  /** Pre-fills the delivery form (last order's details, else the profile). */
  deliveryDefaults: DeliveryDefaults;
  /** Epoch ms until which ordering is paused after the planter's last order. */
  cooldownUntil: number;
}) {
  // The order just placed (shows the "order complete" banner) and the cooldown it started.
  const [placed, setPlaced] = useState<PlacedOrder | null>(null);
  const [localCooldownUntil, setLocalCooldownUntil] = useState(0);
  const cooldownUntil = Math.max(serverCooldownUntil, localCooldownUntil);
  // Kept by id: ordering refreshes the page data, and the sheet should show the new stock.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [settling, setSettling] = useState<string | null>(null);
  const selected = products.find((p) => p.id === selectedId) ?? null;
  // Return focus to the tile that opened the sheet, once it has morphed back into place.
  const opener = useRef<HTMLButtonElement | null>(null);
  const settleTimer = useRef(0);
  const settled = useCallback(() => {
    window.clearTimeout(settleTimer.current);
    setSettling(null);
    opener.current?.focus({ preventScroll: true });
  }, []);
  // Stable identity: the sheet's keyboard/focus effect depends on it.
  const close = useCallback(() => {
    setSelectedId((current) => {
      if (current) setSettling(current);
      return null;
    });
    // Fallback for when no layout animation runs (reduced motion): settle anyway.
    window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(settled, 900);
  }, [settled]);
  useEffect(() => () => window.clearTimeout(settleTimer.current), []);

  // Order confirmed: back to the shop, with a banner, and a pause before the next order.
  const onPlaced = useCallback(
    (order: PlacedOrder) => {
      setPlaced(order);
      setLocalCooldownUntil(Date.now() + ORDER_COOLDOWN_SECONDS * 1000);
      close();
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [close],
  );

  return (
    <MotionConfig reducedMotion="user">
      <LayoutGroup>
        <AnimatePresence>
          {placed && (
            <motion.div
              key="placed"
              role="status"
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="mb-4 flex items-start gap-3 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm text-emerald-50"
            >
              <span className="text-2xl leading-none" aria-hidden>
                🎉
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ink">Your order is complete!</p>
                <p className="mt-0.5 text-ink-2">
                  {placed.quantity} × {placed.name} · {placed.total}
                  {placed.cod ? " — pay cash on delivery" : ""}.
                </p>
                <p className="mt-1 text-ink-3">
                  It&apos;s waiting for our team to confirm it. We&apos;ll notify you once it&apos;s being packed — then it
                  arrives within 5–7 days.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPlaced(null)}
                aria-label="Dismiss"
                className="-mr-2 -mt-2 grid h-11 w-11 shrink-0 place-items-center rounded-xl text-ink-3 hover:bg-card-2 hover:text-ink"
              >
                ✕
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        <ul className="eq-stagger eq-spring grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
          {products.map((p) => (
            <li key={p.id}>
              <SeedlingTile
                product={p}
                open={selectedId === p.id}
                settling={settling === p.id}
                onSettled={settled}
                onOpen={(el) => {
                  opener.current = el;
                  setSelectedId(p.id);
                }}
              />
            </li>
          ))}
        </ul>

        <AnimatePresence>
          {selected && <OrderSheet
              key={selected.id}
              product={selected}
              balance={balance}
              maxQuantity={maxQuantity}
              deliveryDefaults={deliveryDefaults}
              cooldownUntil={cooldownUntil}
              onPlaced={onPlaced}
              onClose={close}
            />}
        </AnimatePresence>
      </LayoutGroup>
    </MotionConfig>
  );
}
