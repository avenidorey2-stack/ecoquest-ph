import { describe, expect, it } from "vitest";
import { matchSpeciesSlug, speciesSlugsLike, TREE_CATEGORY_ORDER, TREE_SPECIES } from "@/data/tree-species";
import { renderTreeSvg } from "@/lib/tree-art";

describe("tree species catalogue", () => {
  it("has exactly the requested species in each category", () => {
    const byCategory = Object.fromEntries(
      TREE_CATEGORY_ORDER.map((c) => [c, TREE_SPECIES.filter((s) => s.category === c).map((s) => s.name)]),
    );
    expect(byCategory).toEqual({
      "National and Cultural Trees": ["Narra", "Molave", "Kamagong", "Philippine Teak"],
      "Philippine Mahogany and Timber Groups": ["Tangile", "Red Lauan", "White Lauan", "Almon", "Mayapis", "Apitong"],
      "Coastal and Mangrove Trees": ["Bakauan", "Bani", "Talisay"],
      "Resin Producers": ["Almaciga", "Benguet Pine", "Mindoro Pine"],
      "Ornamental and Watershed Trees": ["Dao", "Katmon", "Salingbobog", "Banaba", "Ipil"],
      "Food and Fruit Trees": ["Carabao Mango", "Pili", "Santol"],
    });
    expect(TREE_SPECIES).toHaveLength(24);
  });

  it("uses accepted scientific names", () => {
    const sci = Object.fromEntries(TREE_SPECIES.map((s) => [s.name, s.scientificName]));
    expect(sci).toMatchObject({
      Narra: "Pterocarpus indicus",
      "Philippine Teak": "Tectona philippinensis",
      Tangile: "Shorea polysperma",
      Apitong: "Dipterocarpus grandiflorus",
      Bakauan: "Rhizophora mucronata",
      Talisay: "Terminalia catappa",
      Almaciga: "Agathis philippinensis",
      "Benguet Pine": "Pinus kesiya",
      "Mindoro Pine": "Pinus merkusii",
      Dao: "Dracontomelon dao",
      Banaba: "Lagerstroemia speciosa",
      Ipil: "Intsia bijuga",
      Pili: "Canarium ovatum",
      Santol: "Sandoricum koetjape",
    });
  });

  it("every species has a 1–2 sentence description, benefits and a unique slug/name", () => {
    for (const s of TREE_SPECIES) {
      const sentences = s.description.split(/(?<=[.!?])\s+/).filter(Boolean);
      expect(sentences.length, s.name).toBeGreaterThanOrEqual(1);
      expect(sentences.length, s.name).toBeLessThanOrEqual(2);
      expect(s.benefits.length, s.name).toBeGreaterThanOrEqual(3);
    }
    expect(new Set(TREE_SPECIES.map((s) => s.slug)).size).toBe(24);
    expect(new Set(TREE_SPECIES.map((s) => s.name)).size).toBe(24);
  });
});

describe("matchSpeciesSlug", () => {
  it.each([
    ["Narra", "narra"],
    ["  NARRA seedlings ", "narra"],
    ["Bakawan (mangrove)", "bakauan"],
    ["bakhaw", "bakauan"],
    ["Mango", "carabao-mango"],
    ["Benguet pine", "benguet-pine"],
    ["philippine teak", "philippine-teak"],
    ["Red lauan", "red-lauan"],
  ])("%j → %s", (text, slug) => {
    expect(matchSpeciesSlug(text)).toBe(slug);
  });

  it.each(["", "Acacia mangium", "Lauan", "Philippine mahogany", "pine"])("returns null for unknown/ambiguous %j", (text) => {
    expect(matchSpeciesSlug(text)).toBeNull();
  });
});

describe("speciesSlugsLike", () => {
  it.each([
    ["Red Lauan", ["red-lauan"]],
    ["Red Lawn", ["red-lauan"]],
    ["red lawan", ["red-lauan"]],
    ["I said, Red Lawn.", ["red-lauan"]],
    ["white lawn", ["white-lauan"]],
    ["nara", ["narra"]],
    ["Camagong", ["kamagong"]],
    ["mulave", ["molave"]],
    ["tangili", ["tangile"]],
    ["bakawan", ["bakauan"]],
    ["Shorea negrosensis", ["red-lauan"]],
    ["Nara seedlings", ["narra"]],
    ["Ipil", ["ipil"]],
    ["Pili", ["pili"]],
    // A name that fits several trees lists them all, so EcoBot asks which.
    ["lauan", ["red-lauan", "white-lauan"]],
  ])("%j → %j", (text, slugs) => {
    expect(speciesSlugsLike(text)).toEqual(slugs);
  });

  it.each(["", "acacia", "mahogany", "dau"])("finds nothing for %j", (text) => {
    expect(speciesSlugsLike(text)).toEqual([]);
  });
});

describe("renderTreeSvg", () => {
  it("produces standalone SVG for every species, escaping the label", () => {
    for (const s of TREE_SPECIES) {
      const svg = renderTreeSvg(s.art, s.name);
      expect(svg.startsWith("<svg"), s.slug).toBe(true);
      expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
      expect(svg).not.toContain("undefined");
    }
    expect(renderTreeSvg(TREE_SPECIES[0].art, `"><script>x</script>`)).not.toContain("<script>");
  });
});
