import type { TreeArtSpec } from "@/data/tree-species";

// Generated SVG "photos" for tree species (no licensed imagery yet). Served by
// /api/trees/art/[slug] and referenced from TreeSpecies.imageUrl — swap in real photos any time.

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function crown(art: TreeArtSpec) {
  const leaf = art.leaf;
  switch (art.crown) {
    case "round":
      return `<ellipse cx="200" cy="118" rx="78" ry="68" fill="${leaf}"/><ellipse cx="156" cy="138" rx="44" ry="38" fill="${leaf}" opacity=".85"/><ellipse cx="246" cy="134" rx="46" ry="40" fill="${leaf}" opacity=".9"/>`;
    case "spreading":
      return `<ellipse cx="200" cy="112" rx="120" ry="50" fill="${leaf}"/><ellipse cx="138" cy="128" rx="58" ry="32" fill="${leaf}" opacity=".85"/><ellipse cx="266" cy="124" rx="60" ry="34" fill="${leaf}" opacity=".9"/><ellipse cx="200" cy="84" rx="72" ry="34" fill="${leaf}" opacity=".75"/>`;
    case "tall":
      return `<ellipse cx="200" cy="66" rx="74" ry="38" fill="${leaf}"/><ellipse cx="160" cy="80" rx="38" ry="22" fill="${leaf}" opacity=".85"/><ellipse cx="242" cy="76" rx="40" ry="24" fill="${leaf}" opacity=".9"/>`;
    case "columnar":
      return `<ellipse cx="200" cy="112" rx="50" ry="84" fill="${leaf}"/><ellipse cx="175" cy="128" rx="28" ry="50" fill="${leaf}" opacity=".8"/><ellipse cx="225" cy="122" rx="28" ry="52" fill="${leaf}" opacity=".85"/>`;
    case "conical":
      return `<path d="M200 22 L262 118 L238 118 L282 196 L118 196 L162 118 L138 118 Z" fill="${leaf}"/><path d="M200 22 L232 82 L168 82 Z" fill="#ffffff" opacity=".08"/>`;
    case "mangrove":
      return `<ellipse cx="200" cy="104" rx="104" ry="56" fill="${leaf}"/><ellipse cx="146" cy="120" rx="50" ry="32" fill="${leaf}" opacity=".85"/><ellipse cx="256" cy="116" rx="52" ry="34" fill="${leaf}" opacity=".9"/>`;
  }
}

/** Standalone SVG for a species card (400×260). */
export function renderTreeSvg(art: TreeArtSpec, name: string) {
  const mangrove = art.crown === "mangrove";
  const trunkTop = art.crown === "tall" ? 80 : art.crown === "columnar" ? 170 : art.crown === "conical" ? 190 : 128;
  const ground = mangrove
    ? `<rect y="196" width="400" height="64" fill="#7dd3c0"/><path d="M0 214 Q100 204 200 214 T400 212" stroke="#e0f7f2" stroke-width="3" fill="none" opacity=".8"/>`
    : `<path d="M0 204 Q100 184 200 198 T400 194 V260 H0Z" fill="#cfe8c9"/><path d="M0 222 Q120 208 240 220 T400 218 V260 H0Z" fill="#b7dcae"/>`;
  const roots = mangrove
    ? [-58, -34, -12, 12, 34, 58]
        .map((dx) => `<path d="M200 168 Q${200 + dx * 0.6} 190 ${200 + dx} 222" stroke="${art.trunk}" stroke-width="5" fill="none" stroke-linecap="round"/>`)
        .join("")
    : "";
  const branches =
    art.crown === "round" || art.crown === "spreading" || art.crown === "mangrove"
      ? `<path d="M200 ${trunkTop + 38} q-28 -8 -44 -28 M200 ${trunkTop + 28} q30 -10 46 -30" stroke="${art.trunk}" stroke-width="5" fill="none" stroke-linecap="round"/>`
      : "";
  const flowers = art.accent
    ? [
        [158, 112],
        [218, 92],
        [252, 132],
        [182, 140],
        [236, 116],
        [196, 118],
      ]
        .map(([x, y]) => `<circle cx="${x}" cy="${art.crown === "tall" ? y - 42 : y}" r="4" fill="${art.accent}" opacity=".9"/>`)
        .join("")
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 260" role="img" aria-label="${esc(`Illustration of ${name}`)}">
<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d7efe4"/><stop offset="1" stop-color="#f6f3ea"/></linearGradient></defs>
<rect width="400" height="260" fill="url(#sky)"/>
<circle cx="338" cy="46" r="20" fill="#fde68a" opacity=".9"/>
${ground}
${roots}
<path d="M194 ${mangrove ? 172 : 236} L197 ${trunkTop} L203 ${trunkTop} L207 ${mangrove ? 172 : 236} Z" fill="${art.trunk}"/>
${branches}
${crown(art)}
${flowers}
</svg>`;
}
