// Colours that can't be Tailwind classes: Leaflet paths, SVG fills and particle colours need
// real colour values. Kept in one place so the planter map, admin map and their legends agree.

/** Slot pins by status (admin view and its legend). */
export const SLOT_STATUS_COLORS = { OPEN: "#16a34a", FULL: "#f59e0b", CLOSED: "#6b7280" } as const;

/** Slot pins from a planter's point of view (and the map legend). */
export const PLANTER_PIN_COLORS = { claimable: "#16a34a", yours: "#2563eb", other: "#9ca3af" } as const;

/** Admin map: the selected slot's outline and the pin being placed. */
export const MAP_SELECTED = { stroke: "#1d4ed8", fill: "#60a5fa" } as const;

/** City boundary outline on the planter map. */
export const MAP_BOUNDARY = "#16a34a";

/** Confetti: emerald, amber, lime, sky and pink. */
export const CONFETTI_COLORS = ["#10b981", "#34d399", "#fbbf24", "#f59e0b", "#a3e635", "#38bdf8", "#f472b6"] as const;

/** Background tree line: far (lighter) and near (darker) silhouettes, just above the canvas. */
export const TREELINE = { far: "#0b281c", near: "#0e3123" } as const;

/** Browser UI colour (the address bar on phones): the canvas token. */
export const CANVAS = "#04100b";
