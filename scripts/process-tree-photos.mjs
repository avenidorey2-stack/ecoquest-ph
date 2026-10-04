#!/usr/bin/env node
/**
 * EcoQuest PH - Tree photo processor: turns the tree photo collection into the files the
 * Tree Directory and Seedling Shop use.
 *
 * Writes two optimised JPEGs per species:
 *   - public/trees/<slug>.jpg     1200x900, quality 86 (details view)
 *   - public/trees/<slug>-sm.jpg   640x800, quality 80 (portrait card tiles, 4:5 like the tiles)
 *
 * Existing files are never replaced silently: pass --overwrite to replace them. The first time a
 * file is replaced, the original is copied to .ai-images/backup/<same path>. Crops keep the most
 * interesting part of the photo (sharp's "attention" strategy). Any AI record for the species in
 * src/data/ai-images.json is removed, so the app credits the photo to the collection.
 *
 * In --batch mode file names are matched to species loosely ("Mindoro Pine.jpg" -> mindoro-pine).
 *
 * Usage:
 *   node scripts/process-tree-photos.mjs <input-image-file> <species-slug> [--overwrite]
 *   node scripts/process-tree-photos.mjs --batch <folder-of-species-named-images> [--overwrite]
 */

import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { TREE_SPECIES } from "../src/data/tree-species.ts";

const ROOT = process.cwd();
const TARGET_DIR = path.join(ROOT, "public/trees");
const BACKUP_DIR = path.join(ROOT, ".ai-images/backup");
const MANIFEST = path.join(ROOT, "src/data/ai-images.json");
const IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".webp"];
const SLUGS = new Set(TREE_SPECIES.map((s) => s.slug));

const exists = (p) => fs.access(p).then(() => true, () => false);

/** "Mindoro Pine" -> "mindoro-pine"; null when it matches no species. */
export function slugFromFileName(name) {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return SLUGS.has(slug) ? slug : null;
}

async function backupOnce(dest) {
  const backup = path.join(BACKUP_DIR, path.relative(ROOT, dest));
  if (!(await exists(dest)) || (await exists(backup))) return;
  await fs.mkdir(path.dirname(backup), { recursive: true });
  await fs.copyFile(dest, backup);
}

/** The species now has a real photo: drop any AI record so it isn't credited as AI. */
async function forgetAiImage(slug) {
  let manifest;
  try {
    manifest = JSON.parse(await fs.readFile(MANIFEST, "utf8"));
  } catch {
    return;
  }
  if (!Object.hasOwn(manifest.images, `tree:${slug}`)) return;
  delete manifest.images[`tree:${slug}`];
  await fs.writeFile(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
}

export async function processTreeImage(inputPath, slug, { overwrite = false } = {}) {
  if (!SLUGS.has(slug)) throw new Error(`unknown species slug "${slug}"`);
  await fs.mkdir(TARGET_DIR, { recursive: true });

  const fullDest = path.join(TARGET_DIR, `${slug}.jpg`);
  const smDest = path.join(TARGET_DIR, `${slug}-sm.jpg`);
  if (!overwrite && ((await exists(fullDest)) || (await exists(smDest)))) {
    console.log(`- Skipped ${slug}: public/trees/${slug}.jpg already exists (pass --overwrite to replace it)`);
    return false;
  }

  const inputBuffer = await fs.readFile(inputPath);
  const variants = [
    { dest: fullDest, w: 1200, h: 900, quality: 86 },
    { dest: smDest, w: 640, h: 800, quality: 80 },
  ];
  for (const { dest, w, h, quality } of variants) {
    await backupOnce(dest);
    const tmp = `${dest}.tmp`;
    await sharp(inputBuffer)
      .rotate() // auto-orient from EXIF
      .resize(w, h, { fit: "cover", position: "attention" })
      .jpeg({ quality, mozjpeg: true })
      .toFile(tmp);
    await fs.rename(tmp, dest);
  }
  await forgetAiImage(slug);

  console.log(`✓ Processed ${slug}: public/trees/${slug}.jpg + ${slug}-sm.jpg`);
  return true;
}

async function main() {
  const overwrite = process.argv.includes("--overwrite");
  const args = process.argv.slice(2).filter((a) => a !== "--overwrite");
  if (args.length < 2) {
    console.log(`
Usage:
  node scripts/process-tree-photos.mjs <input-file> <species-slug> [--overwrite]
  node scripts/process-tree-photos.mjs --batch <folder-with-species-named-images> [--overwrite]

Examples:
  node scripts/process-tree-photos.mjs my-narra.jpg narra --overwrite
  node scripts/process-tree-photos.mjs --batch ./trees/ --overwrite
`);
    process.exit(1);
  }

  if (args[0] === "--batch") {
    const dir = path.resolve(ROOT, args[1]);
    let failures = 0;
    for (const file of await fs.readdir(dir)) {
      const ext = path.extname(file).toLowerCase();
      const base = path.basename(file, path.extname(file));
      // Only originals: "<slug>-sm" files are outputs (or duplicates), never inputs.
      if (!IMAGE_EXTS.includes(ext) || base.toLowerCase().endsWith("-sm")) continue;
      const slug = slugFromFileName(base);
      if (!slug) {
        failures++;
        console.error(`Skipped ${file}: no species matches "${base}" (rename it to the species name, e.g. red-lauan.jpg)`);
        continue;
      }
      try {
        await processTreeImage(path.join(dir, file), slug, { overwrite });
      } catch (err) {
        failures++;
        console.error(`Failed to process ${file}:`, err.message);
      }
    }
    if (failures) process.exit(1);
  } else {
    const [inputFile, slug] = args;
    await processTreeImage(path.resolve(ROOT, inputFile), slug, { overwrite });
  }
}

// Only run the CLI when executed directly (importing processTreeImage must not trigger it).
if (process.argv[1]?.endsWith("process-tree-photos.mjs")) {
  main().catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
}
