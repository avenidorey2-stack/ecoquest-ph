import { describe, expect, it } from "vitest";
import psgc from "@/data/psgc.json";
import { geocoderCityName, getRegionTree, listRegions, matchCity, resolveCity } from "@/lib/psgc";

describe("PSGC dataset", () => {
  it("has all 17 regions and every city resolves to a region and province", () => {
    expect(listRegions()).toHaveLength(17);
    expect(psgc.cities.length).toBeGreaterThan(1600);
    for (const city of psgc.cities) {
      const place = resolveCity(city.code);
      expect(place, city.code).not.toBeNull();
      expect(place!.province).toBeTruthy();
    }
  });

  it("has unique city codes", () => {
    expect(new Set(psgc.cities.map((c) => c.code)).size).toBe(psgc.cities.length);
  });
});

describe("resolveCity", () => {
  it("returns canonical names", () => {
    expect(resolveCity("041022000")).toEqual({
      regionCode: "040000000",
      provinceCode: "041000000",
      cityCode: "041022000",
      region: "Region IV-A (CALABARZON)",
      province: "Batangas",
      city: "San Jose",
    });
  });

  it("puts NCR cities under Metro Manila", () => {
    expect(resolveCity("137404000")).toMatchObject({ city: "Quezon City", province: "Metro Manila" });
  });

  it.each([undefined, null, 123, "", "999999999"])("returns null for %s", (code) => {
    expect(resolveCity(code)).toBeNull();
  });
});

describe("getRegionTree", () => {
  it("returns NCR as a single Metro Manila province with its 17 LGUs", () => {
    const tree = getRegionTree("130000000")!;
    expect(tree).toHaveLength(1);
    expect(tree[0].name).toBe("Metro Manila");
    expect(tree[0].cities).toHaveLength(17);
  });

  it("returns null for unknown regions", () => {
    expect(getRegionTree("nope")).toBeNull();
  });
});

describe("matchCity", () => {
  it.each([
    [{ city: "Makati" }, "137602000"],
    [{ city: "Makati City" }, "137602000"],
    [{ city: "City of Makati" }, "137602000"],
    [{ city: "Quezon City" }, "137404000"],
    [{ city: "Cebu City", province: "Cebu" }, "072217000"],
    [{ city: "Las Pinas" }, "137601000"], // accent-insensitive
    [{ city: "Quezon", province: "Bukidnon" }, "101317000"], // the town, not Quezon City
  ])("%o → %s", (names, code) => {
    expect(matchCity(names)).toBe(code);
  });

  it("disambiguates duplicate names by province", () => {
    expect(matchCity({ city: "San Jose", province: "Batangas" })).toBe("041022000");
    expect(matchCity({ city: "San Jose", province: "Tarlac" })).toBe("036918000");
  });

  it("returns null when ambiguous or unknown", () => {
    expect(matchCity({ city: "San Jose" })).toBeNull();
    expect(matchCity({ city: "Atlantis" })).toBeNull();
    expect(matchCity({ city: "" })).toBeNull();
  });
});

describe("geocoderCityName", () => {
  it("rewrites 'City of X' as 'X City'", () => {
    expect(geocoderCityName("City of Makati")).toBe("Makati City");
    expect(geocoderCityName("Quezon City")).toBe("Quezon City");
  });
});
