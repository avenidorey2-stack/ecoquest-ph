import type { RewardType } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { recordTransaction } from "@/lib/transactions";
import { MAX_COST_POINTS, MAX_VALUE_PESOS } from "@/lib/voucher";

export const BRANDS: Record<RewardType, readonly string[]> = {
  EWALLET_CASH: ["GCash", "Maya"],
  VOUCHER: ["Grab", "Shopee"],
};

/** Max redemption requests a user can have awaiting fulfilment at once. */
export const MAX_PENDING_REDEMPTIONS = 3;

export class RedeemError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

/**
 * Normalizes a Philippine mobile number to 09XXXXXXXXX.
 * Accepts 09171234567, 9171234567, +639171234567, 639171234567, with spaces/dashes.
 */
export function normalizePhMobile(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const digits = input.replace(/[\s\-()]/g, "").replace(/^\+/, "");
  const match = digits.match(/^(?:63|0)?(9\d{9})$/);
  return match ? `0${match[1]}` : null;
}

type RewardFields = { rewardType: RewardType; brand: string; costPoints: number; valuePesos: number; isActive: boolean };
type Result<T> = { ok: true; data: T } | { ok: false; error: string };

function isIntInRange(value: unknown, min: number, max: number): value is number {
  return Number.isInteger(value) && (value as number) >= min && (value as number) <= max;
}

/** Validates a reward payload. With `partial`, only provided fields are checked/returned. */
export function parseReward(
  body: Record<string, unknown>,
  { partial = false, current }: { partial?: boolean; current?: { rewardType: RewardType } } = {},
): Result<Partial<RewardFields>> {
  const data: Partial<RewardFields> = {};
  const has = (key: string) => body[key] !== undefined;
  const required = (key: string) => !partial && !has(key);

  if (has("rewardType")) {
    if (body.rewardType !== "EWALLET_CASH" && body.rewardType !== "VOUCHER") {
      return { ok: false, error: "rewardType must be EWALLET_CASH or VOUCHER." };
    }
    data.rewardType = body.rewardType;
  } else if (required("rewardType")) return { ok: false, error: "rewardType is required." };

  const type = data.rewardType ?? current?.rewardType;
  if (has("brand") || data.rewardType) {
    // Brand must fit the (new or existing) type, so changing type requires a matching brand.
    if (!type || !BRANDS[type].includes(body.brand as string)) {
      return { ok: false, error: `brand must be one of: ${type ? BRANDS[type].join(", ") : "…"}.` };
    }
    data.brand = body.brand as string;
  } else if (required("brand")) return { ok: false, error: "brand is required." };

  if (has("costPoints")) {
    if (!isIntInRange(body.costPoints, 1, MAX_COST_POINTS)) {
      return { ok: false, error: `costPoints must be an integer from 1 to ${MAX_COST_POINTS}.` };
    }
    data.costPoints = body.costPoints;
  } else if (required("costPoints")) return { ok: false, error: "costPoints is required." };

  if (has("valuePesos")) {
    if (!isIntInRange(body.valuePesos, 1, MAX_VALUE_PESOS)) {
      return { ok: false, error: `valuePesos must be an integer from 1 to ${MAX_VALUE_PESOS}.` };
    }
    data.valuePesos = body.valuePesos;
  } else if (required("valuePesos")) return { ok: false, error: "valuePesos is required." };

  if (has("isActive")) {
    if (typeof body.isActive !== "boolean") return { ok: false, error: "isActive must be true or false." };
    data.isActive = body.isActive;
  }

  return { ok: true, data };
}

/**
 * Redeems a reward: deducts its cost from the user's balance and files a PENDING request
 * for an admin to fulfil. Points are refunded if the admin rejects it.
 */
export async function redeemReward(userId: string, rewardId: string, rawEWalletNumber?: unknown) {
  return prisma.$transaction(async (tx) => {
    const reward = await tx.reward.findUnique({ where: { id: rewardId } });
    if (!reward || !reward.isActive) throw new RedeemError("This reward is not available.", 404);

    let eWalletNumber: string | null = null;
    if (reward.rewardType === "EWALLET_CASH") {
      eWalletNumber = normalizePhMobile(rawEWalletNumber);
      if (!eWalletNumber) {
        throw new RedeemError(`Enter the ${reward.brand} mobile number to send the cash to (e.g. 0917 123 4567).`, 400);
      }
    }

    // Guarded decrement: the balance can never go negative, even with concurrent requests.
    const { count } = await tx.user.updateMany({
      where: { id: userId, points: { gte: reward.costPoints } },
      data: { points: { decrement: reward.costPoints } },
    });
    if (count === 0) throw new RedeemError("Not enough points for this reward.", 400);

    // Counted after the decrement, which row-locks the user: concurrent redeems by the same user
    // queue up here and each sees the others' committed requests, so the cap can't be overshot.
    const pending = await tx.redemptionHistory.count({ where: { userId, status: "PENDING" } });
    if (pending >= MAX_PENDING_REDEMPTIONS) {
      throw new RedeemError(
        `You already have ${pending} requests being processed. Please wait for them to be fulfilled.`,
        409,
      );
    }

    const redemption = await tx.redemptionHistory.create({
      data: { userId, rewardId, eWalletNumber, pointsSpent: reward.costPoints },
      include: { reward: true },
    });
    await recordTransaction(tx, {
      userId,
      kind: "REWARD_REDEMPTION",
      currency: "POINTS",
      amount: reward.costPoints,
      description: `₱${reward.valuePesos.toLocaleString("en-PH")} ${reward.brand} ${reward.rewardType === "VOUCHER" ? "voucher" : "cashout"}`,
      redemptionId: redemption.id,
    });
    return redemption;
  });
}
