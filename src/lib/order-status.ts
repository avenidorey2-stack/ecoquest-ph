import type { OrderStatus } from "@/generated/prisma/enums";

// Display text and badge colours for seedling order statuses (server and client safe).

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: "Awaiting Confirmation",
  PACKED: "Packing",
  OUT_FOR_DELIVERY: "Out for Delivery",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

export const ORDER_STATUS_STYLES: Record<OrderStatus, string> = {
  PENDING: "bg-amber-400/10 text-amber-300 ring-amber-400/30",
  PACKED: "bg-sky-400/10 text-sky-300 ring-sky-400/30",
  OUT_FOR_DELIVERY: "bg-indigo-50 text-indigo-800 ring-indigo-200",
  DELIVERED: "bg-emerald-400/10 text-emerald-300 ring-emerald-400/20",
  CANCELLED: "bg-card-2 text-ink-2 ring-line",
};

/** The fulfilment steps a customer sees, in order (CANCELLED is shown separately). */
export const ORDER_STEPS: OrderStatus[] = ["PENDING", "PACKED", "OUT_FOR_DELIVERY", "DELIVERED"];
