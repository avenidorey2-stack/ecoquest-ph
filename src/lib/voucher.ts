// Display helpers for the reward voucher art (src/components/rewards/VoucherArt.tsx), plus the
// reward limits the admin form checks as you type. Pure (no database), so they work in the browser.

/** Reward limits, enforced by parseReward in src/lib/rewards.ts. */
export const MAX_COST_POINTS = 1_000_000;
export const MAX_VALUE_PESOS = 100_000;

/** A whole number from `min` to `max` typed into a form field, or null. */
export function parseWholeNumber(input: string, min: number, max: number): number | null {
  if (!/^\s*\d+\s*$/.test(input)) return null;
  const n = Number(input);
  return Number.isSafeInteger(n) && n >= min && n <= max ? n : null;
}

export type VoucherTheme = {
  /** Card background. */
  background: string;
  /** Brand colour for the icon and the text on the light bottom band. */
  accent: string;
};

const THEMES: Record<string, VoucherTheme> = {
  GCash: { background: "linear-gradient(135deg, #0a52c9 0%, #1673f5 55%, #4b9dff 100%)", accent: "#0b5ed7" },
  Maya: { background: "linear-gradient(135deg, #050806 0%, #10241a 55%, #0e4a2c 100%)", accent: "#0a9d55" },
  Grab: { background: "linear-gradient(135deg, #00873c 0%, #00b14f 55%, #3ed67f 100%)", accent: "#00873c" },
  Shopee: { background: "linear-gradient(135deg, #d9361a 0%, #ee4d2d 55%, #ff8150 100%)", accent: "#d73211" },
};

const FALLBACK: VoucherTheme = { background: "linear-gradient(135deg, #065f46 0%, #059669 55%, #34d399 100%)", accent: "#047857" };

export function voucherTheme(brand: string): VoucherTheme {
  return THEMES[brand] ?? FALLBACK;
}

/** Face value as printed on the card: 300 → "₱300", 100000 → "₱100,000". Null when not a valid amount. */
export function voucherAmount(valuePesos: number): string | null {
  if (!Number.isInteger(valuePesos) || valuePesos < 1) return null;
  return `₱${valuePesos.toLocaleString("en-PH")}`;
}

/**
 * Font size for the amount, in container-width units: as big as fits, so "₱50" is bold and
 * "₱100,000" still fits on one line.
 */
export function amountFontSize(label: string): number {
  return Math.min(21, 128 / Math.max(label.length, 1));
}
