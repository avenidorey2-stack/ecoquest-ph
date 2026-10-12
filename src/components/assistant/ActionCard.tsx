"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import ProofUploadForm from "@/components/quests/ProofUploadForm";
import OrderSeedlingForm from "@/components/shop/OrderSeedlingForm";
import { MESSAGES_READ_EVENT } from "@/components/layout/live";
import { sendChatMessage } from "@/components/ui/upload";
import type { AssistantAction, BatchItem, PhotoRef } from "@/lib/assistant/actions";
import { voucherAmount } from "@/lib/voucher";
import { GalleryIcon } from "@/components/ui/icons";

// Cards EcoBot puts in the chat for things the planter asked to do. Nothing happens until the
// planter allows it here, and each card calls the same API route as the rest of the app (with all
// its checks). Several actions of one sort come as one "allow all" card with a checklist.

/** What became of a card: done (ok) or dismissed. Kept with the chat so a reload doesn't re-offer it. */
export type ActionResult = { ok: boolean; text: string };

const pts = (n: number) => `${n.toLocaleString("en-PH")} pts`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const cardClass = "rounded-2xl bg-card-2 p-3 ring-1 ring-line-strong";
const primaryBtn =
  "inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-emerald-400 px-4 text-sm font-semibold text-emerald-950 hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50";
const dangerBtn =
  "inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-rose-500/15 px-4 text-sm font-semibold text-rose-200 ring-1 ring-rose-500/40 hover:bg-rose-500/25 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryBtn = "inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold text-ink-2 ring-1 ring-line-strong hover:bg-card-3 disabled:opacity-50";
const fieldClass =
  "mt-1 block w-full rounded-xl border border-line-strong bg-card px-3 py-2 text-base text-ink placeholder:text-ink-4 focus:border-emerald-400/60 focus:outline-none sm:text-sm";
const PERMISSION = "EcoBot wants to do this for you";

/** An action that failed; `status` lets a batch wait out a rate limit (429) and try again. */
class ActionError extends Error {
  constructor(message: string, public status = 0) {
    super(message);
  }
}

/** Calls an app route; throws ActionError with the route's message when it fails. */
async function call(url: string, method: "POST" | "PATCH" | "DELETE" = "POST", body?: unknown) {
  const res = await fetch(url, {
    method,
    ...(body !== undefined ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  }).catch(() => null);
  if (!res) throw new ActionError("Couldn't reach the server. Check your connection and try again.");
  if (res.ok) return;
  const error = (await res.json().catch(() => ({}))).error;
  throw new ActionError(error ?? "That didn't work. Please try again.", res.status);
}

/** Text the planter can edit on the card before allowing it (message, comment, e-wallet number). */
type Inputs = { text?: string; number?: string; file?: File | null };

/** Does one confirmable action and returns what to tell the planter. */
async function perform(a: BatchItem | Exclude<AssistantAction, { kind: "batch" | "upload_proof" | "order_seedlings" }>, input: Inputs): Promise<string> {
  switch (a.kind) {
    case "claim_slot":
      await call(`/api/slots/${a.slotId}/claim`);
      return `Claimed ${a.plant}${a.barangay ? ` (${a.barangay})` : ""}. You have 7 days to plant and send proof — type /upload when you're ready.`;
    case "claim_mission":
      await call(`/api/missions/${a.missionId}/claim`);
      return `+${pts(a.points)} claimed for "${a.title}"!`;
    case "redeem_reward": {
      await call(`/api/rewards/${a.rewardId}/redeem`, "POST", a.isCash ? { eWalletNumber: input.number ?? "" } : {});
      const label = `${voucherAmount(a.valuePesos)} ${a.brand} ${a.isCash ? "cash" : "voucher"}`;
      return a.isCash ? `Redeemed ${label}. It goes to ${(input.number ?? "").trim()} once an admin approves it.` : `Redeemed ${label}. It will appear in Transactions once it's approved.`;
    }
    case "send_message": {
      const text = (input.text ?? a.text).trim();
      const base = `/api/messages/${encodeURIComponent(a.userId)}`;
      const data = await sendChatMessage({ sendUrl: base, uploadUrl: `${base}/upload` }, text, input.file ?? null, () => {});
      if (data.error) throw new ActionError(data.error, /fast|wait a moment/i.test(data.error) ? 429 : 0);
      window.dispatchEvent(new Event(MESSAGES_READ_EVENT)); // the chat list shows it as the latest
      return `Message sent to ${a.name}.`;
    }
    case "add_friend":
      await call(`/api/friends/${a.userId}`);
      return a.accept ? `You and ${a.name} are now friends!` : `Friend request sent to ${a.name}.`;
    case "remove_friend":
      await call(`/api/friends/${a.userId}`, "DELETE");
      return a.state === "FRIENDS" ? `Removed ${a.name} from your friends.` : a.state === "REQUESTED" ? `Cancelled your request to ${a.name}.` : `Declined ${a.name}'s request.`;
    case "block_user":
      await call(`/api/blocks/${a.userId}`, a.block ? "POST" : "DELETE");
      return a.block ? `Blocked ${a.name}.` : `Unblocked ${a.name}.`;
    case "report_user":
      await call(`/api/reports/${a.userId}`, "POST", { reason: input.number, details: (input.text ?? "").trim() });
      return `Thanks — your report about ${a.name} was sent to the EcoQuest team.`;
    case "like_photo":
      await call(`/api/photos/${a.photoId}/like`, a.liked ? "POST" : "DELETE");
      return a.liked ? `Liked ${a.ownerName}'s photo.` : `Unliked ${a.ownerName}'s photo.`;
    case "comment_photo":
      await call(`/api/photos/${a.photoId}/comments`, "POST", { body: (input.text ?? a.text).trim() });
      return `Commented on ${a.ownerName}'s photo.`;
    case "change_name":
      await call("/api/profile", "PATCH", { name: a.name });
      return `Your name is now ${a.name}.`;
    case "change_city":
      await call("/api/profile", "PATCH", { cityCode: a.cityCode });
      return `Your home city is now ${a.city}, ${a.province}.`;
    case "profile_photo": {
      if (a.remove) {
        await call("/api/profile/avatar", "DELETE");
        return "Your profile picture was removed.";
      }
      if (!input.file) throw new ActionError("Choose a photo first.");
      const form = new FormData();
      form.set("file", input.file);
      const res = await fetch("/api/profile/avatar", { method: "POST", body: form }).catch(() => null);
      if (!res) throw new ActionError("Couldn't reach the server. Check your connection and try again.");
      if (!res.ok) throw new ActionError((await res.json().catch(() => ({}))).error ?? "Upload failed. Please try again.", res.status);
      return "Your new profile picture is set!";
    }
    case "update_settings":
      await call("/api/settings", "PATCH", Object.fromEntries(a.changes.map((c) => [c.field, c.value])));
      return "Settings saved.";
    case "invite_code":
      await call("/api/referrals/claim", "POST", { code: a.code });
      return `Invite code added — ${a.referrerName} gets a bonus once your first planting is verified.`;
    case "report_problem":
      await call("/api/support", "POST", { subject: (input.number ?? a.subject).trim(), body: (input.text ?? a.message).trim() });
      return "Sent to the EcoQuest team. You'll see their reply in Settings → Help & Support.";
    case "read_notifications":
      await call("/api/notifications", "PATCH");
      return "All notifications marked as read.";
  }
}

/** One line naming a batch item. */
function rowLabel(a: BatchItem) {
  switch (a.kind) {
    case "claim_slot":
      return `${a.plant}${a.barangay ? ` · ${a.barangay}` : ""} — ${pts(a.pointsPerPlant)}/plant`;
    case "claim_mission":
      return `${a.title} — +${pts(a.points)}`;
    case "redeem_reward":
      return `${voucherAmount(a.valuePesos)} ${a.brand} ${a.isCash ? "cash" : "voucher"} — ${pts(a.costPoints)}`;
    case "add_friend":
      return `${a.name}${a.accept ? " (accept their request)" : ""}`;
    case "remove_friend":
      return `${a.name} (${a.state === "FRIENDS" ? "unfriend" : a.state === "REQUESTED" ? "cancel request" : "decline request"})`;
    case "send_message":
    case "block_user":
      return `${a.name}${a.city ? ` · ${a.city}` : ""}`;
    case "like_photo":
    case "comment_photo":
      return `${a.ownerName}'s latest photo`;
  }
}

/** What a batch does, as its title and button. */
function batchTitle(items: BatchItem[]) {
  const n = items.length;
  const first = items[0];
  switch (first.kind) {
    case "claim_slot":
      return { title: `Claim ${plural(n, "Slot")}`, button: "Claim" };
    case "claim_mission":
      return { title: `Claim ${plural(n, "Quest Reward")}`, button: "Claim" };
    case "redeem_reward":
      return { title: `Redeem ${plural(n, "Reward")}`, button: "Redeem" };
    case "send_message":
      return { title: `Message ${plural(n, "Friend")}`, button: "Send" };
    case "add_friend":
      return { title: `Friend Requests (${n})`, button: "Send" };
    case "remove_friend":
      return { title: `Remove ${n} from Friends & Requests`, button: "Remove", danger: true };
    case "block_user":
      return first.block ? { title: `Block ${plural(n, "Planter")}`, button: "Block", danger: true } : { title: `Unblock ${plural(n, "Planter")}`, button: "Unblock" };
    case "like_photo":
      return { title: `${first.liked ? "Like" : "Unlike"} ${plural(n, "Photo")}`, button: first.liked ? "Like" : "Unlike" };
    case "comment_photo":
      return { title: `Comment on ${plural(n, "Photo")}`, button: "Post" };
  }
}

function ErrorText({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="mt-2 text-sm text-rose-300">
      {error}
    </p>
  ) : null;
}

function Buttons({ label, busy, ready = true, danger, onCancel }: { label: string; busy: boolean; ready?: boolean; danger?: boolean; onCancel: () => void }) {
  return (
    <div className="mt-3 flex gap-2">
      <button type="submit" disabled={busy || !ready} className={danger ? dangerBtn : primaryBtn}>
        {busy ? "Working…" : label}
      </button>
      <button type="button" disabled={busy} onClick={onCancel} className={secondaryBtn}>
        Not Now
      </button>
    </div>
  );
}

/** A form card: shows what will happen, runs `run` on confirm. */
function Confirm({
  title,
  lines = [],
  label,
  danger,
  ready = true,
  run,
  onResult,
  children,
}: {
  title: string;
  lines?: string[];
  label: string;
  danger?: boolean;
  ready?: boolean;
  run: () => Promise<string>;
  onResult: (result: ActionResult) => void;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const text = await run();
      onResult({ ok: true, text });
      router.refresh(); // points in the header, the quest list, etc.
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className={cardClass}>
      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">{PERMISSION}</p>
      <p className="mt-1 text-sm font-bold text-ink">{title}</p>
      {lines.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-xs text-ink-2">
          {lines.map((l) => (
            <li key={l} className="break-words">
              {l}
            </li>
          ))}
        </ul>
      )}
      {children}
      <ErrorText error={error} />
      <Buttons label={label} busy={busy} ready={ready} danger={danger} onCancel={() => onResult({ ok: false, text: "Cancelled." })} />
    </form>
  );
}

/** Thumbnail of a planting photo or video. */
function PhotoThumb({ photo }: { photo: PhotoRef }) {
  return photo.isVideo ? (
    <video src={photo.mediaUrl} muted playsInline preload="metadata" className="mt-2 max-h-40 w-full rounded-xl bg-canvas object-contain" />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element -- stored proof media, not an optimisable asset
    <img src={photo.mediaUrl} alt={`${photo.ownerName}'s planting photo`} className="mt-2 max-h-40 w-full rounded-xl bg-canvas object-contain" />
  );
}

/** A local preview of a picked file (object URL made and freed in an effect). */
function FileThumb({ file }: { file: File }) {
  const ref = useRef<HTMLImageElement & HTMLVideoElement>(null);
  const isVideo = file.type.startsWith("video/");
  useEffect(() => {
    const url = URL.createObjectURL(file);
    if (ref.current) ref.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return isVideo ? (
    <video ref={ref} muted playsInline controls preload="metadata" className="mt-2 max-h-40 w-full rounded-xl bg-canvas object-contain" />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element -- local blob preview
    <img ref={ref} alt="Attached" className="mt-2 max-h-40 w-full rounded-xl bg-canvas object-contain" />
  );
}

function ProofCard({ action, file, onResult }: { action: Extract<AssistantAction, { kind: "upload_proof" }>; file: File | null; onResult: (r: ActionResult) => void }) {
  const [questId, setQuestId] = useState(action.quests.length === 1 ? action.quests[0].questId : null);
  const quest = action.quests.find((q) => q.questId === questId);
  return (
    <div className={cardClass}>
      <p className="text-sm font-bold text-ink">Upload Proof</p>
      {action.quests.length > 1 && (
        <fieldset className="mt-2 min-w-0">
          <legend className="mb-1 text-xs text-ink-3">Which quest is this proof for?</legend>
          <div className="space-y-1.5">
            {action.quests.map((q) => (
              <label
                key={q.questId}
                className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl px-3 text-sm ring-1 ${
                  q.questId === questId ? "bg-emerald-400/10 text-ink ring-emerald-400/40" : "text-ink-2 ring-line hover:bg-card-3"
                }`}
              >
                <input type="radio" name={`quest-${action.quests[0].questId}`} checked={q.questId === questId} onChange={() => setQuestId(q.questId)} className="accent-emerald-400" />
                <span className="min-w-0 flex-1 truncate">
                  {q.plant}
                  {q.place && <span className="text-ink-3"> · {q.place}</span>}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {quest ? (
        <div className="mt-3">
          {action.quests.length === 1 && (
            <p className="mb-2 text-xs text-ink-2">
              {quest.plant}
              {quest.place && ` · ${quest.place}`}
            </p>
          )}
          <ProofUploadForm
            key={quest.questId}
            questId={quest.questId}
            context={{ plantType: quest.plant, remaining: quest.remaining, pointsPerPlant: quest.pointsPerPlant }}
            initialFile={file}
            onSubmitted={() => onResult({ ok: true, text: "Proof sent! An admin will review it, and you'll get a notification." })}
          />
        </div>
      ) : (
        file && <p className="mt-2 text-xs text-ink-3">Your {file.type.startsWith("video/") ? "video" : "photo"} is ready — pick the quest above.</p>
      )}
    </div>
  );
}

function OrderCard({ action, onResult }: { action: Extract<AssistantAction, { kind: "order_seedlings" }>; onResult: (r: ActionResult) => void }) {
  return (
    <div className={cardClass}>
      <p className="text-sm font-bold text-ink">Order {action.product.name} Seedlings</p>
      <p className="mb-3 text-xs text-ink-3">You have {pts(action.balance)}. Check the details, then place the order.</p>
      <OrderSeedlingForm
        product={action.product}
        balance={action.balance}
        maxQuantity={action.maxQuantity}
        deliveryDefaults={action.deliveryDefaults}
        cooldownUntil={action.cooldownUntil}
        initialQuantity={action.quantity}
        initialCurrency={action.currency}
        onPlaced={(o) => onResult({ ok: true, text: `Ordered ${o.quantity} × ${o.name} for ${o.total}${o.cod ? " (cash on delivery)" : ""}. Track it in Transactions.` })}
      />
      <button type="button" onClick={() => onResult({ ok: false, text: "Cancelled." })} className={`${secondaryBtn} mt-2 w-full`}>
        Not Now
      </button>
    </div>
  );
}

const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"];
const AVATAR_MAX = 5 * 1024 * 1024;

function ProfilePhotoCard({ attached, onResult }: { attached: File | null; onResult: (r: ActionResult) => void }) {
  const ok = (f: File | null) => !!f && AVATAR_TYPES.includes(f.type) && f.size <= AVATAR_MAX;
  const [file, setFile] = useState<File | null>(ok(attached) ? attached : null);
  const [problem, setProblem] = useState<string | null>(attached && !ok(attached) ? "That file can't be a profile picture: choose a JPG, PNG or WebP image up to 5 MB." : null);
  const input = useRef<HTMLInputElement>(null);
  function choose(f: File | undefined) {
    if (!f) return;
    if (!ok(f)) {
      setProblem("Choose a JPG, PNG or WebP image up to 5 MB.");
      return;
    }
    setProblem(null);
    setFile(f);
  }
  return (
    <Confirm title="Set Your Profile Picture" label="Use This Photo" ready={!!file} run={() => perform({ kind: "profile_photo", remove: false, current: null }, { file })} onResult={onResult}>
      {file && <FileThumb file={file} />}
      <input ref={input} type="file" accept={AVATAR_TYPES.join(",")} className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => { choose(e.target.files?.[0]); e.target.value = ""; }} />
      <button type="button" onClick={() => input.current?.click()} className={`${secondaryBtn} mt-2 w-full gap-2`}>
        <GalleryIcon className="h-4 w-4" />
        {file ? "Choose Another" : "Choose a Photo"}
      </button>
      {problem && <p className="mt-2 text-xs text-rose-300">{problem}</p>}
    </Confirm>
  );
}

/** Several actions of one sort, allowed together. The planter can untick any first. */
function BatchCard({ items, file, onResult }: { items: BatchItem[]; file: File | null; onResult: (r: ActionResult) => void }) {
  const router = useRouter();
  const first = items[0];
  const shared = first.kind === "send_message" || first.kind === "comment_photo";
  const cash = items.some((i) => i.kind === "redeem_reward" && i.isCash);
  const [checked, setChecked] = useState(() => items.map(() => true));
  const [text, setText] = useState(shared ? first.text : "");
  const [number, setNumber] = useState(first.kind === "redeem_reward" ? (first.lastNumber ?? "") : "");
  const [status, setStatus] = useState<(null | { ok: boolean; text: string })[]>(() => items.map(() => null));
  const [busy, setBusy] = useState<string | null>(null);
  const { title, button, danger } = batchTitle(items);
  const chosen = items.filter((_, i) => checked[i]);
  const cost = items.reduce((sum, item, i) => sum + (checked[i] && item.kind === "redeem_reward" ? item.costPoints : 0), 0);
  // A comment needs words; a message needs words or the attached file.
  const needsText = first.kind === "comment_photo" || (first.kind === "send_message" && !file);
  const ready = chosen.length > 0 && (!needsText || !!text.trim()) && (!cash || !!number.trim());

  async function allow(e: React.FormEvent) {
    e.preventDefault();
    const results = [...status];
    for (let i = 0; i < items.length; i++) {
      if (!checked[i]) continue;
      setBusy(`Working… ${results.filter(Boolean).length + 1} of ${chosen.length}`);
      for (let attempt = 0; ; attempt++) {
        try {
          results[i] = { ok: true, text: await perform(items[i], { text, number, file: items[i].kind === "send_message" ? file : null }) };
          break;
        } catch (err) {
          // Over a route's rate limit: wait a little and try again, a few times.
          if (err instanceof ActionError && err.status === 429 && attempt < 4) {
            setBusy("Waiting a moment (sending limit)…");
            await new Promise((r) => setTimeout(r, 15_000));
            continue;
          }
          results[i] = { ok: false, text: (err as Error).message };
          break;
        }
      }
      setStatus([...results]);
    }
    setBusy(null);
    router.refresh();
    const done = results.filter((r) => r?.ok).length;
    const failed = items.map((item, i) => ({ item, r: results[i] })).filter(({ r }) => r && !r.ok);
    const lines = failed.map(({ item, r }) => `• ${rowLabel(item)}: ${r!.text}`);
    onResult({
      ok: done > 0,
      text: `Done: ${done} of ${chosen.length}.${failed.length ? `\nDidn't work:\n${lines.join("\n")}` : ""}`,
    });
  }

  return (
    <form onSubmit={allow} className={cardClass}>
      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">{PERMISSION}</p>
      <p className="mt-1 text-sm font-bold text-ink">{title}</p>
      {first.kind === "redeem_reward" && (
        <p className="mt-1 text-xs text-ink-2">
          Total: {pts(cost)} · Your balance after: {pts(first.balance - cost)}
        </p>
      )}
      <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto overscroll-contain">
        {items.map((item, i) => (
          <li key={i}>
            <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl px-2 text-sm text-ink-2 hover:bg-card-3">
              <input
                type="checkbox"
                checked={checked[i]}
                disabled={!!busy || !!status[i]}
                onChange={() => setChecked((c) => c.map((v, j) => (j === i ? !v : v)))}
                className="h-4 w-4 accent-emerald-400"
              />
              <span className="min-w-0 flex-1 truncate">{rowLabel(item)}</span>
              {status[i] && (
                <span className={`shrink-0 text-xs font-semibold ${status[i]!.ok ? "text-emerald-300" : "text-rose-300"}`} title={status[i]!.text}>
                  {status[i]!.ok ? "✓ Done" : "✗ Failed"}
                </span>
              )}
            </label>
          </li>
        ))}
      </ul>
      {shared && (
        <label className="mt-2 block text-xs font-medium text-ink-2">
          {first.kind === "send_message" ? "Message (each friend gets their own copy)" : "Comment"}
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={first.kind === "send_message" ? 2000 : 500} disabled={!!busy} className={fieldClass} />
        </label>
      )}
      {first.kind === "send_message" && file && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-2">
          <GalleryIcon className="h-4 w-4 text-emerald-300" /> Also sends your {file.type.startsWith("video/") ? "video" : "photo"}: {file.name}
        </p>
      )}
      {cash && (
        <label className="mt-2 block text-xs font-medium text-ink-2">
          E-wallet mobile number (for the cash rewards)
          <input value={number} onChange={(e) => setNumber(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="0917 123 4567" disabled={!!busy} className={fieldClass} />
          <span className="mt-1 block font-normal text-ink-3">Double-check it — cash sent to a wrong number can&apos;t be recovered.</span>
        </label>
      )}
      {busy && (
        <p className="mt-2 text-xs text-ink-3" role="status">
          {busy}
        </p>
      )}
      <Buttons label={`${button} ${chosen.length} — Allow`} busy={!!busy} ready={ready} danger={danger} onCancel={() => onResult({ ok: false, text: "Cancelled." })} />
    </form>
  );
}

/** One action card, or what came of it once it's been allowed or dismissed. */
export default function ActionCard({
  action,
  result,
  file = null,
  onResult,
}: {
  action: AssistantAction;
  result?: ActionResult;
  /** A photo or video the planter attached in the chat (proof, a message, or a profile picture). */
  file?: File | null;
  onResult: (result: ActionResult) => void;
}) {
  const [text, setText] = useState("text" in action ? action.text : "");
  const [extra, setExtra] = useState(
    action.kind === "redeem_reward" ? (action.lastNumber ?? "") : action.kind === "report_user" ? (action.reason ?? "") : action.kind === "report_problem" ? action.subject : "",
  );
  const [details, setDetails] = useState(action.kind === "report_user" ? action.details : action.kind === "report_problem" ? action.message : "");
  const [withFile, setWithFile] = useState(true);

  if (result) {
    return (
      <p
        role="status"
        className={`whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm ring-1 ${result.ok ? "bg-emerald-400/10 text-emerald-200 ring-emerald-400/30" : "bg-card-2 text-ink-3 ring-line"}`}
      >
        {result.ok && "✓ "}
        {result.text}
      </p>
    );
  }

  const confirm = (props: Omit<Parameters<typeof Confirm>[0], "onResult" | "run">, input: Inputs = {}) => (
    <Confirm {...props} run={() => perform(action as Parameters<typeof perform>[0], input)} onResult={onResult} />
  );

  switch (action.kind) {
    case "batch":
      return <BatchCard items={action.items} file={file} onResult={onResult} />;
    case "upload_proof":
      return <ProofCard action={action} file={file} onResult={onResult} />;
    case "order_seedlings":
      return <OrderCard action={action} onResult={onResult} />;
    case "claim_slot":
      return confirm({
        title: `Claim ${action.plant} Slot`,
        lines: [
          ...(action.barangay ? [action.barangay] : []),
          `${pts(action.pointsPerPlant)} per plant${action.plantsPerQuest > 1 ? ` · ${action.plantsPerQuest} plants per quest` : ""}`,
          `${plural(action.spotsLeft, "spot")} left · you'll have 7 days to plant and send proof`,
        ],
        label: "Claim Slot",
      });
    case "claim_mission":
      return confirm({ title: `Claim Reward: ${action.title}`, lines: [`+${pts(action.points)}${action.xp ? ` · +${action.xp} XP` : ""}`], label: "Claim Reward" });
    case "redeem_reward": {
      const label = `${voucherAmount(action.valuePesos)} ${action.brand} ${action.isCash ? "cash" : "voucher"}`;
      return confirm(
        {
          title: `Redeem ${label}`,
          lines: [`Cost: ${pts(action.costPoints)}`, `Your balance after: ${pts(action.balance - action.costPoints)}`],
          label: `Redeem for ${pts(action.costPoints)}`,
          ready: !action.isCash || !!extra.trim(),
          children: action.isCash && (
            <label className="mt-3 block text-xs font-medium text-ink-2">
              {action.brand} mobile number
              <input value={extra} onChange={(e) => setExtra(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="0917 123 4567" required className={fieldClass} />
              <span className="mt-1 block font-normal text-ink-3">Double-check it — cash sent to a wrong number can&apos;t be recovered.</span>
            </label>
          ),
        },
        { number: extra },
      );
    }
    case "send_message":
      return confirm(
        {
          title: `Message ${action.name}`,
          label: "Send Message",
          ready: !!text.trim() || (!!file && withFile),
          children: (
            <>
              <label className="mt-2 block text-xs font-medium text-ink-2">
                Message
                <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={2000} placeholder="Write your message" className={fieldClass} />
              </label>
              {file && (
                <label className="mt-2 flex min-h-11 items-center gap-2 text-xs text-ink-2">
                  <input type="checkbox" checked={withFile} onChange={() => setWithFile((v) => !v)} className="h-4 w-4 accent-emerald-400" />
                  Also send {file.name}
                </label>
              )}
              {file && withFile && <FileThumb file={file} />}
            </>
          ),
        },
        { text, file: withFile ? file : null },
      );
    case "add_friend":
      return confirm({ title: action.accept ? `Accept ${action.name}'s Friend Request` : `Add ${action.name} as a Friend`, lines: action.city ? [action.city] : [], label: action.accept ? "Accept" : "Send Request" });
    case "remove_friend":
      return confirm({
        title: action.state === "FRIENDS" ? `Unfriend ${action.name}` : action.state === "REQUESTED" ? `Cancel Your Request to ${action.name}` : `Decline ${action.name}'s Request`,
        lines: action.state === "FRIENDS" ? ["You won't be able to message each other until you're friends again."] : [],
        label: action.state === "FRIENDS" ? "Unfriend" : action.state === "REQUESTED" ? "Cancel Request" : "Decline",
        danger: true,
      });
    case "block_user":
      return confirm({
        title: action.block ? `Block ${action.name}` : `Unblock ${action.name}`,
        lines: action.block ? ["You won't find each other, message, or see each other's photos. This also ends any friendship."] : ["You'll be able to find each other again. You won't be friends again automatically."],
        label: action.block ? "Block" : "Unblock",
        danger: action.block,
      });
    case "report_user":
      return confirm(
        {
          title: `Report ${action.name}`,
          label: "Send Report",
          danger: true,
          ready: !!extra && (extra !== "OTHER" || !!details.trim()),
          children: (
            <>
              <label className="mt-2 block text-xs font-medium text-ink-2">
                Reason
                <select value={extra} onChange={(e) => setExtra(e.target.value)} className={`${fieldClass} min-h-11`}>
                  <option value="">Choose a reason</option>
                  {action.reasons.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="mt-2 block text-xs font-medium text-ink-2">
                What happened? {extra !== "OTHER" && <span className="font-normal text-ink-3">(optional)</span>}
                <textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={3} maxLength={500} className={fieldClass} />
              </label>
            </>
          ),
        },
        { number: extra, text: details },
      );
    case "like_photo":
      return confirm({ title: `${action.liked ? "Like" : "Unlike"} ${action.ownerName}'s Latest Photo`, label: action.liked ? "Like" : "Unlike", children: <PhotoThumb photo={action} /> });
    case "comment_photo":
      return confirm(
        {
          title: `Comment on ${action.ownerName}'s Latest Photo`,
          label: "Post Comment",
          ready: !!text.trim(),
          children: (
            <>
              <PhotoThumb photo={action} />
              <label className="mt-2 block text-xs font-medium text-ink-2">
                Comment
                <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={500} placeholder="Write a comment" className={fieldClass} />
              </label>
            </>
          ),
        },
        { text },
      );
    case "change_name":
      return confirm({ title: "Change Your Name", lines: [`From: ${action.current || "(no name)"}`, `To: ${action.name}`], label: "Change Name" });
    case "change_city":
      return confirm({
        title: "Change Your Home City",
        lines: [...(action.current ? [`From: ${action.current}`] : []), `To: ${action.city}, ${action.province}`, "You can only claim slots in your home city, and changing it is limited to once a month."],
        label: "Change City",
      });
    case "profile_photo":
      return action.remove ? confirm({ title: "Remove Your Profile Picture", label: "Remove", danger: true }) : <ProfilePhotoCard attached={file} onResult={onResult} />;
    case "update_settings":
      return confirm({ title: "Change Settings", lines: action.changes.map((c) => c.label), label: "Save Settings" });
    case "invite_code":
      return confirm({ title: "Use an Invite Code", lines: [`Code: ${action.code} (from ${action.referrerName})`, "They get a bonus once your first planting is verified."], label: "Use Code" });
    case "report_problem":
      return confirm(
        {
          title: "Report a Problem to the EcoQuest Team",
          label: "Send Report",
          ready: !!extra.trim() && !!details.trim(),
          children: (
            <>
              <label className="mt-2 block text-xs font-medium text-ink-2">
                Subject
                <input value={extra} onChange={(e) => setExtra(e.target.value)} maxLength={120} className={`${fieldClass} min-h-11`} />
              </label>
              <label className="mt-2 block text-xs font-medium text-ink-2">
                Details
                <textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={4} maxLength={2000} className={fieldClass} />
              </label>
            </>
          ),
        },
        { number: extra, text: details },
      );
    case "read_notifications":
      return confirm({ title: "Mark All Notifications as Read", lines: [`${plural(action.unread, "unread notification")}`], label: "Mark as Read" });
  }
}
