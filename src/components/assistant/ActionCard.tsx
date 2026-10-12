"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import ProofUploadForm from "@/components/quests/ProofUploadForm";
import type { AssistantAction } from "@/lib/assistant/actions";
import { voucherAmount } from "@/lib/voucher";

// Cards EcoBot puts in the chat for things the planter asked to do. Nothing happens until the
// planter confirms here, and each card calls the same API route as the rest of the app.

/** What became of a card: done (ok) or dismissed. Kept with the chat so a reload doesn't re-offer it. */
export type ActionResult = { ok: boolean; text: string };

const pts = (n: number) => `${n.toLocaleString("en-PH")} pts`;
const cardClass = "rounded-2xl bg-card-2 p-3 ring-1 ring-line-strong";
const primaryBtn =
  "inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-emerald-400 px-4 text-sm font-semibold text-emerald-950 hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryBtn = "inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold text-ink-2 ring-1 ring-line-strong hover:bg-card-3 disabled:opacity-50";

/** POSTs to an app route; returns the error to show, or null on success. */
async function post(url: string, body?: unknown) {
  const res = await fetch(url, {
    method: "POST",
    ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  }).catch(() => null);
  if (!res) return "Couldn't reach the server. Check your connection and try again.";
  if (res.ok) return null;
  return (await res.json().catch(() => ({}))).error ?? "That didn't work. Please try again.";
}

function Confirm({
  title,
  lines,
  label,
  run,
  onResult,
  children,
  ready = true,
}: {
  title: string;
  lines: string[];
  label: string;
  /** Does the action; returns the success message or throws the error message. */
  run: () => Promise<string>;
  onResult: (result: ActionResult) => void;
  children?: React.ReactNode;
  ready?: boolean;
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
      <p className="text-sm font-bold text-ink">{title}</p>
      <ul className="mt-1 space-y-0.5 text-xs text-ink-2">
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      {children}
      {error && (
        <p role="alert" className="mt-2 text-sm text-rose-300">
          {error}
        </p>
      )}
      <div className="mt-3 flex gap-2">
        <button type="submit" disabled={busy || !ready} className={primaryBtn}>
          {busy ? "Working…" : label}
        </button>
        <button type="button" disabled={busy} onClick={() => onResult({ ok: false, text: "Cancelled." })} className={secondaryBtn}>
          Not Now
        </button>
      </div>
    </form>
  );
}

const failIf = (error: string | null) => {
  if (error) throw new Error(error);
};

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

function RedeemCard({ action, onResult }: { action: Extract<AssistantAction, { kind: "redeem_reward" }>; onResult: (r: ActionResult) => void }) {
  const [number, setNumber] = useState(action.lastNumber ?? "");
  const label = `${voucherAmount(action.valuePesos)} ${action.brand} ${action.isCash ? "cash" : "voucher"}`;
  return (
    <Confirm
      title={`Redeem ${label}`}
      lines={[`Cost: ${pts(action.costPoints)}`, `Your balance after: ${pts(action.balance - action.costPoints)}`]}
      label={`Redeem for ${pts(action.costPoints)}`}
      ready={!action.isCash || !!number.trim()}
      run={async () => {
        failIf(await post(`/api/rewards/${action.rewardId}/redeem`, action.isCash ? { eWalletNumber: number } : {}));
        return action.isCash ? `Redeemed! ${label} will be sent to ${number.trim()} once an admin approves it.` : `Redeemed! Your ${label} will appear in Transactions once it's approved.`;
      }}
      onResult={onResult}
    >
      {action.isCash && (
        <label className="mt-3 block text-xs font-medium text-ink-2">
          {action.brand} mobile number
          <input
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            inputMode="tel"
            autoComplete="tel"
            placeholder="0917 123 4567"
            required
            className="mt-1 block min-h-11 w-full rounded-xl border border-line-strong bg-card px-3 text-base text-ink focus:border-emerald-400/60 focus:outline-none sm:text-sm"
          />
          <span className="mt-1 block font-normal text-ink-3">Double-check it — cash sent to a wrong number can&apos;t be recovered.</span>
        </label>
      )}
    </Confirm>
  );
}

/** One action card, or what came of it once it's been confirmed or dismissed. */
export default function ActionCard({
  action,
  result,
  file = null,
  onResult,
}: {
  action: AssistantAction;
  result?: ActionResult;
  /** A photo or video the planter attached in the chat, for a proof card. */
  file?: File | null;
  onResult: (result: ActionResult) => void;
}) {
  if (result) {
    return (
      <p
        role="status"
        className={`rounded-2xl px-3.5 py-2 text-sm ring-1 ${result.ok ? "bg-emerald-400/10 text-emerald-200 ring-emerald-400/30" : "bg-card-2 text-ink-3 ring-line"}`}
      >
        {result.ok && "✓ "}
        {result.text}
      </p>
    );
  }
  switch (action.kind) {
    case "upload_proof":
      return <ProofCard action={action} file={file} onResult={onResult} />;
    case "claim_slot":
      return (
        <Confirm
          title={`Claim ${action.plant} Slot`}
          lines={[
            ...(action.barangay ? [action.barangay] : []),
            `${pts(action.pointsPerPlant)} per plant${action.plantsPerQuest > 1 ? ` · ${action.plantsPerQuest} plants per quest` : ""}`,
            `${action.spotsLeft} spot${action.spotsLeft === 1 ? "" : "s"} left · you'll have 7 days to plant and send proof`,
          ]}
          label="Claim Slot"
          run={async () => {
            failIf(await post(`/api/slots/${action.slotId}/claim`));
            return "Slot claimed! You have 7 days to plant and send your proof. Type /upload when you're ready.";
          }}
          onResult={onResult}
        />
      );
    case "claim_mission":
      return (
        <Confirm
          title={`Claim Reward: ${action.title}`}
          lines={[`+${pts(action.points)}${action.xp ? ` · +${action.xp} XP` : ""}`]}
          label="Claim Reward"
          run={async () => {
            failIf(await post(`/api/missions/${action.missionId}/claim`));
            return `+${pts(action.points)} claimed!`;
          }}
          onResult={onResult}
        />
      );
    case "redeem_reward":
      return <RedeemCard action={action} onResult={onResult} />;
  }
}
