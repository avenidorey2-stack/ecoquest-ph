import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchCityBoundary, isInsidePhilippines, isWithinUserCity, pickAdministrativeBoundary } from "@/lib/geo";

describe("fetchCityBoundary", () => {
  const polygon = { type: "Polygon", coordinates: [[[123.9, 10.3], [124.0, 10.3], [124.0, 10.4], [123.9, 10.3]]] };
  const lapuLapu = {
    category: "boundary",
    type: "administrative",
    place_rank: 12,
    display_name: "Lapu-Lapu, Central Visayas, Philippines",
    geojson: polygon,
  };
  const elsewhere = { ...lapuLapu, display_name: "Lapu-Lapu, Davao Region, Philippines" };

  afterEach(() => vi.unstubAllGlobals());

  function stubNominatim(answer: (q: string) => unknown[]) {
    const queries: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: URL) => {
        const q = url.searchParams.get("q")!;
        queries.push(q);
        return new Response(JSON.stringify(answer(q)));
      }),
    );
    return queries;
  }

  it("falls back to the name without 'City' when OSM files the city that way", async () => {
    const queries = stubNominatim((q) => (q === "Lapu-Lapu, Philippines" ? [elsewhere, lapuLapu] : []));
    await expect(fetchCityBoundary("Lapu-Lapu City", "Cebu", "Central Visayas")).resolves.toEqual(polygon);
    expect(queries).toEqual(["Lapu-Lapu City, Cebu, Philippines", "Lapu-Lapu City, Philippines", "Lapu-Lapu, Philippines"]);
  });

  it("never accepts a same-named place in another province or region", async () => {
    stubNominatim((q) => (q === "Lapu-Lapu, Philippines" ? [elsewhere] : []));
    await expect(fetchCityBoundary("Lapu-Lapu City", "Cebu", "Central Visayas")).resolves.toBeNull();
  });

  it("stops at the first search that finds the boundary", async () => {
    const queries = stubNominatim(() => [lapuLapu]);
    await expect(fetchCityBoundary("Lapu-Lapu City", "Cebu", "Central Visayas")).resolves.toEqual(polygon);
    expect(queries).toHaveLength(1);
  });
});

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
