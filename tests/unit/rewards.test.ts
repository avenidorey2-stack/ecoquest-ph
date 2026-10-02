import { describe, expect, it } from "vitest";
import { normalizePhMobile, parseReward } from "@/lib/rewards";

describe("normalizePhMobile", () => {
  it.each([
    ["09171234567", "09171234567"],
    ["0917 123 4567", "09171234567"],
    ["0917-123-4567", "09171234567"],
    ["9171234567", "09171234567"],
    ["+639171234567", "09171234567"],
    ["639171234567", "09171234567"],
    ["+63 (917) 123-4567", "09171234567"],
  ])("%s → %s", (input, expected) => {
    expect(normalizePhMobile(input)).toBe(expected);
  });

  it.each(["", "0917123456", "091712345678", "08171234567", "0281234567", "abc", undefined, 9171234567])(
    "rejects %j",
    (input) => {
      expect(normalizePhMobile(input)).toBeNull();
    },
  );
});

describe("parseReward", () => {
  const valid = { rewardType: "EWALLET_CASH", brand: "GCash", costPoints: 500, valuePesos: 50 };

  it("accepts a complete reward", () => {
    expect(parseReward(valid)).toEqual({ ok: true, data: valid });
  });

  it.each(["rewardType", "brand", "costPoints", "valuePesos"])("requires %s on create", (field) => {
    const body: Record<string, unknown> = { ...valid };
    delete body[field];
    expect(parseReward(body).ok).toBe(false);
  });

  it("only allows brands that match the type", () => {
    expect(parseReward({ ...valid, brand: "Shopee" }).ok).toBe(false);
    expect(parseReward({ ...valid, rewardType: "VOUCHER", brand: "Shopee" }).ok).toBe(true);
    expect(parseReward({ ...valid, brand: "PayPal" }).ok).toBe(false);
  });

  it.each([0, -1, 2.5, "500", 1_000_001])("rejects costPoints = %j", (costPoints) => {
    expect(parseReward({ ...valid, costPoints }).ok).toBe(false);
  });

  it("partial updates return only provided fields", () => {
    expect(parseReward({ costPoints: 750 }, { partial: true, current: { rewardType: "VOUCHER" } })).toEqual({
      ok: true,
      data: { costPoints: 750 },
    });
    expect(parseReward({ isActive: false }, { partial: true })).toEqual({ ok: true, data: { isActive: false } });
  });

  it("validates a brand change against the existing type, and requires a brand when the type changes", () => {
    const current = { rewardType: "EWALLET_CASH" as const };
    expect(parseReward({ brand: "Maya" }, { partial: true, current }).ok).toBe(true);
    expect(parseReward({ brand: "Grab" }, { partial: true, current }).ok).toBe(false);
    expect(parseReward({ rewardType: "VOUCHER" }, { partial: true, current }).ok).toBe(false);
    expect(parseReward({ rewardType: "VOUCHER", brand: "Grab" }, { partial: true, current }).ok).toBe(true);
  });

  it("requires isActive to be a boolean", () => {
    expect(parseReward({ isActive: "no" }, { partial: true }).ok).toBe(false);
  });
});
