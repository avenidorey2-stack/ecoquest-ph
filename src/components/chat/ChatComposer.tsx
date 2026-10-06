"use client";

import { useEffect, useId, useRef, useState } from "react";
import { fileWithType, formatSize, MEDIA_ACCEPT, mediaRuleError } from "@/lib/media-rules";
import WebcamCapture from "@/components/quests/WebcamCapture";
import { CameraIcon, CloseIcon, ImageIcon, ReplyIcon, SendIcon } from "@/components/ui/icons";

/** The text box grows up to this many pixels, then scrolls. */
const MAX_INPUT_PX = 128;

/** Small preview of the chosen photo/video. The object URL is made and revoked in an effect. */
function Thumb({ file }: { file: File }) {
  const img = useRef<HTMLImageElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const isVideo = file.type.startsWith("video/");
  useEffect(() => {
    const el = isVideo ? video.current : img.current;
    if (!el) return;
    const url = URL.createObjectURL(file);
    el.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file, isVideo]);
  return isVideo ? (
    <video ref={video} muted playsInline preload="metadata" className="h-14 w-14 shrink-0 rounded-lg bg-black object-cover" />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element -- local blob preview
    <img ref={img} alt="" className="h-14 w-14 shrink-0 rounded-lg bg-card-3 object-cover" />
  );
}

const iconBtn =
  "grid h-11 w-11 shrink-0 place-items-center rounded-full text-emerald-300 transition-colors hover:bg-emerald-400/10 active:bg-emerald-400/20 disabled:opacity-40";

/**
 * Message box: camera (phones: take a photo or record a video; computers: webcam photo), photo &
 * video picker, a text box that grows as you type, and Send. On a computer, Enter sends and
 * Shift+Enter adds a line; on phones Enter adds a line (Send is the button). Sending keeps the
 * keyboard open, like Messenger.
 */
export default function ChatComposer({
  onSend,
  placeholder,
  maxLength,
  note,
  replyingTo,
  onCancelReply,
}: {
  /** Sends; resolves to an error message, or null when sent. */
  onSend: (text: string, file: File | null, onProgress: (pct: number) => void) => Promise<string | null>;
  placeholder: string;
  maxLength: number;
  /** A line above the box (e.g. "This report is resolved…"). */
  note?: React.ReactNode;
  /** The message being replied to ("Replying to Ana" + a preview), with a way to cancel. */
  replyingTo?: { key: string; label: string; preview: string } | null;
  onCancelReply?: () => void;
}) {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [webcam, setWebcam] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  // Unique per box: two pop-up chat windows can be open at once.
  const inputId = useId();
  const cameraInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Choosing Reply puts the cursor in the box (and opens the phone keyboard), like Messenger.
  const replyKey = replyingTo?.key;
  useEffect(() => {
    if (replyKey) input.current?.focus();
  }, [replyKey]);

  // Grow the text box with its content.
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_INPUT_PX)}px`;
  }, [text]);

  function pick(raw: File | null | undefined) {
    setWebcam(false);
    if (!raw) return;
    const next = fileWithType(raw);
    const problem = mediaRuleError(next);
    setError(problem);
    if (!problem) setFile(next);
  }

  function fromInput(e: React.ChangeEvent<HTMLInputElement>) {
    pick(e.target.files?.[0]);
    e.target.value = ""; // so picking the same file again still fires `change`
  }

  const canSend = !busy && (!!text.trim() || !!file);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    if (!canSend) return;
    setBusy(true);
    setProgress(0);
    setError(null);
    const problem = await onSend(text.trim(), file, setProgress).catch(() => "No connection. Check your internet and try again.");
    setBusy(false);
    if (problem) {
      setError(problem);
      return;
    }
    setText("");
    setFile(null);
  }

  return (
    <form
      onSubmit={send}
      className="shrink-0 border-t border-line bg-card px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] group-data-[keyboard]/chat:pb-2 sm:px-3"
    >
      {note && <div className="mb-2 px-1 text-xs text-ink-3">{note}</div>}
      {replyingTo && (
        <div className="mb-2 flex items-center gap-2 rounded-xl border-l-4 border-emerald-400 bg-card-2 py-1.5 pl-3 pr-1">
          <ReplyIcon className="h-4 w-4 shrink-0 text-emerald-300" />
          <div className="min-w-0 flex-1 text-xs">
            <p className="font-semibold text-ink-2">{replyingTo.label}</p>
            <p className="truncate text-ink-3">{replyingTo.preview}</p>
          </div>
          <button type="button" onClick={onCancelReply} disabled={busy} aria-label="Cancel reply" className={iconBtn}>
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
      )}
      {webcam && (
        <div className="mb-2">
          <WebcamCapture onCapture={pick} onCancel={() => setWebcam(false)} />
        </div>
      )}
      {file && (
        <div className="mb-2 flex items-center gap-3 rounded-xl border border-line-strong bg-card-2 p-2">
          <Thumb file={file} />
          <div className="min-w-0 flex-1 text-xs">
            <p className="truncate font-semibold text-ink-2">{file.type.startsWith("video/") ? "Video" : "Photo"}</p>
            <p className="text-ink-3">{busy ? `Sending… ${progress}%` : formatSize(file.size)}</p>
            {busy && (
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-card-3" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Upload progress">
                <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-lime-400 transition-[width]" style={{ width: `${progress}%` }} />
              </div>
            )}
          </div>
          <button type="button" onClick={() => setFile(null)} disabled={busy} aria-label="Remove attachment" className={iconBtn}>
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
      )}

      {/* Hidden inputs, opened by the buttons. `capture` goes straight to the phone's camera. */}
      <input ref={cameraInput} type="file" accept="image/*,video/*" capture="environment" onChange={fromInput} className="sr-only" tabIndex={-1} aria-hidden />
      <input ref={fileInput} type="file" accept={MEDIA_ACCEPT} onChange={fromInput} className="sr-only" tabIndex={-1} aria-hidden />

      <div className="flex items-end gap-1">
        <button type="button" onClick={() => cameraInput.current?.click()} disabled={busy} aria-label="Take a photo or video" className={`${iconBtn} hidden pointer-coarse:grid`}>
          <CameraIcon className="h-6 w-6" />
        </button>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setWebcam((v) => !v);
          }}
          disabled={busy}
          aria-label="Take a photo with your webcam"
          aria-pressed={webcam}
          className={`${iconBtn} pointer-coarse:hidden`}
        >
          <CameraIcon className="h-6 w-6" />
        </button>
        <button type="button" onClick={() => fileInput.current?.click()} disabled={busy} aria-label="Send a photo or video" className={iconBtn}>
          <ImageIcon className="h-6 w-6" />
        </button>
        <label htmlFor={inputId} className="sr-only">
          Message
        </label>
        <textarea
          ref={input}
          id={inputId}
          data-chat-input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && replyingTo) {
              e.preventDefault();
              onCancelReply?.();
              return;
            }
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia("(pointer: fine)").matches) {
              e.preventDefault();
              send();
            }
          }}
          rows={1}
          maxLength={maxLength}
          placeholder={placeholder}
          enterKeyHint="enter"
          // 16px text: iOS zooms the page into smaller text boxes when they're tapped.
          className="min-h-11 flex-1 resize-none rounded-[22px] border border-line-strong bg-card-2 px-4 py-2.5 text-base leading-snug text-ink outline-none focus:border-emerald-400/60"
        />
        <button
          type="submit"
          disabled={!canSend}
          aria-label="Send"
          // Keep focus (and the phone keyboard) in the text box when tapping Send.
          onPointerDown={(e) => e.preventDefault()}
          onMouseDown={(e) => e.preventDefault()}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-emerald-400 text-emerald-950 transition hover:bg-emerald-300 disabled:bg-card-3 disabled:text-ink-4"
        >
          <SendIcon className="h-5 w-5" />
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-1.5 px-1 text-xs text-rose-300">
          {error}
        </p>
      )}
    </form>
  );
}
