"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = "image/jpeg,image/png,image/webp";

/** Profile picture with click-to-change, preview while uploading, and remove. */
export default function AvatarUploader({
  src,
  initials,
  hasUpload,
}: {
  src: string | null;
  initials: string;
  /** True when the current picture is an upload (vs. the Google photo or initials). */
  hasUpload: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Free each local preview once it's replaced or the component unmounts — not while it's on screen.
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  async function upload(file: File) {
    setError(null);
    if (!ACCEPT.split(",").includes(file.type)) return setError("Choose a JPG, PNG or WebP image.");
    if (file.size > MAX_BYTES) return setError("That image is over 5 MB.");

    const local = URL.createObjectURL(file);
    setPreview(local);
    setBusy(true);
    const form = new FormData();
    form.set("file", file);
    const res = await fetch("/api/profile/avatar", { method: "POST", body: form }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setError((await res?.json().catch(() => ({})))?.error ?? "Upload failed. Please try again.");
      setPreview(null);
    } else {
      router.refresh(); // header, dashboard and leaderboard pick up the new picture
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/profile/avatar", { method: "DELETE" }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setError("Couldn't remove the picture. Please try again.");
    setPreview(null);
    router.refresh();
  }

  const shown = preview ?? src;

  return (
    <div className="flex shrink-0 flex-col items-center gap-1.5">
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy}
        className="group relative h-20 w-20 overflow-hidden rounded-full ring-4 ring-emerald-100 focus:outline-none focus-visible:ring-emerald-400"
        aria-label="Change profile picture"
      >
        <AnimatePresence mode="wait">
          {shown ? (
            <motion.img
              key={shown}
              src={shown}
              alt=""
              className="h-full w-full object-cover"
              initial={{ opacity: 0, scale: 1.1 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
            />
          ) : (
            <span className="grid h-full w-full place-items-center bg-emerald-700 text-3xl font-bold text-emerald-50">{initials}</span>
          )}
        </AnimatePresence>
        <span className="absolute inset-0 grid place-items-center bg-slate-950/45 text-[11px] font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          {busy ? "Uploading…" : "Change"}
        </span>
        {busy && <span className="absolute inset-0 animate-pulse bg-white/30" aria-hidden />}
      </button>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = ""; // allow re-selecting the same file
          if (file) upload(file);
        }}
      />
      {hasUpload && !busy && (
        <button type="button" onClick={remove} className="text-[11px] text-slate-500 hover:text-rose-600">
          Remove photo
        </button>
      )}
      {error && (
        <p className="max-w-40 text-center text-[11px] text-rose-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
