import { describe, expect, it } from "vitest";
import { deliveryWindow, formatBarangay, formatPhMobile, normalizePhMobile, parseDeliveryDetails } from "@/lib/delivery";

const VALID = {
  recipientName: "  Juan   Dela Cruz ",
  contactNumber: "+63 917-123-4567",
  streetAddress: "12 Mabini St.",
  barangay: "San Roque",
  cityProvince: "Quezon City",
  landmark: "Beside the barangay hall",
  instructions: "",
};

describe("normalizePhMobile", () => {
  it("accepts the common ways people write a PH mobile number", () => {
    for (const n of ["09171234567", "0917 123 4567", "0917-123-4567", "+639171234567", "639171234567", "9171234567", "(0917) 123 4567"]) {
      expect(normalizePhMobile(n), n).toBe("09171234567");
    }
  });
  it("rejects landlines, short numbers and junk", () => {
    for (const n of ["028123456", "0917123456", "091712345678", "08171234567", "abc", "", null, 9171234567]) {
      expect(normalizePhMobile(n), String(n)).toBeNull();
    }
  });
  it("formats for display", () => {
    expect(formatPhMobile("09171234567")).toBe("0917 123 4567");
  });
});

describe("parseDeliveryDetails", () => {
  it("cleans the details and normalises the number", () => {
    expect(parseDeliveryDetails(VALID)).toEqual({
      ok: true,
      data: { ...VALID, recipientName: "Juan Dela Cruz", contactNumber: "09171234567", instructions: null },
    });
  });

  it("requires every field except instructions", () => {
    for (const key of ["recipientName", "streetAddress", "barangay", "cityProvince", "landmark"] as const) {
      const result = parseDeliveryDetails({ ...VALID, [key]: "  " });
      expect(result.ok, key).toBe(false);
      if (!result.ok) expect(result.error, key).toMatch(/is required/);
    }
    expect(parseDeliveryDetails({ ...VALID, contactNumber: "" })).toMatchObject({ ok: false, error: expect.stringMatching(/mobile number/) });
    expect(parseDeliveryDetails(undefined)).toMatchObject({ ok: false });
  });

  it("limits lengths", () => {
    expect(parseDeliveryDetails({ ...VALID, landmark: "x".repeat(121) })).toMatchObject({ ok: false });
    expect(parseDeliveryDetails({ ...VALID, instructions: "x".repeat(301) })).toMatchObject({ ok: false });
    expect(parseDeliveryDetails({ ...VALID, instructions: "Leave with the guard" })).toMatchObject({
      ok: true,
      data: { instructions: "Leave with the guard" },
    });
  });
});

describe("deliveryWindow", () => {
  it("is 5–7 days after packing, in Philippine time", () => {
    expect(deliveryWindow(new Date("2026-10-05T02:00:00Z"))).toBe("Oct 10–12");
    // 11 pm UTC on Oct 4 is already Oct 5 in Manila.
    expect(deliveryWindow(new Date("2026-10-04T23:00:00Z"))).toBe("Oct 10–12");
  });
  it("spells out both months when the window crosses a month", () => {
    expect(deliveryWindow(new Date("2026-10-26T02:00:00Z"))).toBe("Oct 31 – Nov 2");
  });
});

describe("formatBarangay", () => {
  it("adds Brgy. unless it's already there", () => {
    expect(formatBarangay("San Roque")).toBe("Brgy. San Roque");
    expect(formatBarangay("Brgy. San Roque")).toBe("Brgy. San Roque");
    expect(formatBarangay("Barangay 143")).toBe("Barangay 143");
  });
});
