"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

const STEPS = [
  {
    icon: "🌱",
    title: "Welcome to EcoQuest PH!",
    body: "Plant trees in your city, prove it with a photo, and earn points you can turn into GCash, Maya, Grab and Shopee rewards.",
  },
  {
    icon: "📍",
    title: "Set your home city",
    body: "You can claim planting slots only in your own city or municipality — it also decides your local leaderboard.",
  },
  {
    icon: "🗺️",
    title: "Claim a slot on the map",
    body: "Green pins are open slots near you. Many planters can share one site, so tap a pin and press “Claim slot”.",
  },
  {
    icon: "📸",
    title: "Plant and upload proof",
    body: "Plant the listed species, then upload a photo or video with your plant count. An admin verifies it — and your tree grows!",
  },
  {
    icon: "🏆",
    title: "Climb and cash in",
    body: "Points count toward the weekly leaderboard (resets Monday) and can be redeemed in the Shop. Invite friends for bonus points.",
  },
];

export default function WelcomeModal({ hasCity, invitedBy }: { hasCity: boolean; invitedBy: string | null }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [open, setOpen] = useState(true);
  if (!open) return null;

  const current = STEPS[step];
  const last = step === STEPS.length - 1;

  function finish() {
    setOpen(false);
    fetch("/api/onboarding", { method: "POST" })
      .catch(() => {})
      .finally(() => router.refresh());
  }

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-title"
      onKeyDown={(e) => e.key === "Escape" && finish()}
    >
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center text-slate-900 shadow-2xl">
        {step === 0 && invitedBy && (
          <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs text-emerald-800">
            You were invited by <strong>{invitedBy}</strong> 🎉
          </p>
        )}
        <p className="text-5xl" aria-hidden>
          {current.icon}
        </p>
        <h2 id="welcome-title" className="mt-3 text-lg font-semibold">
          {current.title}
        </h2>
        <p className="mt-2 text-sm text-slate-600">{current.body}</p>

        <div className="mt-4 flex justify-center gap-1.5" aria-hidden>
          {STEPS.map((_, i) => (
            <span key={i} className={`h-1.5 w-6 rounded-full ${i <= step ? "bg-emerald-700" : "bg-slate-200"}`} />
          ))}
        </div>
        <p className="sr-only">
          Step {step + 1} of {STEPS.length}
        </p>

        <div className="mt-5 flex gap-2">
          {step > 0 ? (
            <button onClick={() => setStep(step - 1)} className="flex-1 rounded-lg border py-2 text-sm">
              Back
            </button>
          ) : (
            <button onClick={finish} className="flex-1 rounded-lg py-2 text-sm text-slate-500 hover:bg-slate-50">
              Skip
            </button>
          )}
          {last ? (
            hasCity ? (
              <button onClick={finish} autoFocus className="flex-1 rounded-lg bg-emerald-700 py-2 text-sm font-semibold text-white">
                Start planting
              </button>
            ) : (
              <Link
                href="/profile"
                onClick={finish}
                className="flex-1 rounded-lg bg-emerald-700 py-2 text-sm font-semibold text-white"
              >
                Set my city
              </Link>
            )
          ) : (
            <button
              onClick={() => setStep(step + 1)}
              autoFocus
              className="flex-1 rounded-lg bg-emerald-700 py-2 text-sm font-semibold text-white"
            >
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
