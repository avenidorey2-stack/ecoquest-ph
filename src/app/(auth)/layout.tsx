import Link from "next/link";
import EcoBackground from "@/components/layout/EcoBackground";
import FallingLeaves, { makeLeaves } from "@/components/layout/FallingLeaves";
import MorphWord from "@/components/ui/MorphWord";
import CountUp from "@/components/ui/CountUp";
import { CameraIcon, GiftIcon, LogoMark, PinIcon } from "@/components/ui/icons";
import { getCommunityStats, type CommunityStats } from "@/lib/impact";
import { HERO_PHOTO } from "@/data/tree-photos";

const STEPS = [
  { Icon: PinIcon, title: "Claim a slot", text: "Pick an open spot in your city on the live map." },
  { Icon: CameraIcon, title: "Plant & prove it", text: "Upload a photo. Our team verifies every tree." },
  { Icon: GiftIcon, title: "Earn rewards", text: "Trade points for GCash, Maya or vouchers." },
];

const REWARDS = ["rewards", "badges", "GCash", "vouchers"];

// Light leaves drifting down the photo panel.
const HERO_LEAVES = makeLeaves(
  14,
  21,
  ["rgb(110 231 183 / 0.6)", "rgb(190 242 100 / 0.55)", "rgb(253 224 71 / 0.5)", "rgb(52 211 153 / 0.55)", "rgb(251 191 36 / 0.45)"],
  { size: [14, 26], duration: [14, 26] },
);

/** Live headline numbers; the sign-in page still works if the database is unreachable. */
async function loadStats(): Promise<CommunityStats | null> {
  try {
    return await getCommunityStats();
  } catch {
    return null;
  }
}

export default async function AuthLayout({ children }: LayoutProps<"/">) {
  const stats = await loadStats();
  const STATS = stats
    ? [
        { value: stats.plants, label: "Trees planted" },
        { value: stats.planters, label: "Planters" },
        { value: stats.cities, label: "Cities greening" },
      ].filter((s) => s.value > 0) // "0+" undersells; a new install shows no numbers yet
    : [];

  return (
    <div className="flex min-h-dvh text-ink">
      <EcoBackground lush />

      {/* Photo hero: a slow zoom on the forest, leaves falling, live numbers. */}
      <aside className="relative m-3 hidden w-[56%] max-w-3xl shrink-0 flex-col overflow-hidden rounded-[2rem] text-white ring-1 ring-white/10 lg:flex xl:m-4">
        <div className="absolute inset-0 overflow-hidden" aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element -- static decorative photo */}
          <img src="/images/auth-hero.jpg" alt="" className="eq-kenburns h-full w-full object-cover" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-[#04100b] via-[#04100b]/55 to-[#04100b]/10" aria-hidden />
        <div className="absolute inset-0 bg-gradient-to-r from-[#04100b]/70 to-transparent" aria-hidden />
        <FallingLeaves leaves={HERO_LEAVES} />

        <div className="relative flex flex-1 flex-col p-10 xl:p-12">
          <Link href="/" className="flex w-fit items-center gap-3">
            <LogoMark className="h-10 w-10" />
            <span className="leading-tight">
              <span className="block text-lg font-bold tracking-tight">EcoQuest PH</span>
              <span className="block text-[11px] font-medium uppercase tracking-[0.18em] text-emerald-300/80">
                Gamified climate action
              </span>
            </span>
          </Link>

          <div className="eq-stagger mt-auto space-y-8">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-emerald-100 ring-1 ring-white/15 backdrop-blur">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_2px_rgba(52,211,153,.7)]" />
                Native trees · Real rewards
              </span>
              <h2 className="mt-5 text-5xl font-semibold leading-[1.04] tracking-tight xl:text-6xl">
                Plant trees.
                <br />
                Earn <MorphWord words={REWARDS} className="text-emerald-300" />
                <br />
                <span className="eq-gradient-text">Grow the Philippines.</span>
              </h2>
              <p className="mt-4 max-w-md text-[15px] leading-relaxed text-emerald-50/75">
                Join planters across the country turning native trees into points, badges and real-world rewards.
              </p>
            </div>

            {STATS.length > 0 && (
              <dl className="flex gap-10">
                {STATS.map(({ value, label }, i) => (
                  <div key={label}>
                    <dt className="sr-only">{label}</dt>
                    <dd className="text-3xl font-semibold tracking-tight">
                      <CountUp to={value} delay={0.3 + i * 0.15} />
                      <span className="text-emerald-400">+</span>
                    </dd>
                    <p className="mt-0.5 text-xs text-emerald-50/60">{label}</p>
                  </div>
                ))}
              </dl>
            )}

            <ul className="eq-stagger grid grid-cols-3 gap-3">
              {STEPS.map(({ Icon, title, text }) => (
                <li key={title} className="rounded-2xl bg-white/[0.07] p-4 ring-1 ring-white/10 backdrop-blur-md">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-400/25">
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  <span className="mt-3 block text-sm font-semibold">{title}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-emerald-50/60">{text}</span>
                </li>
              ))}
            </ul>
            <p className="text-[10px] text-white/40">
              Photo:{" "}
              <a href={HERO_PHOTO.source} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-white/70">
                {HERO_PHOTO.author}
              </a>{" "}
              · {HERO_PHOTO.license}
            </p>
          </div>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col items-center justify-center px-4 py-10 sm:px-6">
        <Link href="/" className="eq-fade mb-3 flex items-center gap-2.5 lg:hidden">
          <LogoMark className="h-10 w-10" />
          <span className="text-xl font-bold tracking-tight text-ink">EcoQuest PH</span>
        </Link>
        <p className="eq-fade mb-6 text-center text-2xl font-semibold tracking-tight lg:hidden">
          Plant trees. Earn <MorphWord words={REWARDS} className="text-emerald-300" />
        </p>
        <div className="eq-rise eq-auth-card w-full max-w-md rounded-3xl border border-emerald-400/15 bg-card/75 p-6 backdrop-blur-xl sm:p-8">
          {children}
        </div>
        <p className="mt-6 flex items-center gap-2 text-xs text-ink-3">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
          Every verified tree is planted in the Philippines
        </p>
      </main>
    </div>
  );
}
