"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { baseType, VOICE_RULES } from "@/lib/media-rules";

// Records a voice message with the microphone (MediaRecorder). Used by chats (sent as a voice
// message) and EcoBot (turned into text). MP4/AAC comes first because every phone can play it;
// browsers that can't record it (Firefox, older Chrome) fall back to Opus in WebM or Ogg.

const RECORD_TYPES = ["audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/ogg"];
/** Shorter than this is almost always a mis-tap. */
const MIN_MS = 700;

export function canRecordVoice() {
  return typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";
}

/** Why the microphone couldn't start, in plain words. */
function micError(err: unknown) {
  const name = (err as { name?: string })?.name;
  if (name === "NotAllowedError" || name === "SecurityError") return "Allow microphone access for this site in your browser settings, then try again.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No microphone found on this device.";
  if (name === "NotReadableError") return "Your microphone is busy in another app. Close it and try again.";
  return "Couldn't start recording. Please try again.";
}

/**
 * `start()` asks for the microphone and records; `stop()` ends it and calls `onDone` with the
 * recording; `cancel()` throws it away. Recording also stops by itself after `maxSeconds`.
 */
export function useVoiceRecorder({ maxSeconds, onDone }: { maxSeconds: number; onDone: (file: File) => void }) {
  const [state, setState] = useState<"idle" | "starting" | "recording">("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<number | null>(null);
  const keep = useRef(true);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  }, [onDone]);

  const release = useCallback(() => {
    if (timer.current !== null) window.clearInterval(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    recorder.current = null;
    setState("idle");
    setSeconds(0);
  }, []);

  const stop = useCallback(() => {
    keep.current = true;
    if (recorder.current?.state === "recording") recorder.current.stop();
  }, []);

  const cancel = useCallback(() => {
    keep.current = false;
    if (recorder.current?.state === "recording") recorder.current.stop();
    else release();
  }, [release]);

  const start = useCallback(async () => {
    if (state !== "idle") return;
    setError(null);
    if (!canRecordVoice()) {
      setError("Voice recording isn't supported in this browser.");
      return;
    }
    setState("starting");
    let mic: MediaStream;
    try {
      mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (err) {
      setError(micError(err));
      setState("idle");
      return;
    }
    const type = RECORD_TYPES.find((t) => MediaRecorder.isTypeSupported?.(t));
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(mic, type ? { mimeType: type, audioBitsPerSecond: 64_000 } : undefined);
    } catch {
      mic.getTracks().forEach((t) => t.stop());
      setError("Voice recording isn't supported in this browser.");
      setState("idle");
      return;
    }
    const chunks: Blob[] = [];
    const startedAt = Date.now();
    keep.current = true;
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      const kept = keep.current;
      const length = Date.now() - startedAt;
      const recorded = baseType(rec.mimeType || type || "");
      release();
      if (!kept) return;
      const rule = VOICE_RULES[recorded];
      if (!rule) {
        setError("This browser records voice in a format we can't send. Try Chrome or Safari.");
        return;
      }
      if (length < MIN_MS) {
        setError("That was too short. Tap the mic and talk, then tap Stop.");
        return;
      }
      done.current(new File(chunks, `voice-message.${rule.ext}`, { type: recorded }));
    };
    stream.current = mic;
    recorder.current = rec;
    rec.start(250);
    setState("recording");
    timer.current = window.setInterval(() => {
      const s = Math.floor((Date.now() - startedAt) / 1000);
      setSeconds(s);
      if (s >= maxSeconds) stop();
    }, 250);
  }, [state, maxSeconds, release, stop]);

  // Leaving the page mid-recording frees the microphone.
  useEffect(
    () => () => {
      keep.current = false;
      if (recorder.current?.state === "recording") recorder.current.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
      if (timer.current !== null) window.clearInterval(timer.current);
    },
    [],
  );

  return { state, seconds, error, setError, start, stop, cancel };
}

/** 75 → "1:15". */
export const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
