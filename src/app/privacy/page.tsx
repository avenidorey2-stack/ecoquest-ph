import Link from "next/link";
import { ChevronLeftIcon } from "@/components/ui/icons";

export const metadata = { title: "Privacy Policy · EcoQuest PH" };

const UPDATED = "October 6, 2026";

const SECTIONS: { title: string; body: React.ReactNode }[] = [
  {
    title: "What We Collect",
    body: (
      <ul className="list-disc space-y-1.5 pl-5">
        <li>Your name, email address and password (stored only as a secure hash), or your Google sign-in.</li>
        <li>Your home city, used to show planting slots near you and your local leaderboard.</li>
        <li>The planting photos and videos you upload, with the number of plants and the slot&apos;s location.</li>
        <li>Delivery details you enter for cash-on-delivery seedling orders, and the e-wallet number for cash-outs.</li>
        <li>Your points, quests, badges, friends, likes, comments, and the problem reports you send us.</li>
      </ul>
    ),
  },
  {
    title: "Who Can See What",
    body: (
      <ul className="list-disc space-y-1.5 pl-5">
        <li>Other signed-in planters see your name, profile picture, level, city, points and badges (for example on leaderboards).</li>
        <li>
          Your approved planting photos follow your choice in Settings → Privacy: Everyone, Friends Only, or Only Me. Likes and comments
          follow the same choice.
        </li>
        <li>Our team sees your submissions to verify them, your orders and cash-outs to fulfil them, and your reports to help you.</li>
        <li>Your email, delivery details and e-wallet number are never shown to other planters.</li>
        <li>People you block can&apos;t find you or see your photos, and you won&apos;t see them.</li>
      </ul>
    ),
  },
  {
    title: "Services We Use",
    body: (
      <p>
        EcoQuest PH runs on Vercel (hosting) and Supabase (database and file storage). Emails are sent through our email provider. If you
        use Google sign-in, Google confirms your identity. Maps load from OpenStreetMap, which receives your device&apos;s map requests. We
        don&apos;t sell your data or show third-party ads.
      </p>
    ),
  },
  {
    title: "Your Choices",
    body: (
      <ul className="list-disc space-y-1.5 pl-5">
        <li>Edit your name, picture and home city on your Profile.</li>
        <li>Choose who sees your planting photos, and which social notifications you get, in Settings.</li>
        <li>
          Delete your account in Settings once no seedling order or cash-out is still in progress. This permanently removes your account,
          photos, points, orders, friends, comments and reports.
        </li>
      </ul>
    ),
  },
  {
    title: "Questions",
    body: <p>Use Settings → Report a Problem to ask our team anything about your data.</p>,
  },
];

/** Public privacy policy (linked from Settings). Plain language; reviewed by the project owner. */
export default function PrivacyPage() {
  return (
    <main className="min-h-dvh bg-canvas px-4 py-8 text-ink sm:px-6">
      <article className="mx-auto max-w-2xl space-y-6">
        <Link href="/settings" className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-emerald-300 hover:text-emerald-200">
          <ChevronLeftIcon className="h-4 w-4" /> Back
        </Link>
        <header>
          <h1 className="text-2xl font-bold">Privacy Policy</h1>
          <p className="mt-1 text-sm text-ink-3">Last updated {UPDATED}</p>
          <p className="mt-3 text-sm text-ink-2">
            EcoQuest PH helps planters across the Philippines plant native trees and earn rewards. This page explains, in plain words, what
            we keep about you and who can see it.
          </p>
        </header>
        {SECTIONS.map((s) => (
          <section key={s.title} className="rounded-2xl border border-line/80 bg-card p-5 text-sm leading-relaxed text-ink-2">
            <h2 className="mb-2 text-base font-semibold text-ink">{s.title}</h2>
            {s.body}
          </section>
        ))}
      </article>
    </main>
  );
}
