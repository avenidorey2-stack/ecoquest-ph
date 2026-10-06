import { fetchCityBoundary, fetchCityPoint } from "@/lib/geo";
import { geocoderCityName, type ResolvedPlace } from "@/lib/psgc";

/** OpenStreetMap outline of a PSGC city/municipality, or null when OSM has none we trust. */
export function cityBoundary(place: ResolvedPlace) {
  // Pseudo-provinces ("Metro Manila", "Independent cities") aren't real provinces — omit those.
  const province = place.provinceCode.endsWith("-X") ? null : place.province;
  // "Region VII (Central Visayas)" → "Central Visayas", as OSM writes it in addresses.
  const regionHint = place.region.match(/\(([^)]+)\)/)?.[1] ?? place.region;
  return fetchCityBoundary(geocoderCityName(place.city), province, regionHint);
}

/** The outline if there is one, else the center point — enough for the admin map to zoom there. */
export async function cityOutlineOrPoint(place: ResolvedPlace) {
  const geometry = await cityBoundary(place);
  if (geometry) return { geometry, point: null };
  const province = place.provinceCode.endsWith("-X") ? null : place.province;
  return { geometry: null, point: await fetchCityPoint(geocoderCityName(place.city), province) };
}
