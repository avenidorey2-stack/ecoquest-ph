"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ASSISTANT_COMMANDS, MAX_QUESTION_LENGTH, suggestCommands, type AssistantCommand } from "@/lib/assistant/command-list";
import type { AssistantLink } from "@/lib/assistant/commands";
import { AssistantIcon, CloseIcon, ComposeIcon, SendIcon } from "@/components/ui/icons";

type Msg = { id: number; role: "user" | "assistant"; text: string; links?: AssistantLink[]; error?: boolean };

const STORAGE_KEY = "eq-assistant-chat";
/** Turns sent along for context (the server keeps the same number). */
const HISTORY_TURNS = 12;
const PHONE = "(max-width: 639px)";
const QUICK = ["slots", "prices", "rewards", "points", "missions", "guide"];
const QUICK_COMMANDS = ASSISTANT_COMMANDS.filter((c) => QUICK.includes(c.name));

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

function Bubble({ msg, onLink, onRetry }: { msg: Msg; onLink: () => void; onRetry?: () => void }) {
  if (msg.role === "user") {
    return (
      <li className="flex justify-end">
        <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-emerald-400 px-3.5 py-2 text-sm text-emerald-950">{msg.text}</p>
      </li>
    );
  }
  return (
    <li className="flex items-end gap-2">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-400/25" aria-hidden>
        <AssistantIcon className="h-4 w-4" />
      </span>
      <div className="min-w-0 max-w-[85%]">
        <p
          className={`whitespace-pre-wrap break-words rounded-2xl rounded-bl-md px-3.5 py-2 text-sm ${
            msg.error ? "bg-rose-500/15 text-rose-200 ring-1 ring-rose-500/30" : "bg-card-2 text-ink-2 ring-1 ring-line"
          }`}
        >
          {/* Answers are plain text; drop any stray Markdown emphasis. */}
          {msg.text.replace(/\*\*/g, "")}
        </p>
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
  const panelRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
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

  async function send(raw: string, base = messages) {
    const text = raw.trim();
    if (!text || sending) return;
    changeInput("");
    if (text.toLowerCase() === "/clear") {
      setMessages([]);
      return;
    }
    const history = [...base.filter((m) => !m.error), { id: nextId++, role: "user" as const, text }];
    setMessages(history);
    setSending(true);
    let reply: Msg;
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history.slice(-HISTORY_TURNS).map(({ role, text }) => ({ role, text })) }),
      });
      const data = await res.json().catch(() => ({}));
      reply = res.ok && data.reply?.text
        ? { id: nextId++, role: "assistant", text: data.reply.text, links: data.reply.links }
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
    if (lastUser !== -1) send(messages[lastUser].text, messages.slice(0, lastUser));
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
          <p className="truncate text-xs text-ink-3">Ask about slots, trees, prices and rewards</p>
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
              Hi! I&apos;m EcoBot. Ask me anything about EcoQuest PH, or type <span className="font-semibold text-emerald-300">/</span> to
              see commands.
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
          <Bubble key={m.id} msg={m} onLink={onLink} onRetry={m.error && i === messages.length - 1 ? retry : undefined} />
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
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-center gap-2"
        >
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => changeInput(e.target.value)}
            onKeyDown={onKeyDown}
            maxLength={MAX_QUESTION_LENGTH}
            enterKeyHint="send"
            autoComplete="off"
            placeholder="Ask EcoBot or type /"
            aria-label="Message EcoBot"
            role="combobox"
            aria-expanded={suggestions.length > 0}
            aria-controls="assistant-commands"
            aria-activedescendant={suggestions.length ? `assistant-command-${suggestions[shownActive].name}` : undefined}
            className="min-h-11 min-w-0 flex-1 rounded-full border border-line-strong bg-card-2 px-4 text-base text-ink placeholder:text-ink-4 focus:border-emerald-400/60 focus:outline-none sm:text-sm"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            aria-label="Send"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-emerald-400 text-emerald-950 transition hover:bg-emerald-300 disabled:opacity-50"
          >
            <SendIcon />
          </button>
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
