// Regenerates src/data/psgc.json from the PSGC API (https://psgc.gitlab.io/api).
// Usage: node scripts/fetch-psgc.mjs
import { writeFile } from "node:fs/promises";

const BASE = "https://psgc.gitlab.io/api";

async function get(path) {
  const res = await fetch(`${BASE}/${path}/`);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

const [regions, provinces, cities] = await Promise.all([
  get("regions"),
  get("provinces"),
  get("cities-municipalities"),
]);

const byName = (a, b) => a.name.localeCompare(b.name, "en");

// Cities with no province (NCR, and independent cities like Isabela and Cotabato)
// are grouped under one pseudo-province per region so every city has a province.
const pseudoProvinces = new Map();
for (const c of cities) {
  if (c.provinceCode) continue;
  const code = `${c.regionCode}-X`;
  if (!pseudoProvinces.has(code)) {
    pseudoProvinces.set(code, {
      code,
      name: c.regionCode === "130000000" ? "Metro Manila" : "Independent cities",
      regionCode: c.regionCode,
    });
  }
}

const data = {
  source: `${BASE} (fetched ${new Date().toISOString().slice(0, 10)})`,
  regions: regions
    .map((r) => ({ code: r.code, name: r.name, label: r.regionName }))
    .sort((a, b) => a.code.localeCompare(b.code)),
  provinces: [
    ...provinces.map((p) => ({ code: p.code, name: p.name, regionCode: p.regionCode })),
    ...pseudoProvinces.values(),
  ].sort(byName),
  cities: cities
    .map((c) => ({
      code: c.code,
      name: c.name,
      provinceCode: c.provinceCode || `${c.regionCode}-X`,
      regionCode: c.regionCode,
      isCity: c.isCity,
    }))
    .sort(byName),
};

await writeFile(new URL("../src/data/psgc.json", import.meta.url), JSON.stringify(data) + "\n");
console.log(
  `Wrote ${data.regions.length} regions, ${data.provinces.length} provinces, ${data.cities.length} cities/municipalities.`,
);
