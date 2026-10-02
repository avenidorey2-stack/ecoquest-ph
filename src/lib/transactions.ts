import type { Currency, Prisma, TransactionKind } from "@/generated/prisma/client";

/**
 * Appends a row to the user's unified history (seedling orders, reward redemptions, refunds).
 * Call inside the same transaction as the order/redemption/refund it records.
 */
export function recordTransaction(
  tx: Prisma.TransactionClient,
  data: {
    userId: string;
    kind: TransactionKind;
    currency: Currency;
    amount: number;
    description: string;
    orderId?: string;
    redemptionId?: string;
  },
) {
  return tx.transaction.create({ data });
}
