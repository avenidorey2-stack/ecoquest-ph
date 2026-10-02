import { describe, expect, it } from "vitest";
import { isInsidePhilippines, isWithinUserCity, pickAdministrativeBoundary } from "@/lib/geo";

describe("pickAdministrativeBoundary", () => {
  const polygon = { type: "Polygon" as const, coordinates: [[[123.8, 10.3], [123.9, 10.3], [123.9, 10.4], [123.8, 10.3]]] };
  const point = { type: "Point" as const, coordinates: [123.9, 10.3] };
  // Real-world shapes of Nominatim hits (trimmed).
  const university = { category: "amenity", type: "university", place_rank: 30, display_name: "University of Southern Philippines Foundation, Cebu City", geojson: polygon };
  const barangay = { category: "boundary", type: "administrative", place_rank: 20, display_name: "San Jose, Santo Tomas, Batangas", geojson: polygon };
  const cebuCity = { category: "boundary", type: "administrative", place_rank: 12, display_name: "Cebu City, Central Visayas, Philippines", geojson: polygon };

  it("never uses a building or a barangay as the city outline", () => {
    expect(pickAdministrativeBoundary([university, barangay])).toBeNull();
  });

  it("picks the city-level administrative boundary even when it isn't the first hit", () => {
    expect(pickAdministrativeBoundary([university, barangay, cebuCity])).toBe(polygon);
  });

  it("ignores point geometries and malformed responses", () => {
    expect(pickAdministrativeBoundary([{ ...cebuCity, geojson: point }])).toBeNull();
    expect(pickAdministrativeBoundary(null)).toBeNull();
    expect(pickAdministrativeBoundary({ error: "rate limited" })).toBeNull();
  });

  it("with mustMention, only accepts a hit in the expected province/region", () => {
    expect(pickAdministrativeBoundary([cebuCity], ["Cebu", "Central Visayas"])).toBe(polygon);
    expect(pickAdministrativeBoundary([cebuCity], ["Batangas", "CALABARZON"])).toBeNull();
  });
});

describe("isWithinUserCity", () => {
  it("matches on PSGC city code", () => {
    expect(isWithinUserCity({ cityCode: "041022000" }, { cityCode: "041022000" })).toBe(true);
  });

  it("rejects a same-named city in a different province (different code)", () => {
    // San Jose, Batangas vs San Jose, Tarlac
    expect(isWithinUserCity({ cityCode: "041022000" }, { cityCode: "036918000" })).toBe(false);
  });

  it("rejects users without a home city", () => {
    expect(isWithinUserCity({ cityCode: null }, { cityCode: "041022000" })).toBe(false);
    expect(isWithinUserCity({ cityCode: "" }, { cityCode: "" })).toBe(false);
  });
});

describe("isInsidePhilippines", () => {
  it.each([
    [14.5995, 120.9842, true], // Manila
    [7.0731, 125.6128, true], // Davao
    [1.3521, 103.8198, false], // Singapore
    [35.6762, 139.6503, false], // Tokyo
  ])("(%f, %f) → %s", (lat, lng, expected) => {
    expect(isInsidePhilippines(lat, lng)).toBe(expected);
  });
});
