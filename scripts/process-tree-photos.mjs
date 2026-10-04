#!/usr/bin/env node
/**
 * EcoQuest PH - Tree photo processor for images you already have (e.g. AI images made elsewhere).
 * For automatic AI generation use scripts/generate-ai-images.mjs instead.
 *
 * Writes two optimised JPEGs per species:
 *   - public/trees/<slug>.jpg     1200x900, quality 86 (details view)
 *   - public/trees/<slug>-sm.jpg   640x480, quality 80 (card tiles)
 *
 * Existing files are never replaced silently: pass --overwrite to replace them. The first time a
 * file is replaced, the original is copied to .ai-images/backup/<same path>. Processed images are
 * recorded in src/data/ai-images.json so the app credits them as AI-generated.
 *
 * Usage:
 *   node scripts/process-tree-photos.mjs <input-image-file> <species-slug> [--overwrite]
 *   node scripts/process-tree-photos.mjs --batch <folder-of-slug-named-images> [--overwrite]
 */

import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const TARGET_DIR = path.join(ROOT, "public/trees");
const BACKUP_DIR = path.join(ROOT, ".ai-images/backup");
const MANIFEST = path.join(ROOT, "src/data/ai-images.json");
const IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".webp"];

const exists = (p) => fs.access(p).then(() => true, () => false);

async function backupOnce(dest) {
  const backup = path.join(BACKUP_DIR, path.relative(ROOT, dest));
  if (!(await exists(dest)) || (await exists(backup))) return;
  await fs.mkdir(path.dirname(backup), { recursive: true });
  await fs.copyFile(dest, backup);
}

async function recordInManifest(slug, inputPath) {
  let manifest;
  try {
    manifest = JSON.parse(await fs.readFile(MANIFEST, "utf8"));
  } catch {
    manifest = { model: "Pollinations.ai (sana)", images: {} };
  }
  manifest.images[`tree:${slug}`] = { prompt: `Supplied image: ${path.basename(inputPath)}`, generatedAt: new Date().toISOString() };
  manifest.images = Object.fromEntries(Object.entries(manifest.images).sort(([a], [b]) => a.localeCompare(b)));
  await fs.writeFile(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
}

export async function processTreeImage(inputPath, slug, { overwrite = false } = {}) {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.endsWith("-sm")) throw new Error(`invalid slug "${slug}"`);
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
    { dest: smDest, w: 640, h: 480, quality: 80 },
  ];
  for (const { dest, w, h, quality } of variants) {
    await backupOnce(dest);
    const tmp = `${dest}.tmp`;
    await sharp(inputBuffer)
      .rotate() // auto-orient from EXIF
      .resize(w, h, { fit: "cover", position: "centre" })
      .jpeg({ quality, mozjpeg: true })
      .toFile(tmp);
    await fs.rename(tmp, dest);
  }
  await recordInManifest(slug, inputPath);

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
  node scripts/process-tree-photos.mjs --batch <folder-with-slug-named-images> [--overwrite]

Examples:
  node scripts/process-tree-photos.mjs my-narra-raw.png narra --overwrite
  node scripts/process-tree-photos.mjs --batch ./raw-ai-trees/
`);
    process.exit(1);
  }

  if (args[0] === "--batch") {
    const dir = path.resolve(ROOT, args[1]);
    let failures = 0;
    for (const file of await fs.readdir(dir)) {
      const ext = path.extname(file).toLowerCase();
      const slug = path.basename(file, path.extname(file)).toLowerCase();
      // Only originals: "<slug>-sm" files are outputs (or duplicates), never inputs.
      if (!IMAGE_EXTS.includes(ext) || slug.endsWith("-sm")) continue;
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
