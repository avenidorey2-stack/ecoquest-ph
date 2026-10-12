"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ASSISTANT_COMMANDS, MAX_QUESTION_LENGTH, suggestCommands, type AssistantCommand } from "@/lib/assistant/command-list";
import type { AssistantLink } from "@/lib/assistant/commands";
import type { AssistantAction } from "@/lib/assistant/actions";
import { mediaRuleError } from "@/lib/media-rules";
import { prepareMedia } from "@/lib/media-prepare";
import ActionCard, { type ActionResult } from "@/components/assistant/ActionCard";
import { clock, useVoiceRecorder } from "@/components/ui/useVoiceRecorder";
import { AssistantIcon, CloseIcon, ComposeIcon, GalleryIcon, MicIcon, SendIcon, TrashIcon } from "@/components/ui/icons";

type AttachmentKind = "photo" | "video";
type Msg = {
  id: number;
  role: "user" | "assistant";
  text: string;
  links?: AssistantLink[];
  /** Cards to confirm (src/lib/assistant/actions.ts), and what came of each, by index. */
  actions?: AssistantAction[];
  results?: Record<number, ActionResult>;
  /** A photo or video the planter attached; the file itself lives in memory only. */
  attachment?: { name: string; kind: AttachmentKind };
  /** Asked by voice: `text` is what EcoBot heard. */
  voice?: boolean;
  error?: boolean;
};

const STORAGE_KEY = "eq-assistant-chat";
/** Turns sent along for context (the server keeps the same number). */
const HISTORY_TURNS = 12;
const PHONE = "(max-width: 639px)";
const QUICK = ["slots", "prices", "rewards", "points", "missions", "guide"];
const QUICK_COMMANDS = ASSISTANT_COMMANDS.filter((c) => QUICK.includes(c.name));
/** Longest voice question (its text must fit MAX_QUESTION_LENGTH). */
const VOICE_MAX_SECONDS = 30;

let nextId = Date.now();

function loadSaved(): Msg[] {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(saved) ? saved.filter((m) => !m.error) : [];
  } catch {
    return [];
  }
}

/**
 * Phones: the panel covers the screen and follows the visible part of it (visualViewport), so
 * the keyboard pushes the message box up instead of hiding it — like ChatFrame. The page behind
 * stops scrolling while it's open.
 */
function useFitPhoneViewport(ref: React.RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    const el = ref.current;
    if (!active || !el) return;
    const phone = window.matchMedia(PHONE);
    const vv = window.visualViewport;
    let frame = 0;
    const fit = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        el.style.height = phone.matches ? `${vv?.height ?? window.innerHeight}px` : "";
        el.style.transform = phone.matches && vv?.offsetTop ? `translateY(${vv.offsetTop}px)` : "";
        document.documentElement.classList.toggle("eq-chat-open", phone.matches);
      });
    };
    fit();
    vv?.addEventListener("resize", fit);
    vv?.addEventListener("scroll", fit);
    phone.addEventListener("change", fit);
    return () => {
      cancelAnimationFrame(frame);
      vv?.removeEventListener("resize", fit);
      vv?.removeEventListener("scroll", fit);
      phone.removeEventListener("change", fit);
      document.documentElement.classList.remove("eq-chat-open");
    };
  }, [ref, active]);
}

const kindOf = (file: File): AttachmentKind => (file.type.startsWith("video/") ? "video" : "photo");

function Bubble({
  msg,
  file,
  onLink,
  onRetry,
  onResult,
}: {
  msg: Msg;
  /** The file attached to the question this replies to, for its proof card. */
  file?: File | null;
  onLink: () => void;
  onRetry?: () => void;
  onResult: (index: number, result: ActionResult) => void;
}) {
  if (msg.role === "user") {
    return (
      <li className="flex flex-col items-end gap-1">
        {msg.attachment && (
          <span className="inline-flex max-w-[85%] items-center gap-1.5 rounded-xl bg-emerald-400/15 px-3 py-1.5 text-xs font-semibold text-emerald-200 ring-1 ring-emerald-400/30">
            <GalleryIcon className="h-4 w-4 shrink-0" />
            <span className="truncate">{msg.attachment.name}</span>
          </span>
        )}
        <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-emerald-400 px-3.5 py-2 text-sm text-emerald-950">
          {msg.voice && <MicIcon className="mr-1 inline h-4 w-4 align-text-bottom" aria-label="Said by voice:" />}
          {msg.text}
        </p>
      </li>
    );
  }
  return (
    <li className="flex items-end gap-2">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-400/25" aria-hidden>
        <AssistantIcon className="h-4 w-4" />
      </span>
      <div className={`min-w-0 ${msg.actions?.length ? "flex-1" : "max-w-[85%]"}`}>
        <p
          className={`whitespace-pre-wrap break-words rounded-2xl rounded-bl-md px-3.5 py-2 text-sm ${
            msg.error ? "bg-rose-500/15 text-rose-200 ring-1 ring-rose-500/30" : "bg-card-2 text-ink-2 ring-1 ring-line"
          }`}
        >
          {/* Answers are plain text; drop any stray Markdown emphasis. */}
          {msg.text.replace(/\*\*/g, "")}
        </p>
        {msg.actions?.map((action, i) => (
          <div key={i} className="mt-2">
            <ActionCard action={action} result={msg.results?.[i]} file={file} onResult={(r) => onResult(i, r)} />
          </div>
        ))}
        {(msg.links?.length || onRetry) && (
          <div className="mt-1.5 flex flex-wrap gap-2">
            {msg.links?.map((l) => (
              <Link
                key={l.href + l.label}
                href={l.href}
                onClick={onLink}
                className="inline-flex min-h-10 items-center rounded-full px-3.5 text-xs font-semibold text-emerald-300 ring-1 ring-emerald-400/40 hover:bg-emerald-400/10"
              >
                {l.label}
              </Link>
            ))}
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex min-h-10 items-center rounded-full px-3.5 text-xs font-semibold text-rose-200 ring-1 ring-rose-500/40 hover:bg-rose-500/10"
              >
                Try Again
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

/**
 * Header button that opens EcoBot: answers questions about EcoQuest PH (AI), and "/" commands
 * like /slots and /prices straight from live data. Typing "/" suggests commands. The chat is
 * kept for this browser tab (sessionStorage) so it survives page changes and reloads.
 */
export default function AssistantButton() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [attached, setAttached] = useState<File | null>(null);
  const [attachError, setAttachError] = useState<string | null>(null);
  /** Attached files by the id of the message they were sent with (not saved: files can't be). */
  const [files, setFiles] = useState<Record<number, File>>({});
  const panelRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const loaded = useRef(false);

  useFitPhoneViewport(panelRef, open);

  // Restore this tab's chat the first time it opens; save it after every change.
  useEffect(() => {
    if (!open || loaded.current) return;
    loaded.current = true;
    setMessages(loadSaved());
  }, [open]);
  useEffect(() => {
    if (!loaded.current) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.filter((m) => !m.error)));
    } catch {
      // Storage blocked (private mode): the chat just won't survive a reload.
    }
  }, [messages]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Keep the newest message in view.
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages, sending, open]);

  const suggestions = dismissed ? [] : suggestCommands(input);
  const shownActive = Math.min(active, Math.max(0, suggestions.length - 1));

  function changeInput(value: string) {
    setInput(value);
    setActive(0);
    setDismissed(false);
  }

  /** Checks a picked photo or video the same way the proof form does, then holds it for the next message. */
  async function attach(raw: File | undefined) {
    if (!raw) return;
    const file = await prepareMedia(raw);
    const problem = mediaRuleError(file);
    setAttachError(problem);
    setAttached(problem ? null : file);
    inputRef.current?.focus({ preventScroll: true });
  }

  const [transcribing, setTranscribing] = useState(false);
  const voice = useVoiceRecorder({ maxSeconds: VOICE_MAX_SECONDS, onDone: (recording) => askByVoice(recording) });
  const listening = voice.state !== "idle" || transcribing;

  /** Turns a voice question into text (Whisper on the server) and asks it, with any attached file. */
  async function askByVoice(recording: File) {
    setTranscribing(true);
    const form = new FormData();
    form.set("file", recording);
    const res = await fetch("/api/assistant/transcribe", { method: "POST", body: form }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setTranscribing(false);
    if (!res?.ok || typeof data.text !== "string") {
      voice.setError(res ? (data.error ?? "Couldn't understand that. Please try again.") : "Couldn't reach EcoBot. Check your connection and try again.");
      return;
    }
    send(data.text, messages, attached, true);
  }

  /** Sends a message; an attached file goes along as a note, and on its own asks for the proof form. */
  async function send(raw: string, base = messages, file: File | null = attached, byVoice = false) {
    const text = raw.trim() || (file ? "/upload" : "");
    if (!text || sending) return;
    changeInput("");
    setAttached(null);
    setAttachError(null);
    if (text.toLowerCase() === "/clear") {
      setFiles({});
      setMessages([]);
      return;
    }
    const question: Msg = {
      id: nextId++,
      role: "user",
      text,
      ...(file ? { attachment: { name: file.name, kind: kindOf(file) } } : {}),
      ...(byVoice ? { voice: true } : {}),
    };
    if (file) setFiles((all) => ({ ...all, [question.id]: file }));
    const history = [...base.filter((m) => !m.error), question];
    setMessages(history);
    setSending(true);
    let reply: Msg;
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.slice(-HISTORY_TURNS).map(({ role, text }) => ({ role, text })),
          ...(file ? { attachment: kindOf(file) } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      reply = res.ok && data.reply?.text
        ? { id: nextId++, role: "assistant", text: data.reply.text, links: data.reply.links, actions: data.reply.actions }
        : { id: nextId++, role: "assistant", text: data.error ?? "Something went wrong. Please try again.", error: true };
    } catch {
      reply = { id: nextId++, role: "assistant", text: "Couldn't reach EcoBot. Check your connection and try again.", error: true };
    }
    setMessages([...history, reply]);
    setSending(false);
  }

  /** Re-sends the last question after an error. */
  function retry() {
    const lastUser = messages.findLastIndex((m) => m.role === "user");
    if (lastUser !== -1) send(messages[lastUser].text, messages.slice(0, lastUser), files[messages[lastUser].id] ?? null);
  }

  /** Records what came of a card, so it shows as done (also after a reload). */
  function settle(msgId: number, index: number, result: ActionResult) {
    setMessages((all) => all.map((m) => (m.id === msgId ? { ...m, results: { ...m.results, [index]: result } } : m)));
  }

  /** Commands that take a word (/prices, /trees) are filled in so the planter can add it; others run. */
  function pick(c: AssistantCommand) {
    if (c.args && input.trim().toLowerCase() !== `/${c.name}`) {
      changeInput(`/${c.name} `);
      setDismissed(true);
      inputRef.current?.focus();
    } else {
      send(`/${c.name}`);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (suggestions.length) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const step = e.key === "ArrowDown" ? 1 : -1;
        setActive((shownActive + step + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        pick(suggestions[shownActive]);
        return;
      }
      if (e.key === "Escape") {
        e.stopPropagation();
        e.nativeEvent.stopImmediatePropagation();
        setDismissed(true);
        return;
      }
    }
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send(input);
    }
  }

  /** Following a link on a phone leaves the full-screen chat; on bigger screens it stays open. */
  function onLink() {
    if (window.matchMedia(PHONE).matches) setOpen(false);
  }

  const panel = (
    <section
      ref={panelRef}
      role="dialog"
      aria-label="EcoBot"
      className="eq-fade fixed inset-x-0 top-0 z-[1500] flex h-dvh flex-col overflow-hidden bg-card sm:inset-x-auto sm:right-4 sm:top-[4.5rem] sm:h-[min(600px,calc(100dvh-6rem))] sm:w-[400px] sm:rounded-2xl sm:border sm:border-line-strong sm:shadow-[0_16px_40px_-12px_rgba(0,0,0,.7)]"
    >
      <header className="flex items-center gap-3 border-b border-line px-3 py-2.5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-400/25" aria-hidden>
          <AssistantIcon />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-ink">EcoBot</h2>
          <p className="truncate text-xs text-ink-3">Ask questions or get things done</p>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => send("/clear")}
            disabled={sending}
            aria-label="New Chat"
            title="New Chat"
            className="grid h-11 w-11 place-items-center rounded-xl text-ink-3 hover:bg-card-2 hover:text-ink disabled:opacity-50"
          >
            <ComposeIcon />
          </button>
        )}
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close EcoBot"
          className="grid h-11 w-11 place-items-center rounded-xl text-ink-3 hover:bg-card-2 hover:text-ink"
        >
          <CloseIcon />
        </button>
      </header>

      <ul ref={listRef} aria-live="polite" className="flex flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-3 py-4">
        {messages.length === 0 && (
          <li className="px-1">
            <p className="text-sm text-ink-2">
              Hi! I&apos;m EcoBot. Ask me anything about EcoQuest PH — type, or tap{" "}
              <MicIcon className="inline h-4 w-4 align-text-bottom text-emerald-300" aria-label="the mic" /> to ask by voice. Type{" "}
              <span className="font-semibold text-emerald-300">/</span> to see commands.
            </p>
            <p className="mt-2 text-sm text-ink-2">
              I can also help you do things — send proof (tap <GalleryIcon className="inline h-4 w-4 align-text-bottom text-emerald-300" aria-label="attach" />{" "}
              to add a photo or video), message friends, claim slots and rewards, order seedlings, update your profile — even
              many at once, like &ldquo;claim all slots&rdquo;. Nothing happens until you allow it.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {QUICK_COMMANDS.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  onClick={() => send(`/${c.name}`)}
                  title={c.description}
                  className="min-h-10 rounded-full bg-card-2 px-3.5 text-xs font-semibold text-emerald-300 ring-1 ring-line-strong hover:bg-card-3"
                >
                  /{c.name}
                </button>
              ))}
            </div>
          </li>
        )}
        {messages.map((m, i) => (
          <Bubble
            key={m.id}
            msg={m}
            file={m.actions && i > 0 ? files[messages[i - 1].id] : null}
            onLink={onLink}
            onRetry={m.error && i === messages.length - 1 ? retry : undefined}
            onResult={(index, result) => settle(m.id, index, result)}
          />
        ))}
        {sending && (
          <li className="flex items-center gap-2" aria-label="EcoBot is typing">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-400/25" aria-hidden>
              <AssistantIcon className="h-4 w-4" />
            </span>
            <span className="flex gap-1 rounded-2xl bg-card-2 px-3.5 py-3 ring-1 ring-line" aria-hidden>
              {[0, 150, 300].map((delay) => (
                <span key={delay} className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-300 motion-reduce:animate-none" style={{ animationDelay: `${delay}ms` }} />
              ))}
            </span>
          </li>
        )}
      </ul>

      <div className="relative border-t border-line p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {suggestions.length > 0 && (
          <ul id="assistant-commands" role="listbox" aria-label="Commands" className="absolute inset-x-3 bottom-full mb-2 max-h-64 overflow-y-auto rounded-xl border border-line-strong bg-card-2 py-1 shadow-xl">
            {suggestions.map((c, i) => (
              <li key={c.name} id={`assistant-command-${c.name}`} role="option" aria-selected={i === shownActive}>
                <button
                  type="button"
                  // Keep focus in the text box so the keyboard stays up on phones.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(c)}
                  onMouseEnter={() => setActive(i)}
                  className={`flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm ${i === shownActive ? "bg-card-3" : ""}`}
                >
                  <span className="font-semibold text-emerald-300">/{c.name}</span>
                  {c.args && <span className="text-ink-3">{c.args}</span>}
                  <span className="ml-auto truncate pl-2 text-xs text-ink-3">{c.description}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {(attached || attachError) && (
          <div className="mb-2 flex items-center gap-2">
            {attached ? (
              <>
                <span className="inline-flex min-w-0 items-center gap-1.5 rounded-xl bg-card-2 px-3 py-1.5 text-xs font-semibold text-ink-2 ring-1 ring-line-strong">
                  <GalleryIcon className="h-4 w-4 shrink-0 text-emerald-300" />
                  <span className="truncate">{attached.name}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setAttached(null)}
                  aria-label="Remove attachment"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-ink-3 hover:bg-card-2 hover:text-ink"
                >
                  <CloseIcon className="h-4 w-4" />
                </button>
              </>
            ) : (
              <p role="alert" className="text-xs text-rose-300">
                {attachError}
              </p>
            )}
          </div>
        )}
        {listening && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={voice.cancel}
              disabled={transcribing}
              aria-label="Delete recording"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink-3 hover:bg-card-2 hover:text-ink disabled:opacity-50"
            >
              <TrashIcon />
            </button>
            <div className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-full border border-rose-500/40 bg-rose-500/10 px-4 text-sm text-ink" aria-live="polite">
              {transcribing ? (
                <span className="truncate text-ink-2">Turning your voice into text…</span>
              ) : (
                <>
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-rose-400 motion-safe:animate-pulse" aria-hidden />
                  <span className="truncate">
                    {voice.state === "starting" ? "Starting microphone…" : "Listening"}{" "}
                    <span className="tabular-nums">{clock(voice.seconds)}</span>
                    <span className="text-ink-3"> / {clock(VOICE_MAX_SECONDS)}</span>
                  </span>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={voice.stop}
              disabled={voice.state !== "recording"}
              aria-label="Send voice question"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-emerald-400 text-emerald-950 transition hover:bg-emerald-300 disabled:opacity-50"
            >
              <SendIcon />
            </button>
          </div>
        )}
        {voice.error && !listening && (
          <p role="alert" className="mb-2 text-xs text-rose-300">
            {voice.error}
          </p>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className={`flex items-center gap-2 ${listening ? "hidden" : ""}`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            onChange={(e) => {
              attach(e.target.files?.[0]);
              e.target.value = ""; // so picking the same file again still fires `change`
            }}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={sending}
            aria-label="Attach a photo or video"
            title="Attach a photo or video"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink-3 hover:bg-card-2 hover:text-emerald-300 disabled:opacity-50"
          >
            <GalleryIcon />
          </button>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => changeInput(e.target.value)}
            onKeyDown={onKeyDown}
            maxLength={MAX_QUESTION_LENGTH}
            enterKeyHint="send"
            autoComplete="off"
            placeholder={attached ? "Add a note, or just send" : "Ask EcoBot or type /"}
            aria-label="Message EcoBot"
            role="combobox"
            aria-expanded={suggestions.length > 0}
            aria-controls="assistant-commands"
            aria-activedescendant={suggestions.length ? `assistant-command-${suggestions[shownActive].name}` : undefined}
            className="min-h-11 min-w-0 flex-1 rounded-full border border-line-strong bg-card-2 px-4 text-base text-ink placeholder:text-ink-4 focus:border-emerald-400/60 focus:outline-none sm:text-sm"
          />
          {input.trim() || attached ? (
            <button
              type="submit"
              disabled={sending}
              aria-label="Send"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-emerald-400 text-emerald-950 transition hover:bg-emerald-300 disabled:opacity-50"
            >
              <SendIcon />
            </button>
          ) : (
            // Nothing typed: the button asks by voice instead.
            <button
              type="button"
              onClick={() => voice.start()}
              disabled={sending}
              aria-label="Ask by voice"
              title="Ask by voice"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-emerald-400 text-emerald-950 transition hover:bg-emerald-300 disabled:opacity-50"
            >
              <MicIcon />
            </button>
          )}
        </form>
      </div>
    </section>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Open EcoBot assistant"
        aria-expanded={open}
        title="EcoBot"
        data-tour="assistant"
        className={`eq-hit relative grid h-10 w-10 place-items-center rounded-full transition-colors ${
          open ? "bg-emerald-400/15 text-emerald-300" : "text-ink-2 hover:bg-card-2 hover:text-emerald-300"
        }`}
      >
        <AssistantIcon />
      </button>
      {open && createPortal(panel, document.body)}
    </>
  );
}
