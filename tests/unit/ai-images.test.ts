import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import AI_IMAGES from "@/data/ai-images.json";
import { AI_CREDIT, COLLECTION_CREDIT, HERO_PHOTO, imageSourcesNote, isAiImage, treePhoto } from "@/data/tree-photos";
import { TREE_SPECIES } from "@/data/tree-species";

// Files each generator key writes (mirrors scripts/generate-ai-images.mjs).
function filesFor(key: string): string[] {
  if (key.startsWith("tree:")) {
    const slug = key.slice(5);
    return [`public/trees/${slug}.jpg`, `public/trees/${slug}-sm.jpg`];
  }
  if (key.startsWith("grow:")) return [`public/images/grow/stage-${key.slice(5)}.jpg`];
  return [{ hero: "public/images/auth-hero.jpg" }[key] ?? `public/images/${key}.jpg`];
}

describe("AI image manifest", () => {
  const keys = Object.keys(AI_IMAGES.images);

  it("only lists images the app knows, and every one exists on disk", () => {
    const slugs = new Set(TREE_SPECIES.map((s) => s.slug));
    const known = new Set(["hero", "auth-bg", "app-bg", "grow:1", "grow:2", "grow:3", "grow:4", "grow:5"]);
    for (const key of keys) {
      expect(key.startsWith("tree:") ? slugs.has(key.slice(5)) : known.has(key), key).toBe(true);
      for (const file of filesFor(key)) expect(existsSync(file), file).toBe(true);
    }
  });

  it("has both AI backgrounds", () => {
    for (const key of ["auth-bg", "app-bg"]) expect(isAiImage(key), key).toBe(true);
  });

  it("has every growth stage the points celebration shows", () => {
    for (let i = 1; i <= 5; i++) expect(existsSync(`public/images/grow/stage-${i}.jpg`), `stage ${i}`).toBe(true);
  });

  it("credits each tree image by where it came from", () => {
    for (const s of TREE_SPECIES) {
      expect(treePhoto(s.slug)?.credit).toEqual(isAiImage(`tree:${s.slug}`) ? AI_CREDIT : COLLECTION_CREDIT);
    }
    if (isAiImage("hero")) expect(HERO_PHOTO).toEqual(AI_CREDIT);
  });
});

describe("imageSourcesNote", () => {
  const wiki = { author: "A", license: "CC0", source: "https://commons.wikimedia.org/x" };
  it("names where a page's images come from", () => {
    expect(imageSourcesNote([COLLECTION_CREDIT, COLLECTION_CREDIT, null])).toBe("Photos from the EcoQuest PH tree photo collection");
    expect(imageSourcesNote([AI_CREDIT, null])).toBe("AI-generated with Pollinations.ai");
    expect(imageSourcesNote([wiki])).toBe("Photos from Wikimedia Commons contributors");
    expect(imageSourcesNote([COLLECTION_CREDIT, AI_CREDIT])).toBe(
      "Photos from the EcoQuest PH tree photo collection and AI-generated with Pollinations.ai",
    );
  });
});
