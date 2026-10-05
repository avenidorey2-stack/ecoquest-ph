import FallingLeaves, { makeLeaves, type Leaf } from "./FallingLeaves";
import Fireflies, { makeFireflies } from "./Fireflies";
import PauseWhileScrolling from "./PauseWhileScrolling";
import { TREELINE } from "@/lib/palette";

// Decorative, fixed backdrop behind every portal and sign-in page: a dim AI-generated forest
// photo, a soft sky, drifting sunlight, faint terrain contours, rolling hills with a tree line,
// falling leaves, and living bioluminescent fireflies and canopy light sweeps — SVG + CSS.
// Motion stops under prefers-reduced-motion, and pauses while the page is touched or scrolled.

const BLOB = "M0-60C34-62 66-38 64-4 62 30 38 58 2 60-34 62-64 36-62 0-60-34-34-58 0-60Z";
const RINGS = [1, 1.6, 2.25, 2.95, 3.7, 4.5];

const LEAVES: Leaf[] = [
  { x: "8%", s: 18, d: 28, delay: -4, drift: 90, spin: 320, c: "rgb(52 211 153 / 0.32)" },
  { x: "27%", s: 14, d: 34, delay: -19, drift: -70, spin: -260, c: "rgb(163 230 53 / 0.3)" },
  { x: "52%", s: 20, d: 31, delay: -11, drift: 110, spin: 380, c: "rgb(110 231 183 / 0.26)" },
  { x: "76%", s: 15, d: 26, delay: -23, drift: -90, spin: -300, c: "rgb(250 204 21 / 0.3)" },
  { x: "91%", s: 17, d: 37, delay: -7, drift: -60, spin: 280, c: "rgb(52 211 153 / 0.28)" },
  { x: "40%", s: 12, d: 40, delay: -30, drift: 60, spin: -340, c: "rgb(190 242 100 / 0.28)" },
  { x: "64%", s: 13, d: 44, delay: -2, drift: 80, spin: 260, c: "rgb(52 211 153 / 0.24)" },
  { x: "17%", s: 11, d: 48, delay: -36, drift: -50, spin: 300, c: "rgb(251 191 36 / 0.24)" },
];

function Tree({ x, y, s, tone }: { x: number; y: number; s: number; tone: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} fill={tone}>
      <rect x="-2" y="-14" width="4" height="16" rx="1.5" />
      <g className="eq-eco-tree">
        <circle cx="0" cy="-26" r="14" />
        <circle cx="-9" cy="-18" r="9" />
        <circle cx="9" cy="-18" r="9" />
      </g>
    </g>
  );
}

function Pine({ x, y, s, tone }: { x: number; y: number; s: number; tone: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} fill={tone}>
      <rect x="-1.5" y="-8" width="3" height="10" />
      <path className="eq-eco-tree" d="M0-46 14-14H-14Z M0-34 17-4H-17Z" />
    </g>
  );
}

const LUSH_LEAVES = makeLeaves(26, 7, [
  "rgb(52 211 153 / 0.5)",
  "rgb(163 230 53 / 0.48)",
  "rgb(110 231 183 / 0.42)",
  "rgb(250 204 21 / 0.48)",
  "rgb(190 242 100 / 0.45)",
  "rgb(251 191 36 / 0.4)",
]);

const LUSH_FIREFLIES = makeFireflies(28, 77);

export default function EcoBackground({ lush = false }: { lush?: boolean }) {
  return (
    <div className="eq-eco-bg" aria-hidden>
      <div className={lush ? "eq-eco-photo eq-eco-photo--lush" : "eq-eco-photo"} />
      <div className="eq-eco-grid" />
      <div className="eq-eco-sweep" />
      <div className="eq-eco-glow eq-eco-glow--sun" />
      <div className="eq-eco-glow eq-eco-glow--leaf" />
      <div className="eq-eco-glow eq-eco-glow--moss" />
      <Fireflies fireflies={lush ? LUSH_FIREFLIES : undefined} />
      <PauseWhileScrolling />

      <svg className="eq-eco-contours" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
        <defs>
          <path id="eq-contour" d={BLOB} vectorEffect="non-scaling-stroke" />
        </defs>
        <g fill="none" stroke="currentColor" strokeWidth="1.2">
          <g transform="translate(250 170) rotate(-12)">
            {RINGS.map((k) => (
              <use key={k} href="#eq-contour" transform={`scale(${k} ${k * 0.8})`} />
            ))}
          </g>
          <g transform="translate(1210 600) rotate(24)">
            {RINGS.map((k) => (
              <use key={k} href="#eq-contour" transform={`scale(${k * 1.1} ${k * 0.75})`} />
            ))}
          </g>
        </g>
      </svg>

      <FallingLeaves leaves={lush ? LUSH_LEAVES : LEAVES} className={lush ? "eq-leaves--lush" : ""} />

      <svg className="eq-eco-hills" viewBox="0 0 1440 220" preserveAspectRatio="xMidYMax slice">
        <path fill="#081f16" d="M0 120C180 70 330 64 520 98s370 40 560-6 260-44 360-30V220H0Z" />
        <Pine x={210} y={102} s={0.9} tone={TREELINE.far} />
        <Tree x={300} y={92} s={1} tone={TREELINE.far} />
        <Pine x={1120} y={88} s={1.05} tone={TREELINE.far} />
        <Tree x={1200} y={86} s={0.85} tone={TREELINE.far} />
        <path fill="#0a2419" d="M0 160C150 128 290 118 440 136s300 36 470 12 330-52 530-30V220H0Z" />
        <Tree x={120} y={150} s={1.15} tone={TREELINE.near} />
        <Pine x={175} y={150} s={1.2} tone={TREELINE.near} />
        <Tree x={640} y={152} s={1.25} tone={TREELINE.near} />
        <Pine x={700} y={150} s={1} tone={TREELINE.near} />
        <Tree x={985} y={140} s={1.05} tone={TREELINE.near} />
        <Pine x={1360} y={124} s={1.25} tone={TREELINE.near} />
        <path fill="#0c2b1f" d="M0 196C220 172 420 168 640 184s420 22 560 6 200-18 240-14V220H0Z" />
      </svg>
    </div>
  );
}
