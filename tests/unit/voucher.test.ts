import { describe, expect, it } from "vitest";
import { MAX_VALUE_PESOS, amountFontSize, parseWholeNumber, voucherAmount, voucherTheme } from "@/lib/voucher";

describe("voucherAmount", () => {
  it.each([
    [1, "₱1"],
    [50, "₱50"],
    [300, "₱300"],
    [1000, "₱1,000"],
    [100_000, "₱100,000"],
  ])("prints %d as %s", (value, label) => {
    expect(voucherAmount(value)).toBe(label);
  });

  it.each([0, -5, 12.5, NaN])("has no label for %d", (value) => {
    expect(voucherAmount(value)).toBeNull();
  });
});

describe("parseWholeNumber", () => {
  it("accepts whole numbers in range, ignoring surrounding spaces", () => {
    expect(parseWholeNumber("300", 1, MAX_VALUE_PESOS)).toBe(300);
    expect(parseWholeNumber(" 300 ", 1, MAX_VALUE_PESOS)).toBe(300);
    expect(parseWholeNumber("100000", 1, MAX_VALUE_PESOS)).toBe(100_000);
  });

  it.each(["", "0", "100001", "12.5", "-3", "1e3", "abc", "3 00"])("rejects %j", (input) => {
    expect(parseWholeNumber(input, 1, MAX_VALUE_PESOS)).toBeNull();
  });
});

describe("amountFontSize", () => {
  it("keeps short amounts big and shrinks long ones so they fit", () => {
    expect(amountFontSize("₱50")).toBe(21);
    expect(amountFontSize("₱100,000")).toBeLessThan(amountFontSize("₱300"));
    // 8 characters at ~0.6em each stay inside the card's width.
    expect(amountFontSize("₱100,000") * 8 * 0.6).toBeLessThanOrEqual(90);
  });
});

describe("voucherTheme", () => {
  it("has a theme for every brand, with a fallback", () => {
    for (const brand of ["GCash", "Maya", "Grab", "Shopee"]) expect(voucherTheme(brand)).not.toEqual(voucherTheme("Other"));
    expect(voucherTheme("Other").background).toContain("gradient");
  });
});
