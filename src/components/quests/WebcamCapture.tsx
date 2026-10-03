"use client";

import { useEffect, useRef, useState } from "react";
import { CameraIcon } from "@/components/ui/icons";

function cameraErrorMessage(err: unknown) {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Camera access was blocked. Allow the camera in your browser's site settings, or choose a file instead.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No camera was found on this device.";
  if (name === "NotReadableError") return "Your camera is being used by another app. Close it and try again.";
  return "Couldn't start the camera. Choose a file instead.";
}

/** Live webcam preview with a shutter button; hands back a JPEG snapshot as a File. */
export default function WebcamCapture({ onCapture, onCancel }: { onCapture: (file: File) => void; onCancel: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;

    if (!navigator.mediaDevices?.getUserMedia) {
      // Browsers only expose the camera on secure (https / localhost) pages.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- capability check on mount
      setError("Camera isn't available in this browser. Choose a file instead.");
      return;
    }

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        if (videoRef.current) videoRef.current.srcObject = s;
      })
      .catch((err) => !cancelled && setError(cameraErrorMessage(err)));

    // Turn the camera (and its indicator light) off when this closes.
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function snap() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (blob) onCapture(new File([blob], `webcam-${Date.now()}.jpg`, { type: "image/jpeg" }));
        else setError("Couldn't take the photo. Try again.");
      },
      "image/jpeg",
      0.9,
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative aspect-video overflow-hidden rounded-xl bg-slate-900">
        {error ? (
          <p role="alert" className="absolute inset-0 grid place-items-center p-4 text-center text-sm text-slate-200">
            {error}
          </p>
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              onLoadedData={() => setReady(true)}
              className="h-full w-full object-contain"
              aria-label="Camera preview"
            />
            {!ready && (
              <p className="absolute inset-0 grid place-items-center text-sm text-slate-300">
                Starting camera… allow access if your browser asks.
              </p>
            )}
          </>
        )}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={snap}
          disabled={!ready || !!error}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-700 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <CameraIcon className="h-4 w-4" /> Take photo
        </button>
      </div>
    </div>
  );
}
