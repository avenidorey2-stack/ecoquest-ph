"use client";

import { useState } from "react";

const SHARE_TEXT = "Join me on EcoQuest PH — plant trees in your city, earn points, and redeem GCash rewards! 🌱";

export default function InviteLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy your invite link:", url);
    }
  }

  async function share() {
    try {
      await navigator.share({ title: "EcoQuest PH", text: SHARE_TEXT, url });
    } catch {
      // Cancelled or unsupported — copying is the fallback.
      copy();
    }
  }

  const button = "min-h-11 rounded-xl px-4 py-3 text-sm font-medium shadow-sm transition motion-safe:active:scale-[0.98]";
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          aria-label="Your invite link"
          className="min-w-0 flex-1 rounded-xl border border-line bg-card-2 px-3.5 py-2.5 font-mono text-base sm:text-sm"
        />
        <button onClick={copy} className={`${button} bg-emerald-400 text-emerald-950 hover:bg-emerald-300`}>
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={share} className={`${button} border border-line-strong bg-card hover:bg-card-2`}>
          Share…
        </button>
        <a
          href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`}
          target="_blank"
          rel="noopener noreferrer"
          className={`${button} border border-line-strong bg-card hover:bg-card-2`}
        >
          Facebook
        </a>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(`${SHARE_TEXT} ${url}`)}`}
          target="_blank"
          rel="noopener noreferrer"
          className={`${button} border border-line-strong bg-card hover:bg-card-2`}
        >
          WhatsApp
        </a>
      </div>
    </div>
  );
}
