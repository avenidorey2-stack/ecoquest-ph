#!/usr/bin/env node
/**
 * EcoQuest PH - AI image generator (Pollinations.ai, free tier, no API key).
 *
 * Generates every AI image the app uses and writes optimised JPEGs into public/:
 *   - one photo per tree species (read from src/data/tree-species.ts, so new species are picked up)
 *       public/trees/<slug>.jpg (1200x900) + public/trees/<slug>-sm.jpg (640x480)
 *   - sign-in hero + page background, in-app background, Tree Directory and Seedling Shop banners
 *   - five growth stages (seed -> full tree) for the points celebration, on black for screen blending
 *
 * Safe to re-run:
 *   - raw downloads are cached in .ai-images/raw/, so a re-run only generates what is missing
 *   - before a file in public/ is replaced for the first time, the original is copied to
 *     .ai-images/backup/<same path> (an existing backup is never overwritten)
 *   - src/data/ai-images.json records what was generated; the app reads it to credit images as AI
 *
 * The free tier allows about one request a minute and stamps a logo in the bottom-right corner,
 * so requests run one at a time with backoff, and the bottom strip is cropped off every image.
 *
 * Usage:
 *   node scripts/generate-ai-images.mjs                 generate whatever is missing
 *   node scripts/generate-ai-images.mjs --only tree:narra,hero
 *   node scripts/generate-ai-images.mjs --force         regenerate (re-download) the selected images
 *   node scripts/generate-ai-images.mjs --list          print the job keys and exit
 */

import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { TREE_SPECIES } from "../src/data/tree-species.ts";

const ROOT = process.cwd();
const RAW_DIR = path.join(ROOT, ".ai-images/raw");
const BACKUP_DIR = path.join(ROOT, ".ai-images/backup");
const MANIFEST = path.join(ROOT, "src/data/ai-images.json");
const MODEL = "sana";
const ENDPOINT = "https://image.pollinations.ai/prompt/";
/** Share of the image height cut from the bottom to remove the free-tier logo (it sits in ~4%). */
const LOGO_CROP = 0.08;
const PAUSE_MS = 25_000;
const MAX_ATTEMPTS = 8;

const PHOTO_STYLE =
  "photorealistic nature photograph, in the Philippines, natural daylight, lush tropical setting, sharp focus, high detail, professional DSLR photography, no people, no text, no watermark";

// What each species looks like, so the generated photo resembles the real tree.
const TREE_LOOKS = {
  narra: "broad umbrella-shaped spreading crown, drooping branches covered in clusters of small golden-yellow flowers",
  molave: "sturdy fluted grey trunk, dense rounded crown of compound leaves, small lavender flowers",
  kamagong: "dense crown of dark green glossy leaves, velvety reddish-brown mabolo fruits hanging from branches",
  "philippine-teak": "small tree with very large broad leaves on a limestone hillside",
  tangile: "very tall straight dipterocarp trunk with buttress roots, high crown above a rainforest",
  "red-lauan": "towering dipterocarp with a reddish-brown straight trunk and buttress roots, emergent rainforest crown",
  "white-lauan": "towering dipterocarp with a pale grey straight trunk and buttress roots, lowland rainforest",
  almon: "large lowland dipterocarp with a tall clear straight trunk and a broad crown above the forest",
  mayapis: "tall dipterocarp with a straight trunk and dense crown in a humid hill forest",
  apitong: "tall dipterocarp with a straight trunk, large leathery leaves and winged seeds",
  bakauan: "mangrove tree with arching stilt prop roots standing in shallow clear coastal water",
  bani: "medium tree with a dense glossy green crown and pale pink-lavender flowers beside a rural road",
  talisay: "tiered pagoda-like horizontal branches with large leaves, some turning red, on a white sand beach",
  almaciga: "tall straight Agathis conifer with a smooth grey trunk in a misty mountain forest",
  "benguet-pine": "pine trees with long needles on misty Cordillera mountain slopes",
  "mindoro-pine": "tall pine conifer with long green needles, a conical crown and pine cones, in a pine forest on grassy hills",
  dao: "giant tree with massive plank buttress roots and a tall straight trunk in a tropical forest",
  katmon: "tree with large glossy serrated leaves, big white flowers and round green fruits",
  salingbobog: "riverside tree with trifoliate leaves and creamy white flowers with long purple stamens",
  banaba: "tree covered in clusters of purple-lilac crepe-myrtle flowers",
  ipil: "sturdy tree with a buttressed trunk and glossy pinnate leaves in a coastal forest",
  "carabao-mango": "mango tree with a dense dome crown and ripe yellow mangoes hanging, in an orchard",
  pili: "tall evergreen tree with clusters of green-purple pili nuts, Bicol countryside",
  santol: "fruit tree with a dense crown and round golden-yellow santol fruits hanging from the branches",
};

const STAGE_STYLE =
  "centered on a small round mound of dark soil, isolated on a plain pure black background, soft even front lighting, glowing emerald and lime bioluminescent accents, 3D render, game asset, clean, no text";
const STAGES = [
  "a single brown seed resting on the soil",
  "a tiny green sprout with two leaves emerging from the soil",
  "a young sapling with a thin stem and a few leaves growing from the soil",
  "a small young tree with a slender trunk and a round leafy crown growing from the soil",
  "a cute stylized full grown tree with a brown trunk and a big fluffy round canopy of bright lime green and emerald leaves, evenly lit, vivid colours, growing from the soil",
];

/** Every image the app uses: a prompt, the size to request, and the files to write from it. */
function buildJobs() {
  const jobs = [];
  for (const s of TREE_SPECIES) {
    const look = TREE_LOOKS[s.slug] ?? "healthy mature native tree with a full green crown";
    jobs.push({
      key: `tree:${s.slug}`,
      // Sana drifts to leaf close-ups unless told to show the whole tree from a distance.
      prompt: `wide shot of one whole ${s.name} tree (${s.scientificName}) seen from a distance, the entire tree visible from the base of the trunk to the top of the crown with sky above, ${look}, ${PHOTO_STYLE}`,
      size: [1024, 832],
      outputs: [
        { file: `public/trees/${s.slug}.jpg`, w: 1200, h: 900, quality: 84 },
        { file: `public/trees/${s.slug}-sm.jpg`, w: 640, h: 480, quality: 80 },
      ],
    });
  }
  jobs.push(
    {
      key: "hero",
      prompt:
        "breathtaking lush Philippine tropical rainforest at golden hour, sunbeams through tall native trees, giant ferns, soft mist, cinematic wide shot, deep emerald green tones, photorealistic, no people, no text",
      size: [1216, 832],
      outputs: [{ file: "public/images/auth-hero.jpg", w: 1920, h: 1280, quality: 82 }],
    },
    {
      key: "auth-bg",
      prompt:
        "dark moody tropical rainforest canopy at night, faint bioluminescent emerald glow, fireflies, deep green and black, low contrast, atmospheric, photorealistic, no text",
      size: [1216, 832],
      outputs: [{ file: "public/images/auth-bg.jpg", w: 1600, h: 1000, quality: 72 }],
    },
    {
      key: "app-bg",
      prompt:
        "aerial view of a young reforestation site at dusk, neat rows of tree seedlings on green hills in the Philippines, dark moody emerald tones, low contrast, atmospheric, photorealistic, no text",
      size: [1216, 832],
      outputs: [{ file: "public/images/app-bg.jpg", w: 1600, h: 1000, quality: 72 }],
    },
    {
      key: "trees-hero",
      prompt:
        "panoramic view of a diverse Philippine native forest with tall trees, green mountains and morning mist, photorealistic, cinematic, no people, no text",
      size: [1216, 640],
      outputs: [{ file: "public/images/trees-hero.jpg", w: 1600, h: 760, quality: 80 }],
    },
    {
      key: "shop-hero",
      prompt:
        "close-up of many small young tree seedlings with green leaves growing in black plastic nursery bags lined up in neat rows in a plant nursery, warm morning light, shallow depth of field, photorealistic, no people, no text",
      size: [1216, 640],
      outputs: [{ file: "public/images/shop-hero.jpg", w: 1600, h: 760, quality: 80 }],
    },
  );
  STAGES.forEach((stage, i) =>
    jobs.push({
      key: `grow:${i + 1}`,
      prompt: `${stage}, ${STAGE_STYLE}`,
      size: [768, 832],
      seed: 1234,
      // Pull the near-black backdrop down to black so it vanishes when blended onto the card.
      levels: [1.15, -30],
      outputs: [{ file: `public/images/grow/stage-${i + 1}.jpg`, w: 480, h: 480, quality: 84 }],
    }),
  );
  return jobs;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const exists = (p) => fs.access(p).then(() => true, () => false);
const rawPath = (key) => path.join(RAW_DIR, `${key.replace(/[^a-z0-9-]+/gi, "_")}.jpg`);

/** Stable per-image seed, so a re-run with --force gives a fresh but reproducible picture. */
function seedFor(key) {
  let h = 2166136261;
  for (const c of key) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0) % 1_000_000;
}

async function download(job) {
  const seed = job.seed ?? seedFor(job.key);
  const [width, height] = job.size;
  const url = `${ENDPOINT}${encodeURIComponent(job.prompt)}?width=${width}&height=${height}&seed=${seed}&model=${MODEL}&nologo=true`;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(180_000) });
      const type = res.headers.get("content-type") ?? "";
      if (res.ok && type.startsWith("image/")) {
        const buf = Buffer.from(await res.arrayBuffer());
        const meta = await sharp(buf).metadata(); // throws if it isn't a real image
        if ((meta.width ?? 0) < 400 || (meta.height ?? 0) < 300) throw new Error(`too small (${meta.width}x${meta.height})`);
        return { buf, seed };
      }
      throw new Error(`HTTP ${res.status} ${type}`);
    } catch (err) {
      const wait = Math.min(60_000 * attempt, 300_000);
      console.warn(`  ! ${job.key} attempt ${attempt}/${MAX_ATTEMPTS} failed (${err.message}); retrying in ${wait / 1000}s`);
      if (attempt === MAX_ATTEMPTS) throw err;
      await sleep(wait);
    }
  }
}

/** Copy a public file aside the first time it is about to be replaced. */
async function backupOnce(rel) {
  const src = path.join(ROOT, rel);
  const dest = path.join(BACKUP_DIR, rel);
  if (!(await exists(src)) || (await exists(dest))) return;
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.copyFile(src, dest);
  console.log(`  backed up ${rel}`);
}

/** Crop the logo strip off the bottom, then cover-resize into each output (written atomically). */
async function writeOutputs(job, raw) {
  const meta = await sharp(raw).metadata();
  const cropped = await sharp(raw)
    .extract({ left: 0, top: 0, width: meta.width, height: Math.round(meta.height * (1 - LOGO_CROP)) })
    .toBuffer();
  for (const out of job.outputs) {
    const dest = path.join(ROOT, out.file);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await backupOnce(out.file);
    const tmp = `${dest}.tmp`;
    let image = sharp(cropped).resize(out.w, out.h, { fit: "cover", position: "centre", kernel: "lanczos3" });
    if (job.levels) image = image.linear(...job.levels);
    await image
      .jpeg({ quality: out.quality, mozjpeg: true })
      .toFile(tmp);
    await fs.rename(tmp, dest);
  }
}

async function readManifest() {
  try {
    return JSON.parse(await fs.readFile(MANIFEST, "utf8"));
  } catch {
    return { model: `Pollinations.ai (${MODEL})`, images: {} };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const all = buildJobs();
  if (args.includes("--list")) {
    for (const j of all) console.log(j.key);
    return;
  }
  const force = args.includes("--force");
  const onlyIdx = args.indexOf("--only");
  const only = onlyIdx >= 0 ? new Set((args[onlyIdx + 1] ?? "").split(",").filter(Boolean)) : null;
  const jobs = only ? all.filter((j) => only.has(j.key)) : all;
  if (only && jobs.length !== only.size) {
    const known = new Set(all.map((j) => j.key));
    console.error(`Unknown key(s): ${[...only].filter((k) => !known.has(k)).join(", ")} (see --list)`);
    process.exit(1);
  }

  await fs.mkdir(RAW_DIR, { recursive: true });
  const manifest = await readManifest();
  let generated = 0;
  const failed = [];

  for (const [i, job] of jobs.entries()) {
    const rawFile = rawPath(job.key);
    console.log(`[${i + 1}/${jobs.length}] ${job.key}`);
    try {
      let raw;
      if (!force && (await exists(rawFile))) {
        raw = await fs.readFile(rawFile);
        console.log("  using cached download");
      } else {
        if (generated > 0) await sleep(PAUSE_MS); // stay under the free tier's rate limit
        const { buf, seed } = await download(job);
        raw = buf;
        await fs.writeFile(rawFile, raw);
        manifest.images[job.key] = { prompt: job.prompt, seed, generatedAt: new Date().toISOString() };
        generated++;
      }
      manifest.images[job.key] ??= { prompt: job.prompt, seed: job.seed ?? seedFor(job.key), generatedAt: new Date().toISOString() };
      await writeOutputs(job, raw);
      // Saved after every image so an interrupted run still credits what it finished.
      const sorted = Object.fromEntries(Object.entries(manifest.images).sort(([a], [b]) => a.localeCompare(b)));
      await fs.writeFile(MANIFEST, `${JSON.stringify({ ...manifest, images: sorted }, null, 2)}\n`);
      console.log(`  ✓ ${job.outputs.map((o) => o.file).join(", ")}`);
    } catch (err) {
      console.error(`  ✗ ${job.key}: ${err.message}`);
      failed.push(job.key);
    }
  }

  console.log(`\nDone: ${jobs.length - failed.length}/${jobs.length} ok, ${generated} newly generated.`);
  if (failed.length) {
    console.log(`Failed (re-run to retry): ${failed.join(", ")}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
