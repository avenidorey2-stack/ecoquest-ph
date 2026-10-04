// Images for the tree directory and seedling shop (public/trees/<slug>.jpg + a 640px "-sm" card
// version). Images listed in ai-images.json were made by scripts/generate-ai-images.mjs and are
// credited as AI; the rest are freely licensed Wikimedia Commons photos. Credit is shown wherever
// an image is opened. `shows`: the Wikimedia photo is of a close relative, not the species itself.

import AI_IMAGES from "./ai-images.json";

export type PhotoCredit = { author: string; license: string; source: string; shows?: string; ai?: boolean };

/** Credit for every image made by scripts/generate-ai-images.mjs. */
export const AI_CREDIT: PhotoCredit = { author: "Pollinations.ai", license: "AI-generated", source: "https://pollinations.ai", ai: true };

/** Whether the generator has produced the image with this key (e.g. "tree:narra", "hero"). */
export function isAiImage(key: string): boolean {
  return Object.hasOwn(AI_IMAGES.images, key);
}

export const TREE_PHOTOS: Record<string, PhotoCredit> = {
  narra: { author: "Richard N Horne", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:Pterocarpus_indicus,_Burmese_rose_wood_tree_in_the_Penang_Botanic_Garden.jpg" },
  molave: { author: "SwarmCheng", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:Vitex_parviflora_in_the_Philippines_8414.jpg" },
  kamagong: { author: "Ping an Chang", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:%E6%AF%9B%E6%9F%BF_Diospyros_blancoi_20220807225309_02.jpg" },
  "philippine-teak": { author: "Paul Christian B. Yang-ed", license: "CC0", source: "https://commons.wikimedia.org/wiki/File:Philippine_Teak_(Tectona_philippinensis)--an_endangered_and_endemic_tree_01.jpg" },
  "red-lauan": { author: "JDipterocarpus", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:Red_Lauan_Shorea.jpg" },
  "white-lauan": { author: "JDipterocarpus", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:Shorea_contorta68.jpg" },
  bakauan: { author: "Bernard DUPONT from FRANCE", license: "CC BY-SA 2.0", source: "https://commons.wikimedia.org/wiki/File:Tall-stilted_Mangrove_(Rhizophora_mucronata)_(9734153130).jpg" },
  bani: { author: "Ji-Elle", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:Pongamia_pinnata-Rajasthan.jpg" },
  talisay: { author: "Ping an Chang", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:%E6%AC%96%E4%BB%81%E6%A8%B9_Terminalia_catappa_20210121125731_01.jpg" },
  almaciga: { author: "Krzysztof Ziarnek, Kenraiz", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:Agathis_dammara_kz01.jpg" },
  "benguet-pine": { author: "anne_jimenez on Flickr", license: "CC BY 2.0", source: "https://commons.wikimedia.org/wiki/File:Pinus_kesiya_Binga.jpg" },
  "mindoro-pine": { author: "Ratri Ely Yulisna", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:Jurang_Jero%27s_Pines.jpg" },
  dao: { author: "GRMondala", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:Dao_Heritage_Tree_by_Gerald_Mondala.jpg" },
  katmon: { author: "A.C.T. Alejandre", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:Katmon_(Dillenia_philippinensis)_tree.jpg" },
  salingbobog: { author: "David J. Stang", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:Crateva_religiosa_4zz.jpg" },
  banaba: { author: "Idk1989", license: "CC BY 4.0", source: "https://commons.wikimedia.org/wiki/File:Lagerstroemia_Speciosa_Tree.jpg" },
  ipil: { author: "Steve Fitzgerald", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:Intsia-bijuga-SF24292-02.jpg" },
  "carabao-mango": { author: "CEphoto, Uwe Aranas", license: "CC BY-SA 3.0", source: "https://commons.wikimedia.org/wiki/File:Paitan_Sabah_Common-mango-Mangifera-indica-01.jpg" },
  pili: { author: "Zyrahila", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:Pili_Nut_tree_plantation.jpg" },
  santol: { author: "Judgefloro", license: "CC BY-SA 3.0", source: "https://commons.wikimedia.org/wiki/File:FvfSantolLU3909_09.JPG" },
  tangile: { author: "Daniel Z", license: "CC BY 4.0", source: "https://commons.wikimedia.org/wiki/File:Shorea_faguetiana_351187268.jpg", shows: "Shorea faguetiana" },
  almon: { author: "Ishak yassir", license: "CC BY-SA 3.0", source: "https://commons.wikimedia.org/wiki/File:Crown_of_Shore_leprosula.jpg", shows: "Shorea leprosula" },
  mayapis: { author: "Ishak yassir", license: "CC BY-SA 3.0", source: "https://commons.wikimedia.org/wiki/File:Shorea_leprosula_seedlings_in_nursery.jpg", shows: "Shorea leprosula" },
  apitong: { author: "josh jackson", license: "CC BY 2.0", source: "https://commons.wikimedia.org/wiki/File:Dipterocarpus_alatus.jpg", shows: "Dipterocarpus alatus" },
};

/** Sign-in hero photo (public/images/auth-hero.jpg). */
export const HERO_PHOTO: PhotoCredit = isAiImage("hero") ? AI_CREDIT : { author: "Dietmar Rabich", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:D%C3%BClmen,_Rorup,_NSG_Roruper_Holz_--_2021_--_8187-91.jpg" };

/** Who made a page's images, for its footer note: AI, Wikimedia Commons contributors, or both. */
export function imageSourcesNote(credits: (PhotoCredit | null)[]): string {
  const ai = credits.some((c) => c?.ai);
  const wikimedia = credits.some((c) => c && !c.ai);
  if (ai && wikimedia) return "AI-generated (Pollinations.ai) and photos from Wikimedia Commons contributors";
  return ai ? "AI-generated with Pollinations.ai" : "Photos from Wikimedia Commons contributors";
}

/** Card-size and full-size photo paths for a species, or null when it has no photo. */
export function treePhoto(slug: string): { card: string; full: string; credit: PhotoCredit } | null {
  const credit = isAiImage(`tree:${slug}`) ? AI_CREDIT : TREE_PHOTOS[slug];
  return credit ? { card: `/trees/${slug}-sm.jpg`, full: `/trees/${slug}.jpg`, credit } : null;
}
