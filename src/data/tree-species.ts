// Native & cultivated Philippine trees — source data for prisma/seed.ts (TreeSpecies rows),
// the generated card illustrations (/api/trees/art/[slug]) and species-name matching.
// Kept to well-established facts; local DENR offices are the authority on what to plant where.

export type TreeArtSpec = {
  crown: "round" | "spreading" | "tall" | "columnar" | "conical" | "mangrove";
  leaf: string;
  trunk: string;
  accent?: string;
};

export type TreeSpeciesSeed = {
  slug: string;
  name: string;
  scientificName: string;
  category: string;
  description: string;
  benefits: string[];
  /** Other names people type for it (matched when slots use free-text species names). */
  aliases?: string[];
  art: TreeArtSpec;
};

export const TREE_CATEGORY_ORDER = [
  "National and Cultural Trees",
  "Philippine Mahogany and Timber Groups",
  "Coastal and Mangrove Trees",
  "Resin Producers",
  "Ornamental and Watershed Trees",
  "Food and Fruit Trees",
] as const;

const [NATIONAL, MAHOGANY, COASTAL, RESIN, WATERSHED, FRUIT] = TREE_CATEGORY_ORDER;

export const TREE_SPECIES: TreeSpeciesSeed[] = [
  // ── National and Cultural Trees ──
  {
    slug: "narra",
    name: "Narra",
    scientificName: "Pterocarpus indicus",
    category: NATIONAL,
    description:
      "The national tree of the Philippines, a broad-crowned legume whose roots host nitrogen-fixing bacteria that enrich poor soils.",
    benefits: [
      "Fixes nitrogen, improving soil fertility for neighbouring plants.",
      "Deep, spreading roots hold soil on slopes and riverbanks.",
      "Wide canopy cools streets and schoolyards; fragrant yellow blooms feed bees.",
    ],
    aliases: ["apalit", "asana"],
    art: { crown: "spreading", leaf: "#2f9e5b", trunk: "#7c4a2d", accent: "#facc15" },
  },
  {
    slug: "molave",
    name: "Molave",
    scientificName: "Vitex parviflora",
    category: NATIONAL,
    description:
      "A tough, slow-growing native famed for its durable wood, able to establish on dry, rocky and limestone soils where few trees survive.",
    benefits: [
      "Restores degraded, drought-prone uplands and limestone areas.",
      "Small flowers attract bees and butterflies.",
      "Long-lived tree that locks away carbon for generations.",
    ],
    aliases: ["tugas", "sagat"],
    art: { crown: "round", leaf: "#3f8f4f", trunk: "#6b4a2b", accent: "#a78bfa" },
  },
  {
    slug: "kamagong",
    name: "Kamagong",
    scientificName: "Diospyros blancoi",
    category: NATIONAL,
    description:
      "Philippine ebony: an evergreen tree with prized dark heartwood and velvety, edible fruit known as mabolo.",
    benefits: [
      "Mabolo fruit feeds people, birds and fruit bats.",
      "Dense evergreen crown gives year-round shade and nesting cover.",
      "Planting helps restore a heartwood species depleted by logging.",
    ],
    aliases: ["mabolo", "velvet apple"],
    art: { crown: "columnar", leaf: "#1f6f4a", trunk: "#3f2a1d", accent: "#b45309" },
  },
  {
    slug: "philippine-teak",
    name: "Philippine Teak",
    scientificName: "Tectona philippinensis",
    category: NATIONAL,
    description:
      "A rare teak found only in the Philippines, naturally growing on limestone and coastal hills in a few areas of Batangas and Mindoro.",
    benefits: [
      "Planting it helps conserve an endemic species with very few wild trees.",
      "Adapted to dry, rocky limestone soils that challenge other species.",
      "Small white flowers support native pollinators.",
    ],
    aliases: ["malatsiki", "philippine teak"],
    art: { crown: "round", leaf: "#4d7c0f", trunk: "#78563a", accent: "#f8fafc" },
  },

  // ── Philippine Mahogany and Timber Groups ──
  {
    slug: "tangile",
    name: "Tangile",
    scientificName: "Shorea polysperma",
    category: MAHOGANY,
    description:
      "A tall dipterocarp of the red lauan group, part of the canopy that once dominated Philippine lowland forests.",
    benefits: [
      "Emergent canopy tree that stores large amounts of carbon.",
      "Shelters understory plants and forest wildlife.",
      "Key species for restoring logged-over lowland forest.",
    ],
    art: { crown: "tall", leaf: "#2d6a4f", trunk: "#8b5a3c", accent: "#b91c1c" },
  },
  {
    slug: "red-lauan",
    name: "Red Lauan",
    scientificName: "Shorea negrosensis",
    category: MAHOGANY,
    description:
      "One of the trees sold as 'Philippine mahogany', a straight-trunked dipterocarp that forms the upper canopy of lowland rainforest.",
    benefits: [
      "Builds tall forest structure that cools and shades the forest floor.",
      "Extensive roots stabilise watershed soils and reduce erosion.",
      "Restores habitat for birds and mammals that depend on old forest.",
    ],
    aliases: ["red lawaan"],
    art: { crown: "tall", leaf: "#2d6a4f", trunk: "#8b5a3c", accent: "#dc2626" },
  },
  {
    slug: "white-lauan",
    name: "White Lauan",
    scientificName: "Shorea contorta",
    category: MAHOGANY,
    description:
      "A relatively fast-growing dipterocarp of lowland forests, valued in reforestation for building canopy cover quickly.",
    benefits: [
      "Quickly forms canopy that retains soil moisture.",
      "Leaf litter rebuilds organic matter in degraded soils.",
      "Part of the forest network that protects water supplies.",
    ],
    aliases: ["white lawaan"],
    art: { crown: "tall", leaf: "#40916c", trunk: "#9c6b4a", accent: "#e5e7eb" },
  },
  {
    slug: "almon",
    name: "Almon",
    scientificName: "Shorea almon",
    category: MAHOGANY,
    description: "A large lowland dipterocarp with a tall, clear trunk, one of the classic Philippine mahogany timbers.",
    benefits: [
      "Long-lived canopy giant and major carbon store.",
      "Supports the complex forest structure many native species need.",
      "Helps protect lowland watersheds from erosion.",
    ],
    art: { crown: "tall", leaf: "#357a5b", trunk: "#94643f", accent: "#fca5a5" },
  },
  {
    slug: "mayapis",
    name: "Mayapis",
    scientificName: "Shorea palosapis",
    category: MAHOGANY,
    description: "A tall dipterocarp of humid lowland and hill forests, grouped commercially with the lauans.",
    benefits: [
      "Restores tall canopy in hill and lowland forests.",
      "Stabilises slopes with a deep, wide root system.",
      "Provides fruit and shelter for forest wildlife during mast years.",
    ],
    art: { crown: "tall", leaf: "#3a7d5c", trunk: "#8d6040", accent: "#fde68a" },
  },
  {
    slug: "apitong",
    name: "Apitong",
    scientificName: "Dipterocarpus grandiflorus",
    category: MAHOGANY,
    description:
      "A towering dipterocarp with large winged fruits that also yields an oleoresin traditionally used for caulking and torches.",
    benefits: [
      "Emergent tree that anchors lowland forest structure.",
      "Resin can be tapped without felling the tree.",
      "Winged fruits spread seedlings to regenerate forest gaps.",
    ],
    art: { crown: "tall", leaf: "#2f6b4f", trunk: "#7a4f33", accent: "#f9a8d4" },
  },

  // ── Coastal and Mangrove Trees ──
  {
    slug: "bakauan",
    name: "Bakauan",
    scientificName: "Rhizophora mucronata",
    category: COASTAL,
    description:
      "A true mangrove whose arching prop roots anchor muddy shores, buffering coastal communities from waves and storm surge.",
    benefits: [
      "Prop roots trap sediment and protect shorelines from erosion and storm surge.",
      "Roots are nurseries for fish, crabs and shrimp that coastal families rely on.",
      "Mangrove soils store carbon far longer than most forests.",
    ],
    aliases: ["bakawan", "bakhaw", "mangrove", "bakauan babae"],
    art: { crown: "mangrove", leaf: "#2f855a", trunk: "#6b4f3a" },
  },
  {
    slug: "bani",
    name: "Bani",
    scientificName: "Pongamia pinnata",
    category: COASTAL,
    description:
      "A salt- and drought-tolerant legume of beach forests and riverbanks that fixes nitrogen and stabilises sandy soils.",
    benefits: [
      "Tolerates salty wind and spray — good for coastal greenbelts.",
      "Fixes nitrogen, enriching poor sandy soils.",
      "Pink-lilac flowers feed bees; dense crown gives shade.",
    ],
    aliases: ["pongamia"],
    art: { crown: "round", leaf: "#3b9d63", trunk: "#7b5a3c", accent: "#f0abfc" },
  },
  {
    slug: "talisay",
    name: "Talisay",
    scientificName: "Terminalia catappa",
    category: COASTAL,
    description:
      "The familiar beach almond, with tiered branches and wind- and salt-tolerant growth that makes it a classic coastal shade tree.",
    benefits: [
      "Thrives on sandy, salty shores where shade is scarce.",
      "Fruit and seeds feed birds and bats.",
      "Fallen leaves add organic matter to coastal soils.",
    ],
    aliases: ["beach almond", "indian almond"],
    art: { crown: "spreading", leaf: "#4caf50", trunk: "#6f4e37", accent: "#ef4444" },
  },

  // ── Resin Producers ──
  {
    slug: "almaciga",
    name: "Almaciga",
    scientificName: "Agathis philippinensis",
    category: RESIN,
    description:
      "A tall native conifer whose resin, Manila copal, is sustainably tapped by indigenous communities without felling the tree.",
    benefits: [
      "Provides livelihood through resin tapping while the forest stays standing.",
      "Tall, straight trunk anchors montane and hill forest.",
      "Long-lived conifer that stores carbon for centuries.",
    ],
    aliases: ["manila copal"],
    art: { crown: "columnar", leaf: "#2c6e49", trunk: "#8a6a4f" },
  },
  {
    slug: "benguet-pine",
    name: "Benguet Pine",
    scientificName: "Pinus kesiya",
    category: RESIN,
    description:
      "The iconic pine of the Cordillera highlands, forming forests that protect the headwaters of major Luzon rivers.",
    benefits: [
      "Protects highland watersheds that supply lowland farms and towns.",
      "Grows on steep, poor mountain soils, reducing erosion.",
      "Source of resin and turpentine.",
    ],
    aliases: ["benguet pine", "saleng"],
    art: { crown: "conical", leaf: "#2f5d46", trunk: "#6b4a34" },
  },
  {
    slug: "mindoro-pine",
    name: "Mindoro Pine",
    scientificName: "Pinus merkusii",
    category: RESIN,
    description:
      "A tropical pine of the Zambales and Mindoro ranges, adapted to fire-prone grassland ridges where it helps forest return.",
    benefits: [
      "Re-establishes tree cover on degraded grassland ridges.",
      "Holds thin mountain soils in place.",
      "Produces resin used for turpentine and rosin.",
    ],
    aliases: ["merkus pine"],
    art: { crown: "conical", leaf: "#3a6b50", trunk: "#734f37" },
  },

  // ── Ornamental and Watershed Trees ──
  {
    slug: "dao",
    name: "Dao",
    scientificName: "Dracontomelon dao",
    category: WATERSHED,
    description:
      "A large buttressed tree of riverbanks and lowland forests whose sour fruits are eaten by people and wildlife.",
    benefits: [
      "Buttress roots stabilise riverbanks and reduce flood damage.",
      "Fruit feeds birds, bats and other wildlife.",
      "Wide canopy shades waterways, keeping streams cool.",
    ],
    art: { crown: "spreading", leaf: "#357a3f", trunk: "#7d5a40", accent: "#fde047" },
  },
  {
    slug: "katmon",
    name: "Katmon",
    scientificName: "Dillenia philippinensis",
    category: WATERSHED,
    description:
      "An endemic tree with large white flowers and sour fruit used in Filipino cooking, often found along streams.",
    benefits: [
      "Endemic — planting it protects a uniquely Philippine species.",
      "Big white flowers support pollinators; fruit feeds wildlife.",
      "Thrives on moist creek banks, helping hold soil.",
    ],
    aliases: ["elephant apple"],
    art: { crown: "round", leaf: "#2b8a3e", trunk: "#6f4e37", accent: "#f8fafc" },
  },
  {
    slug: "salingbobog",
    name: "Salingbobog",
    scientificName: "Crateva religiosa",
    category: WATERSHED,
    description:
      "A small riverside tree with showy cream-to-yellow flowers, well suited to stream banks and seasonally wet ground.",
    benefits: [
      "Tolerates periodic flooding, stabilising stream banks.",
      "Showy blooms attract butterflies and other pollinators.",
      "Compact size suits parks, schools and roadsides.",
    ],
    aliases: ["sacred garlic pear"],
    art: { crown: "round", leaf: "#4a9d5b", trunk: "#7a5c43", accent: "#fef08a" },
  },
  {
    slug: "banaba",
    name: "Banaba",
    scientificName: "Lagerstroemia speciosa",
    category: WATERSHED,
    description:
      "A native flowering tree that blankets in purple blooms in summer; its leaves are traditionally brewed as an herbal tea.",
    benefits: [
      "Showy flowers support bees and brighten streets and parks.",
      "Hardy and adaptable — good for urban greening.",
      "Moderate size gives shade without overwhelming small spaces.",
    ],
    aliases: ["queen's flower", "pride of india"],
    art: { crown: "round", leaf: "#3b8f50", trunk: "#8a6f5a", accent: "#c084fc" },
  },
  {
    slug: "ipil",
    name: "Ipil",
    scientificName: "Intsia bijuga",
    category: WATERSHED,
    description:
      "A durable hardwood of coastal and riverine forests, once common and now worth replanting along shores and streams.",
    benefits: [
      "Grows near coasts and rivers, protecting banks from erosion.",
      "Long-lived tree with dense, rot-resistant wood that stores carbon.",
      "Helps restore a once-common native forest tree.",
    ],
    art: { crown: "spreading", leaf: "#2e7d4f", trunk: "#5c3d2a", accent: "#fecaca" },
  },

  // ── Food and Fruit Trees ──
  {
    slug: "carabao-mango",
    name: "Carabao Mango",
    scientificName: "Mangifera indica 'Carabao'",
    category: FRUIT,
    description:
      "The celebrated Philippine mango variety: a long-lived shade tree that feeds families and supports local livelihoods.",
    benefits: [
      "Fruit provides food and income for households.",
      "Large evergreen crown shades homes and farms for decades.",
      "Flowers support bees and other pollinators.",
    ],
    aliases: ["mango", "mangga", "carabao mango"],
    art: { crown: "spreading", leaf: "#2f7d45", trunk: "#6b4a2b", accent: "#facc15" },
  },
  {
    slug: "pili",
    name: "Pili",
    scientificName: "Canarium ovatum",
    category: FRUIT,
    description:
      "A sturdy native nut tree, famous in Bicol, whose kernels are prized for snacks and pastries.",
    benefits: [
      "Nuts give communities a valuable, long-term income source.",
      "Sturdy, wind-tolerant tree suited to typhoon-prone provinces.",
      "Evergreen canopy shelters birds and smaller crops.",
    ],
    aliases: ["pili nut"],
    art: { crown: "columnar", leaf: "#2b7a46", trunk: "#7a5534", accent: "#a16207" },
  },
  {
    slug: "santol",
    name: "Santol",
    scientificName: "Sandoricum koetjape",
    category: FRUIT,
    description:
      "A fast-growing fruit tree whose sweet-sour fruit is a Filipino favourite, planted widely in yards and farms.",
    benefits: [
      "Productive fruit tree for home gardens and agroforestry.",
      "Fast growth gives shade within a few years.",
      "Fruit feeds people and wildlife alike.",
    ],
    aliases: ["cotton fruit"],
    art: { crown: "round", leaf: "#3a8a4a", trunk: "#735037", accent: "#fbbf24" },
  },
];

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Matches a free-text species name (e.g. "Bakawan (mangrove)") to a species slug by name,
 * alias or slug. Returns null when unknown or ambiguous.
 */
export function matchSpeciesSlug(text: string, species: Pick<TreeSpeciesSeed, "slug" | "name" | "aliases">[] = TREE_SPECIES) {
  const target = normalize(text);
  if (!target) return null;
  const exact = species.filter((s) => [s.name, s.slug.replace(/-/g, " "), ...(s.aliases ?? [])].some((n) => normalize(n) === target));
  if (exact.length === 1) return exact[0].slug;
  // "Bakawan mangrove seedlings" → bakawan: the text contains exactly one known name.
  const words = ` ${target} `;
  const partial = species.filter((s) => [s.name, ...(s.aliases ?? [])].some((n) => words.includes(` ${normalize(n)} `)));
  return partial.length === 1 ? partial[0].slug : null;
}
