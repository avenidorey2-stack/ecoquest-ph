"use client";

import { useEffect, useRef, useState } from "react";
import { formatSize, mediaRuleError } from "@/lib/media-rules";
import { prepareMedia } from "@/lib/media-prepare";
import WebcamCapture from "@/components/quests/WebcamCapture";
import { CameraIcon, ImageIcon, UploadIcon, VideoIcon } from "@/components/ui/icons";

/** Thumbnail of the chosen file. Object URLs are made and revoked in an effect so none leak. */
function FilePreview({ file }: { file: File }) {
  const imgRef = useRef<HTMLImageElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const isVideo = file.type.startsWith("video/");

  useEffect(() => {
    const el = isVideo ? videoRef.current : imgRef.current;
    if (!el) return;
    const url = URL.createObjectURL(file);
    el.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file, isVideo]);

  return isVideo ? (
    <video ref={videoRef} controls playsInline muted preload="metadata" className="max-h-60 w-full rounded-xl bg-canvas object-contain" />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element -- local blob preview, not an optimisable asset
    <img ref={imgRef} alt="Selected proof" className="max-h-60 w-full rounded-xl bg-canvas object-contain" />
  );
}

const optionBtn =
  "flex flex-col items-center justify-center gap-1.5 rounded-xl border border-line bg-card px-2 py-3 text-xs font-semibold text-ink-2 shadow-sm transition-colors hover:border-emerald-400/40 hover:bg-emerald-400/10 active:bg-emerald-400/15 disabled:opacity-50";

/**
 * How proof gets picked. Phones/tablets: take a photo, record a video, or choose from the
 * photo library / files. Desktop: drag & drop, browse files, or snap a photo with the webcam.
 * The layout switches on the pointer type in CSS, so server and client render the same markup.
 */
export default function ProofMediaPicker({
  file,
  onChange,
  disabled = false,
}: {
  file: File | null;
  onChange: (file: File | null) => void;
  disabled?: boolean;
}) {
  const photoInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [webcam, setWebcam] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A file dropped outside the drop zone would make the browser open it and leave the page.
  useEffect(() => {
    const block = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
    };
    window.addEventListener("dragover", block);
    window.addEventListener("drop", block);
    return () => {
      window.removeEventListener("dragover", block);
      window.removeEventListener("drop", block);
    };
  }, []);

  async function pick(raw: File | null | undefined) {
    if (!raw) return;
    // Phone cameras may mislabel files or save HEIC: fix the type (and convert) before checking.
    const next = await prepareMedia(raw);
    const problem = mediaRuleError(next);
    setError(problem);
    setWebcam(false);
    if (!problem) onChange(next);
  }

  function fromInput(e: React.ChangeEvent<HTMLInputElement>) {
    pick(e.target.files?.[0]);
    e.target.value = ""; // so picking the same file again still fires `change`
  }

  if (file) {
    return (
      <div className="space-y-2">
        <FilePreview file={file} />
        <div className="flex items-center justify-between gap-3 text-xs text-ink-3">
          <span className="min-w-0 truncate">
            {file.name} · {formatSize(file.size)}
          </span>
          <button
            type="button"
            onClick={() => onChange(null)}
            disabled={disabled}
            className="shrink-0 rounded-lg px-2 py-1.5 font-semibold text-emerald-400 hover:bg-emerald-400/10 disabled:opacity-50"
          >
            Choose Another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Hidden inputs, opened by the buttons below. `capture` goes straight to the camera. */}
      <input ref={photoInput} type="file" accept="image/*" capture="environment" onChange={fromInput} className="sr-only" tabIndex={-1} aria-hidden />
      <input ref={videoInput} type="file" accept="video/*" capture="environment" onChange={fromInput} className="sr-only" tabIndex={-1} aria-hidden />
      <input ref={fileInput} type="file" accept="image/*,video/*" onChange={fromInput} className="sr-only" tabIndex={-1} aria-hidden />

      {webcam ? (
        <WebcamCapture onCapture={pick} onCancel={() => setWebcam(false)} />
      ) : (
        <>
          {/* Phones & tablets */}
          <div className="hidden grid-cols-3 gap-2 pointer-coarse:grid">
            <button type="button" onClick={() => photoInput.current?.click()} disabled={disabled} className={optionBtn}>
              <CameraIcon className="h-6 w-6 text-emerald-400" />
              Take Photo
            </button>
            <button type="button" onClick={() => videoInput.current?.click()} disabled={disabled} className={optionBtn}>
              <VideoIcon className="h-6 w-6 text-emerald-400" />
              Record Video
            </button>
            <button type="button" onClick={() => fileInput.current?.click()} disabled={disabled} className={optionBtn}>
              <ImageIcon className="h-6 w-6 text-emerald-400" />
              Photos & Files
            </button>
          </div>

          {/* Desktop */}
          <div
            onDragEnter={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "copy";
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (!disabled) pick(e.dataTransfer.files[0]);
            }}
            className={`rounded-xl border-2 border-dashed px-4 py-5 text-center transition-colors pointer-coarse:hidden ${
              dragging ? "border-emerald-500 bg-emerald-400/10" : "border-line-strong bg-card"
            }`}
          >
            <UploadIcon className="mx-auto h-7 w-7 text-emerald-400" />
            <p className="mt-2 text-sm font-medium text-ink-2">
              {dragging ? "Drop It Here" : "Drag & drop a photo or video here"}
            </p>
            <p className="text-xs text-ink-3">or</p>
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                disabled={disabled}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-400 px-3 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-300 disabled:opacity-50"
              >
                <ImageIcon className="h-4 w-4" /> Browse Files
              </button>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setWebcam(true);
                }}
                disabled={disabled}
                className="flex items-center gap-1.5 rounded-lg border border-line bg-card px-3 py-2 text-sm font-semibold text-ink-2 hover:bg-card-2 disabled:opacity-50"
              >
                <CameraIcon className="h-4 w-4" /> Use Webcam
              </button>
            </div>
          </div>
        </>
      )}

      <p className="text-xs text-ink-3">Show all the plants in this batch. Photos up to 10 MB (JPG, PNG, WebP), videos up to 50 MB (MP4, MOV).</p>
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
