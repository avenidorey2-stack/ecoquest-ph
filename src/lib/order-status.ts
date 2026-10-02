import type { OrderStatus } from "@/generated/prisma/enums";

// Display text and badge colours for seedling order statuses (server and client safe).

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: "Pending",
  PACKED: "Packed",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

export const ORDER_STATUS_STYLES: Record<OrderStatus, string> = {
  PENDING: "bg-amber-50 text-amber-800 ring-amber-200",
  PACKED: "bg-sky-50 text-sky-800 ring-sky-200",
  OUT_FOR_DELIVERY: "bg-indigo-50 text-indigo-800 ring-indigo-200",
  DELIVERED: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  CANCELLED: "bg-slate-100 text-slate-600 ring-slate-200",
};

/** The fulfilment steps a customer sees, in order (CANCELLED is shown separately). */
export const ORDER_STEPS: OrderStatus[] = ["PENDING", "PACKED", "OUT_FOR_DELIVERY", "DELIVERED"];
