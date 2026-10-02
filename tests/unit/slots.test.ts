import { describe, expect, it } from "vitest";
import { parseSlotCreate, parseSlotUpdate } from "@/lib/slots";

const valid = {
  latitude: 14.676,
  longitude: 121.0437,
  cityCode: "137404000",
  requiredPlantType: "Narra",
  pointsPerPlant: 10,
};

describe("parseSlotCreate", () => {
  it("expands cityCode to canonical PSGC names and trims text", () => {
    const result = parseSlotCreate({ ...valid, requiredPlantType: "  Narra  " });
    expect(result).toEqual({
      ok: true,
      data: {
        ...valid,
        region: "National Capital Region",
        province: "Metro Manila",
        city: "Quezon City",
      },
    });
  });

  it("ignores client-sent place names in favour of the PSGC code", () => {
    const result = parseSlotCreate({ ...valid, city: "Somewhere Else", region: "X" });
    expect(result).toMatchObject({ ok: true, data: { city: "Quezon City", region: "National Capital Region" } });
  });

  it("does not let a status through on create", () => {
    const result = parseSlotCreate({ ...valid, status: "CLOSED" });
    expect(result.ok && "status" in result.data).toBe(false);
  });

  it("requires coordinates inside the Philippines", () => {
    expect(parseSlotCreate({ ...valid, latitude: "14" }).ok).toBe(false);
    expect(parseSlotCreate({ ...valid, latitude: 1.35, longitude: 103.8 })).toMatchObject({
      ok: false,
      error: expect.stringMatching(/Philippines/),
    });
  });

  it.each(["cityCode", "requiredPlantType", "pointsPerPlant"])("requires %s", (field) => {
    const payload: Record<string, unknown> = { ...valid };
    delete payload[field];
    expect(parseSlotCreate(payload)).toMatchObject({ ok: false, error: `${field} is required.` });
  });

  it("rejects unknown city codes", () => {
    expect(parseSlotCreate({ ...valid, cityCode: "000000000" }).ok).toBe(false);
  });
});

describe("parseSlotUpdate", () => {
  it("returns only provided fields", () => {
    expect(parseSlotUpdate({ pointsPerPlant: 25, status: "FULL" })).toEqual({
      ok: true,
      data: { pointsPerPlant: 25, status: "FULL" },
    });
  });

  it.each([0, -5, 1.5, 10_001, "10"])("rejects pointsPerPlant = %s", (pointsPerPlant) => {
    expect(parseSlotUpdate({ pointsPerPlant }).ok).toBe(false);
  });

  it("rejects blank plant types and unknown statuses", () => {
    expect(parseSlotUpdate({ requiredPlantType: "   " }).ok).toBe(false);
    expect(parseSlotUpdate({ status: "DELETED" }).ok).toBe(false);
  });

  it("ignores coordinates and free-text place names", () => {
    expect(parseSlotUpdate({ latitude: 10, longitude: 120, city: "X" })).toEqual({ ok: true, data: {} });
  });
});
