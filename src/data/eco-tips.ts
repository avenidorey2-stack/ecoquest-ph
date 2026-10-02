// Practical planting tips, grouped by PSGC region code. Kept general on purpose: they point
// people to good practice and local DENR/LGU guidance rather than hard numbers.

const GENERAL = [
  "Plant at the start of the rainy season so roots establish before the dry months.",
  "Choose native species — they're adapted to local soil and pests and support local wildlife.",
  "Water seedlings in the early morning or late afternoon, and mulch around the base to keep soil moist.",
];

const COASTAL = "Coastal barangays: mangroves like Bakawan and Pagatpat buffer storm surge — plant them only in suitable mudflats with your local DENR office.";
const TYPHOON = "Typhoon-prone area: favour deep-rooted natives such as Narra and Molave, and stake young trees so they survive strong winds.";
const URBAN = "Urban heat: shade trees along streets and schoolyards cool neighbourhoods noticeably — pick species with non-invasive roots near pavement.";
const UPLAND = "Sloping land: plant along the contour and keep ground cover between seedlings to reduce soil erosion and landslide risk.";
const DRY = "Long dry season: dig a small basin around each seedling to catch rainwater, and plant drought-tolerant natives.";

const BY_REGION: Record<string, string[]> = {
  "130000000": [URBAN, "Container trees and community gardens count too — every rooftop and sidewalk strip helps.", GENERAL[2]], // NCR
  "140000000": ["Highland forests here include Benguet pine — reforest with species suited to your elevation.", UPLAND, GENERAL[2]], // CAR
  "010000000": [DRY, "Windbreak rows of trees protect farmland and coastal homes from strong winds.", GENERAL[1]], // Ilocos
  "020000000": [TYPHOON, "Riverbank planting with native trees and bamboo helps hold soil during floods.", GENERAL[0]], // Cagayan Valley
  "030000000": ["Lahar-affected and lowland soils benefit from fast-growing native pioneers before slower hardwoods.", URBAN, GENERAL[1]], // Central Luzon
  "040000000": [UPLAND, URBAN, GENERAL[1]], // CALABARZON
  "170000000": [COASTAL, "Island ecosystems are fragile — source seedlings locally to avoid introducing pests.", GENERAL[1]], // MIMAROPA
  "050000000": [TYPHOON, COASTAL, GENERAL[0]], // Bicol
  "060000000": [COASTAL, "Agroforestry — mixing fruit trees with native hardwoods — gives both income and cover.", GENERAL[0]], // Western Visayas
  "070000000": [COASTAL, UPLAND, GENERAL[1]], // Central Visayas
  "080000000": [TYPHOON, COASTAL, GENERAL[2]], // Eastern Visayas
  "090000000": [COASTAL, "Protect young seedlings from grazing animals with simple bamboo guards.", GENERAL[1]], // Zamboanga Peninsula
  "100000000": [UPLAND, "Watershed areas feed rivers and towns downstream — prioritise native trees there.", GENERAL[1]], // Northern Mindanao
  "110000000": ["Many native hardwoods thrive in Mindanao's year-round rainfall — plant natives over exotics.", UPLAND, GENERAL[2]], // Davao Region
  "120000000": [UPLAND, "Riverbank buffers of native trees reduce flooding and siltation downstream.", GENERAL[1]], // SOCCSKSARGEN
  "160000000": [COASTAL, "Caraga has rich forest cover — help restore logged-over areas with native species.", GENERAL[0]], // Caraga
  "150000000": [COASTAL, "Community nurseries let neighbours share native seedlings and know-how.", GENERAL[1]], // BARMM
};

export function ecoTipsFor(regionCode: string | null | undefined): string[] {
  return (regionCode && BY_REGION[regionCode]) || GENERAL;
}
