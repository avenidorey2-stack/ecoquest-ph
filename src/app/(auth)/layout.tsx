import Link from "next/link";
import EcoBackground from "@/components/layout/EcoBackground";
import { CameraIcon, GiftIcon, LogoMark, PinIcon } from "@/components/ui/icons";

const STEPS = [
  { Icon: PinIcon, title: "Claim a planting slot", text: "Pick an open spot in your home city on the live map." },
  { Icon: CameraIcon, title: "Plant & upload proof", text: "Snap a photo or video. Our team verifies every tree." },
  { Icon: GiftIcon, title: "Earn real rewards", text: "Trade points for GCash, Maya, vouchers or seedlings." },
];

/** A sapling growing on a hillside at sunrise (reuses the celebration draw/grow keyframes). */
function SaplingScene() {
  return (
    <svg viewBox="0 0 480 230" className="eq-celebration block w-full" aria-hidden>
      <circle className="eq-pop" cx="380" cy="70" r="30" fill="#fde68a" fillOpacity=".95" style={{ animationDelay: "0.1s" }} />
      <path fill="#065f46" d="M0 150c70-34 150-42 240-20s170 18 240-12v112H0Z" />
      <g fill="#047857">
        <path d="M58 140 72 108 86 140Z M62 130 72 100 82 130Z" />
        <path d="M420 128 432 100 444 128Z" />
        <circle cx="118" cy="128" r="13" />
        <rect x="116.5" y="131" width="3" height="12" />
      </g>
      <path fill="#064e3b" d="M0 182c90-26 190-30 280-12s150 16 200-2v62H0Z" />
      <g transform="translate(248 178)">
        <ellipse cx="0" cy="4" rx="34" ry="6" fill="#022c22" fillOpacity=".55" />
        <path
          className="eq-draw"
          pathLength={1}
          d="M0 4C0-14 1-30-2-50"
          stroke="#a7f3d0"
          strokeWidth="4"
          strokeLinecap="round"
          fill="none"
          style={{ animationDelay: "0.4s" }}
        />
        <g className="eq-sway">
          <path className="eq-pop" d="M-1-30c-20-2-30-14-30-26 14 0 28 8 30 26Z" fill="#34d399" style={{ animationDelay: "1.1s" }} />
          <path className="eq-pop" d="M-1-42c18-4 30-18 30-32-16 2-29 12-30 32Z" fill="#6ee7b7" style={{ animationDelay: "1.35s" }} />
          <path className="eq-pop" d="M-2-50c-6-10-4-20 4-26 6 8 4 18-4 26Z" fill="#a7f3d0" style={{ animationDelay: "1.6s" }} />
        </g>
      </g>
    </svg>
  );
}

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh text-slate-900">
      <EcoBackground />

      <aside className="relative hidden w-[44%] max-w-xl shrink-0 flex-col overflow-hidden bg-gradient-to-b from-emerald-900 via-emerald-950 to-[#04291f] text-white lg:flex">
        <div className="eq-sidebar-glow" aria-hidden />
        <div className="relative flex flex-1 flex-col px-10 pt-10 xl:px-14 xl:pt-12">
          <Link href="/" className="flex w-fit items-center gap-3">
            <LogoMark className="h-10 w-10" />
            <span className="leading-tight">
              <span className="block text-lg font-bold tracking-tight">EcoQuest PH</span>
              <span className="block text-[11px] font-medium uppercase tracking-[0.18em] text-emerald-300/80">
                Gamified climate action
              </span>
            </span>
          </Link>

          <div className="eq-stagger my-auto space-y-8 py-10">
            <div>
              <h2 className="text-3xl font-bold leading-tight tracking-tight text-balance xl:text-4xl">
                Plant trees. Earn rewards. <span className="text-emerald-300">Grow a greener Philippines.</span>
              </h2>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-emerald-100/75">
                Join planters across the country turning native trees into points, badges and real-world rewards.
              </p>
            </div>
            <ul className="eq-stagger space-y-4">
              {STEPS.map(({ Icon, title, text }) => (
                <li key={title} className="flex gap-3.5">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10 text-emerald-200 ring-1 ring-white/10">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold">{title}</span>
                    <span className="block text-sm text-emerald-100/65">{text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <SaplingScene />
      </aside>

      <main className="flex min-w-0 flex-1 flex-col items-center justify-center px-4 py-10 sm:px-6">
        <Link href="/" className="eq-fade mb-6 flex items-center gap-2.5 lg:hidden">
          <LogoMark className="h-10 w-10" />
          <span className="text-xl font-bold tracking-tight text-emerald-900">EcoQuest PH</span>
        </Link>
        <div className="eq-rise w-full max-w-md rounded-3xl border border-white/70 bg-white/90 p-6 shadow-xl shadow-emerald-950/[0.06] ring-1 ring-slate-900/5 backdrop-blur-sm sm:p-8">
          {children}
        </div>
        <p className="mt-6 flex items-center gap-1.5 text-xs text-slate-500">
          Every verified tree is planted in the Philippines
        </p>
      </main>
    </div>
  );
}
