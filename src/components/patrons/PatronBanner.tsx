"use client";

import { useEffect, useState } from "react";

type Ad = { id: string; companyName: string; imageUrl: string; targetUrl: string };

const ROTATE_MS = 7000;

/** Rotating sponsor banner. Pauses on hover/focus and when the user prefers reduced motion. */
export default function PatronBanner({ ads }: { ads: Ad[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (ads.length < 2 || paused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % ads.length), ROTATE_MS);
    return () => clearInterval(timer);
  }, [ads.length, paused]);

  const ad = ads[index % ads.length];
  if (!ad) return null;

  return (
    <section
      aria-label="Our Patrons"
      className="relative"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <a
        href={ad.targetUrl}
        target="_blank"
        rel="sponsored noopener noreferrer"
        className="block overflow-hidden rounded-lg border"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- external sponsor banner */}
        <img src={ad.imageUrl} alt={`${ad.companyName} — sponsor`} className="aspect-[4/1] w-full object-cover" />
      </a>
      <div className="mt-1 flex items-center justify-between text-[11px] text-ink-3">
        <span>Sponsored · {ad.companyName}</span>
        {ads.length > 1 && (
          <span className="flex gap-1">
            {ads.map((a, i) => (
              <button
                key={a.id}
                onClick={() => setIndex(i)}
                aria-label={`Show ${a.companyName}`}
                aria-current={i === index % ads.length}
                className={`h-1.5 w-1.5 rounded-full ${i === index % ads.length ? "bg-emerald-400" : "bg-line-strong"}`}
              />
            ))}
          </span>
        )}
      </div>
    </section>
  );
}
