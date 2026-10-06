"use client";

import { useEffect, useId, useRef, useState } from "react";
import { formatSize, mediaRuleError } from "@/lib/media-rules";
import { prepareMedia } from "@/lib/media-prepare";
import WebcamCapture from "@/components/quests/WebcamCapture";
import { CameraIcon, ChatCameraIcon, CloseIcon, GalleryIcon, PlusIcon, ReplyIcon, SendIcon, VideoIcon } from "@/components/ui/icons";

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

const menuItem =
  "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold text-ink hover:bg-card-3 active:bg-card-3";

/** Camera / gallery / "+" buttons: a soft tinted circle that dips when pressed. */
const toolBtn =
  "eq-tool-in grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-400/10 text-emerald-300 ring-1 ring-emerald-400/15 transition-[background-color,transform,box-shadow] duration-150 hover:bg-emerald-400/20 hover:ring-emerald-400/30 motion-safe:active:scale-90 disabled:opacity-40 aria-pressed:bg-emerald-400 aria-pressed:text-emerald-950";

/**
 * Message box: camera (phones: take a photo or record a video; computers: webcam photo), photo &
 * video picker, a text box that grows as you type, and Send. Once you type, camera and gallery fold
 * into one "+" (like Messenger) so the text box gets the room; "+" brings them back. On a computer, Enter sends and
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
  /** "+" was tapped: show camera and gallery again until the next keystroke. */
  const [toolsOpen, setToolsOpen] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  // Unique per box: two pop-up chat windows can be open at once.
  const inputId = useId();
  const photoCamera = useRef<HTMLInputElement>(null);
  const videoCamera = useRef<HTMLInputElement>(null);
  /** Phones: the camera button's "Take Photo / Record Video" menu. */
  const [cameraMenu, setCameraMenu] = useState(false);
  const cameraMenuRef = useRef<HTMLDivElement>(null);
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

  // Close the camera menu on a tap outside it or Escape.
  useEffect(() => {
    if (!cameraMenu) return;
    const onDown = (e: PointerEvent) => {
      if (!cameraMenuRef.current?.contains(e.target as Node)) setCameraMenu(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setCameraMenu(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [cameraMenu]);

  async function pick(raw: File | null | undefined) {
    setWebcam(false);
    setCameraMenu(false);
    if (!raw) return;
    // Phone cameras may mislabel files or save HEIC: fix the type (and convert) before checking.
    const next = await prepareMedia(raw);
    const problem = mediaRuleError(next);
    setError(problem);
    if (!problem) setFile(next);
  }

  function fromInput(e: React.ChangeEvent<HTMLInputElement>) {
    pick(e.target.files?.[0]);
    e.target.value = ""; // so picking the same file again still fires `change`
  }

  const canSend = !busy && (!!text.trim() || !!file);
  const folded = !!text.trim() && !toolsOpen && !webcam;

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
      {/* One kind per camera input: many Android browsers won't open the camera for "image/*,video/*".
          The gallery takes any photo or video; prepareMedia fixes types the phone got wrong. */}
      <input ref={photoCamera} type="file" accept="image/*" capture="environment" onChange={fromInput} className="sr-only" tabIndex={-1} aria-hidden />
      <input ref={videoCamera} type="file" accept="video/*" capture="environment" onChange={fromInput} className="sr-only" tabIndex={-1} aria-hidden />
      <input ref={fileInput} type="file" accept="image/*,video/*" onChange={fromInput} className="sr-only" tabIndex={-1} aria-hidden />

      <div className="flex items-end gap-1.5">
        <div className="flex shrink-0 items-center gap-1.5 pb-0.5">
          {folded ? (
            <button
              type="button"
              onClick={() => setToolsOpen(true)}
              disabled={busy}
              aria-label="Show camera and photos"
              title="Camera and Photos"
              className={toolBtn}
            >
              <PlusIcon className="h-5 w-5" />
            </button>
          ) : (
            <>
              <div ref={cameraMenuRef} className="relative hidden pointer-coarse:block">
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setCameraMenu((v) => !v);
                  }}
                  disabled={busy}
                  aria-label="Camera"
                  aria-haspopup="menu"
                  aria-expanded={cameraMenu}
                  className={toolBtn}
                >
                  <ChatCameraIcon className="h-[22px] w-[22px]" />
                </button>
                {cameraMenu && (
                  <div
                    role="menu"
                    aria-label="Camera"
                    className="eq-tool-in absolute bottom-full left-0 z-20 mb-2 w-48 origin-bottom-left overflow-hidden rounded-2xl border border-line-strong bg-card-2 p-1 shadow-2xl"
                  >
                    <button type="button" role="menuitem" onClick={() => photoCamera.current?.click()} className={menuItem}>
                      <CameraIcon className="h-5 w-5 text-emerald-300" /> Take Photo
                    </button>
                    <button type="button" role="menuitem" onClick={() => videoCamera.current?.click()} className={menuItem}>
                      <VideoIcon className="h-5 w-5 text-emerald-300" /> Record Video
                    </button>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setWebcam((v) => !v);
                }}
                disabled={busy}
                aria-label="Take a photo with your webcam"
                title="Camera"
                aria-pressed={webcam}
                className={`${toolBtn} pointer-coarse:hidden`}
              >
                <ChatCameraIcon className="h-[22px] w-[22px]" />
              </button>
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                disabled={busy}
                aria-label="Send a photo or video"
                title="Photos and Videos"
                className={toolBtn}
              >
                <GalleryIcon className="h-[22px] w-[22px]" />
              </button>
            </>
          )}
        </div>
        <label htmlFor={inputId} className="sr-only">
          Message
        </label>
        <textarea
          ref={input}
          id={inputId}
          data-chat-input
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setToolsOpen(false);
          }}
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
          className="group/send grid h-11 w-11 shrink-0 place-items-center rounded-full bg-emerald-400 text-emerald-950 shadow-[0_0_0_1px_rgb(110_231_183/0.35),0_8px_22px_-8px_rgb(52_211_153/0.7)] transition-[background-color,box-shadow,transform] duration-200 hover:bg-emerald-300 motion-safe:active:scale-90 disabled:bg-card-3 disabled:text-ink-4 disabled:shadow-none"
        >
          <SendIcon className="h-5 w-5 transition-transform duration-200 ease-[var(--ease-spring)] group-enabled/send:motion-safe:translate-x-px group-enabled/send:motion-safe:-rotate-12 group-enabled/send:motion-safe:scale-110" />
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
