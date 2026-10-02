import type { Geometry } from "geojson";

export const PH_CENTER: [number, number] = [12.8797, 121.774];
export const PH_BOUNDS: [[number, number], [number, number]] = [
  [4.2, 116.0],
  [21.5, 127.5],
];

/** Geofence: the slot must be in the user's designated city/municipality (by PSGC code). */
export function isWithinUserCity(user: { cityCode: string | null }, slot: { cityCode: string }) {
  return !!user.cityCode && user.cityCode === slot.cityCode;
}

export function isInsidePhilippines(lat: number, lng: number) {
  const [[south, west], [north, east]] = PH_BOUNDS;
  return lat >= south && lat <= north && lng >= west && lng <= east;
}

async function nominatimAddress(lat: number, lng: number, zoom: number) {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.search = new URLSearchParams({
    lat: String(lat),
    lon: String(lng),
    format: "jsonv2",
    zoom: String(zoom),
    addressdetails: "1",
  }).toString();

  const res = await fetch(url, {
    headers: { "User-Agent": "EcoQuestPH/0.1" },
    next: { revalidate: 60 * 60 * 24 * 30 },
  });
  if (!res.ok) return null;
  return ((await res.json()) as { address?: Record<string, string> }).address ?? {};
}

/**
 * Best-effort region/province/city/barangay lookup for a map point via Nominatim reverse
 * geocoding. One street-level request (zoom 18) yields the barangay too; if it has no
 * city/town, falls back to the city-level request (zoom 10, where `village` is the town).
 * Barangay mapping in OSM PH data: `village` in municipalities, `quarter`/`suburb` in cities.
 */
export async function reverseGeocode(lat: number, lng: number) {
  const street = await nominatimAddress(lat, lng, 18);
  const streetCity = street && (street.city ?? street.town ?? street.municipality);
  const address = streetCity ? street : await nominatimAddress(lat, lng, 10);
  if (!address) return null;

  return {
    region: address.region ?? address.state ?? "",
    province: address.province ?? address.state_district ?? address.county ?? address.state ?? "",
    city: address.city ?? address.town ?? address.municipality ?? address.village ?? "",
    barangay: streetCity && street ? (street.village ?? street.quarter ?? street.suburb ?? "") : "",
  };
}

async function searchSettlements(q: string): Promise<unknown> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.search = new URLSearchParams({
    q,
    format: "jsonv2",
    polygon_geojson: "1",
    polygon_threshold: "0.0005",
    countrycodes: "ph",
    // Cities/towns/villages only — a plain search can rank buildings named after the
    // city (e.g. a university in Cebu City) above the city itself.
    featureType: "settlement",
    limit: "5",
  }).toString();
  const res = await fetch(url, {
    headers: { "User-Agent": "EcoQuestPH/0.1" },
    next: { revalidate: 60 * 60 * 24 * 30 },
  });
  return res.ok ? res.json() : null;
}

/**
 * Fetch a city/municipality boundary polygon from OpenStreetMap Nominatim.
 * Cached for 30 days by Next's fetch cache to respect Nominatim's usage policy.
 *
 * Searches "City, Province" first (needed for duplicate names like San Jose). Highly
 * urbanised cities (e.g. Cebu City) aren't filed under their province in OSM, so it then
 * retries without the province — accepting only a result that mentions the expected
 * province or region, so it can't land on a same-named town elsewhere.
 */
export async function fetchCityBoundary(
  city: string,
  province: string | null,
  regionHint?: string | null,
): Promise<Geometry | null> {
  const withProvince = pickAdministrativeBoundary(await searchSettlements([city, province, "Philippines"].filter(Boolean).join(", ")));
  if (withProvince || !province) return withProvince;

  const hints = [province, regionHint].filter((h): h is string => !!h);
  return pickAdministrativeBoundary(await searchSettlements(`${city}, Philippines`), hints);
}

type NominatimHit = {
  category?: string;
  type?: string;
  place_rank?: number;
  display_name?: string;
  geojson?: Geometry;
};

/**
 * The city/municipality outline among Nominatim hits: an administrative boundary polygon at
 * city/town level (PH cities and municipalities are place_rank 12; barangays are 20).
 * With `mustMention`, the hit's address must contain one of those names.
 * Returns null (no outline) rather than a wrong shape.
 */
export function pickAdministrativeBoundary(hits: unknown, mustMention?: string[]): Geometry | null {
  if (!Array.isArray(hits)) return null;
  const isArea = (g?: Geometry) => g?.type === "Polygon" || g?.type === "MultiPolygon";
  const mentions = (h: NominatimHit) =>
    !mustMention?.length ||
    mustMention.some((name) => (h.display_name ?? "").toLowerCase().includes(name.toLowerCase()));
  const match = (hits as NominatimHit[]).find(
    (h) =>
      h.category === "boundary" &&
      h.type === "administrative" &&
      h.place_rank !== undefined &&
      h.place_rank >= 10 &&
      h.place_rank <= 14 &&
      isArea(h.geojson) &&
      mentions(h),
  );
  return match?.geojson ?? null;
}
