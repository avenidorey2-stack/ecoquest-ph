// Cash-on-delivery details for seedling orders, and the delivery promise shown to planters.
// Client and server safe (no database access).

/** After placing an order, a planter waits this long before the next one (stops accidental repeats). */
export const ORDER_COOLDOWN_SECONDS = 30;

/** Planters are promised delivery this many days after our team packs the order. */
export const DELIVERY_DAYS = { min: 5, max: 7 } as const;

export type DeliveryDetails = {
  recipientName: string;
  /** Philippine mobile number, normalised to 09XXXXXXXXX. */
  contactNumber: string;
  streetAddress: string;
  barangay: string;
  cityProvince: string;
  landmark: string;
  instructions: string | null;
};

type Field = Exclude<keyof DeliveryDetails, "contactNumber" | "instructions">;

/** Required text fields: label for errors, and allowed length. */
const TEXT_FIELDS: Record<Field, { label: string; min: number; max: number }> = {
  recipientName: { label: "Recipient name", min: 2, max: 80 },
  streetAddress: { label: "House no. / street", min: 3, max: 160 },
  barangay: { label: "Barangay", min: 2, max: 80 },
  cityProvince: { label: "City / province", min: 2, max: 80 },
  landmark: { label: "Landmark", min: 3, max: 120 },
};
export const MAX_INSTRUCTIONS = 300;

/** Collapses runs of whitespace and trims. */
const clean = (value: unknown) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "");

/** "0917 123 4567", "+63 917-123-4567", "639171234567" → "09171234567"; null if not a PH mobile. */
export function normalizePhMobile(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const digits = value.replace(/[\s\-().]/g, "");
  const m = /^(?:\+?63|0)?(9\d{9})$/.exec(digits);
  return m ? `0${m[1]}` : null;
}

/** "09171234567" → "0917 123 4567" */
export function formatPhMobile(number: string) {
  return /^09\d{9}$/.test(number) ? `${number.slice(0, 4)} ${number.slice(4, 7)} ${number.slice(7)}` : number;
}

/** "San Roque" → "Brgy. San Roque"; left as typed when it already says Brgy./Barangay. */
export function formatBarangay(name: string) {
  return /^(brgy\.?|bgy\.?|barangay)\s/i.test(name) ? name : `Brgy. ${name}`;
}

/** Validates checkout delivery details; returns the cleaned values or the first problem. */
export function parseDeliveryDetails(body: unknown): { ok: true; data: DeliveryDetails } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Please fill in your delivery details." };
  const input = body as Record<string, unknown>;

  const text = {} as Record<Field, string>;
  for (const [key, { label, min, max }] of Object.entries(TEXT_FIELDS) as [Field, (typeof TEXT_FIELDS)[Field]][]) {
    const value = clean(input[key]);
    if (value.length < min) return { ok: false, error: `${label} is required.` };
    if (value.length > max) return { ok: false, error: `${label} must be at most ${max} characters.` };
    text[key] = value;
  }

  const contactNumber = normalizePhMobile(input.contactNumber);
  if (!contactNumber) return { ok: false, error: "Enter a Philippine mobile number, e.g. 0917 123 4567." };

  const instructions = clean(input.instructions);
  if (instructions.length > MAX_INSTRUCTIONS) {
    return { ok: false, error: `Delivery instructions must be at most ${MAX_INSTRUCTIONS} characters.` };
  }

  return { ok: true, data: { ...text, contactNumber, instructions: instructions || null } };
}

const DAY_MS = 86_400_000;
const manila = (date: Date, options: Intl.DateTimeFormatOptions) =>
  date.toLocaleDateString("en-PH", { timeZone: "Asia/Manila", ...options });

/** Expected delivery window for an order packed at `packedAt`, e.g. "Oct 10–12" or "Oct 30 – Nov 1". */
export function deliveryWindow(packedAt: Date | string): string {
  const packed = new Date(packedAt).getTime();
  const from = new Date(packed + DELIVERY_DAYS.min * DAY_MS);
  const to = new Date(packed + DELIVERY_DAYS.max * DAY_MS);
  const sameMonth = manila(from, { month: "short", year: "numeric" }) === manila(to, { month: "short", year: "numeric" });
  return sameMonth
    ? `${manila(from, { month: "short", day: "numeric" })}–${manila(to, { day: "numeric" })}`
    : `${manila(from, { month: "short", day: "numeric" })} – ${manila(to, { month: "short", day: "numeric" })}`;
}
