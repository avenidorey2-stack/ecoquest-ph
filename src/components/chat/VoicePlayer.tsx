"use client";

import { useEffect, useRef, useState } from "react";
import { clock } from "@/components/ui/useVoiceRecorder";
import { PauseIcon, PlayIcon } from "@/components/ui/icons";

/**
 * A voice message: play/pause, a seek bar and the time, styled like a chat bubble (`mine` = green).
 * Plays a stored message (`src`) or a recording not sent yet (`file`, through an object URL).
 * WebM recordings from Chrome often don't state their length; seeking far ahead once makes the
 * browser work it out, so the bar and time are right.
 */
export default function VoicePlayer({ src, file, mine, onLoad }: { src?: string; file?: File; mine: boolean; onLoad?: () => void }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const fixing = useRef(false);

  // A local recording: its object URL is made and freed here (no state needed).
  useEffect(() => {
    const el = audio.current;
    if (!file || !el) return;
    const url = URL.createObjectURL(file);
    el.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Only one voice message plays at a time.
  useEffect(() => {
    const el = audio.current;
    if (!el) return;
    // A message in the server-rendered page may have loaded its length before React was
    // listening: replay the event so the handler below picks it up.
    if (el.readyState >= HTMLMediaElement.HAVE_METADATA) el.dispatchEvent(new Event("loadedmetadata"));
    const others = (e: Event) => e.target !== el && el.pause();
    document.addEventListener("play", others, true);
    return () => document.removeEventListener("play", others, true);
  }, []);

  function loaded() {
    const el = audio.current!;
    if (Number.isFinite(el.duration)) {
      setDuration(el.duration);
    } else {
      fixing.current = true;
      el.currentTime = 1e7;
    }
    onLoad?.();
  }

  function timeUpdate() {
    const el = audio.current!;
    if (fixing.current) {
      if (!Number.isFinite(el.duration)) return;
      fixing.current = false;
      setDuration(el.duration);
      el.currentTime = 0;
      return;
    }
    setTime(el.currentTime);
  }

  function toggle() {
    const el = audio.current!;
    if (el.paused) el.play().catch(() => setPlaying(false));
    else el.pause();
  }

  const ring = mine ? "bg-emerald-400 text-emerald-950" : "bg-card-3 text-ink";
  const btn = mine ? "bg-emerald-950/15 hover:bg-emerald-950/25" : "bg-emerald-400/15 text-emerald-300 hover:bg-emerald-400/25";
  return (
    <div className={`flex w-64 max-w-full items-center gap-2 rounded-2xl px-2 py-1.5 ${mine ? "rounded-br-md" : "rounded-bl-md"} ${ring}`}>
      <audio
        ref={audio}
        src={src}
        preload="metadata"
        onLoadedMetadata={loaded}
        onDurationChange={() => audio.current && Number.isFinite(audio.current.duration) && !fixing.current && setDuration(audio.current.duration)}
        onTimeUpdate={timeUpdate}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setTime(0);
        }}
        className="hidden"
      />
      <button type="button" onClick={toggle} aria-label={playing ? "Pause voice message" : "Play voice message"} className={`grid h-10 w-10 shrink-0 place-items-center rounded-full transition-colors ${btn}`}>
        {playing ? <PauseIcon className="h-4 w-4" /> : <PlayIcon className="h-4 w-4" />}
      </button>
      <input
        type="range"
        min={0}
        max={duration || 1}
        step={0.1}
        value={Math.min(time, duration || 1)}
        onChange={(e) => {
          const el = audio.current!;
          el.currentTime = Number(e.target.value);
          setTime(el.currentTime);
        }}
        disabled={!duration}
        aria-label="Voice message position"
        className={`h-1.5 min-w-0 flex-1 cursor-pointer ${mine ? "accent-emerald-950" : "accent-emerald-400"}`}
      />
      <span className="w-10 shrink-0 text-right text-xs tabular-nums">{clock(playing || time ? time : duration)}</span>
    </div>
  );
}
