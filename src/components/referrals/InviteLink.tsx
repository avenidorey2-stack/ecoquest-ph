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

  const button = "rounded-lg px-4 py-2 text-sm font-medium";
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          aria-label="Your invite link"
          className="min-w-0 flex-1 rounded-lg border bg-gray-50 px-3 py-2 font-mono text-sm"
        />
        <button onClick={copy} className={`${button} bg-green-600 text-white hover:bg-green-700`}>
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={share} className={`${button} border hover:bg-gray-50`}>
          Share…
        </button>
        <a
          href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`}
          target="_blank"
          rel="noopener noreferrer"
          className={`${button} border hover:bg-gray-50`}
        >
          Facebook
        </a>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(`${SHARE_TEXT} ${url}`)}`}
          target="_blank"
          rel="noopener noreferrer"
          className={`${button} border hover:bg-gray-50`}
        >
          WhatsApp
        </a>
      </div>
    </div>
  );
}
