// Photos for the tree directory and seedling shop (public/trees/<slug>.jpg + a 640px "-sm" card
// version), from the EcoQuest PH tree photo collection (processed with
// scripts/process-tree-photos.mjs). Other app images listed in ai-images.json were made by
// scripts/generate-ai-images.mjs and are credited as AI. Credit is shown wherever an image is opened.

import AI_IMAGES from "./ai-images.json";

export type PhotoCredit = {
  author: string;
  license: string;
  source: string;
  /** The photo is of a close relative, not the species itself. */
  shows?: string;
  ai?: boolean;
  /** From the EcoQuest PH tree photo collection. */
  collection?: boolean;
};

/** Credit for every image made by scripts/generate-ai-images.mjs. */
export const AI_CREDIT: PhotoCredit = { author: "Pollinations.ai", license: "AI-generated", source: "https://pollinations.ai", ai: true };

/** Credit for photos in the EcoQuest PH tree photo collection. */
export const COLLECTION_CREDIT: PhotoCredit = { author: "EcoQuest PH tree photo collection", license: "", source: "", collection: true };

/** Whether the generator has produced the image with this key (e.g. "hero", "grow:1"). */
export function isAiImage(key: string): boolean {
  return Object.hasOwn(AI_IMAGES.images, key);
}

/** Species with a collection photo in public/trees. */
export const TREE_PHOTO_SLUGS: ReadonlySet<string> = new Set([
  "narra", "molave", "kamagong", "philippine-teak", "tangile", "red-lauan", "white-lauan", "almon",
  "mayapis", "apitong", "bakauan", "bani", "talisay", "almaciga", "benguet-pine", "mindoro-pine",
  "dao", "katmon", "salingbobog", "banaba", "ipil", "carabao-mango", "pili", "santol",
]);

/** Sign-in hero photo (public/images/auth-hero.jpg). */
export const HERO_PHOTO: PhotoCredit = isAiImage("hero") ? AI_CREDIT : { author: "Dietmar Rabich", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:D%C3%BClmen,_Rorup,_NSG_Roruper_Holz_--_2021_--_8187-91.jpg" };

/** Where a page's images come from, for its footer note. */
export function imageSourcesNote(credits: (PhotoCredit | null)[]): string {
  const sources = new Set<string>();
  for (const c of credits) {
    if (!c) continue;
    sources.add(c.ai ? "AI-generated with Pollinations.ai" : c.collection ? "Photos from the EcoQuest PH tree photo collection" : "Photos from Wikimedia Commons contributors");
  }
  return [...sources].join(" and ") || "Photos from the EcoQuest PH tree photo collection";
}

/** Card-size and full-size photo paths for a species, or null when it has no photo. */
export function treePhoto(slug: string): { card: string; full: string; credit: PhotoCredit } | null {
  const credit = isAiImage(`tree:${slug}`) ? AI_CREDIT : TREE_PHOTO_SLUGS.has(slug) ? COLLECTION_CREDIT : null;
  return credit ? { card: `/trees/${slug}-sm.jpg`, full: `/trees/${slug}.jpg`, credit } : null;
}
