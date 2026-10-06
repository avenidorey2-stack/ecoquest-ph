import { describe, expect, it } from "vitest";
import { searchCities } from "@/lib/psgc";

describe("searchCities", () => {
  it("finds cities and municipalities ignoring case and accents", () => {
    expect(searchCities("LAPU").map((c) => c.name)).toContain("City of Lapu-Lapu");
    expect(searchCities("dasmarinas").map((c) => c.name)).toContain("City of Dasmariñas");
  });

  it("names the province so same-named towns can be told apart", () => {
    const sanJose = searchCities("san jose", 50);
    expect(new Set(sanJose.map((c) => c.province)).size).toBeGreaterThan(1);
  });

  it("puts names that start with the query first and needs two letters", () => {
    const [first] = searchCities("cebu");
    expect(first.name.toLowerCase().startsWith("cebu") || first.name === "City of Cebu").toBe(true);
    expect(searchCities("c")).toEqual([]);
  });
});

describe("searchCities ranking", () => {
  it("ignores the 'City of' prefix: 'lapu' puts City of Lapu-Lapu first", () => {
    expect(searchCities("lapu")[0].name).toBe("City of Lapu-Lapu");
  });
});
