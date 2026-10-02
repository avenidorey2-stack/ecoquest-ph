import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Email } from "@/lib/email";

// Local development mailbox: when no SMTP server is configured outside production,
// outgoing emails are saved here and shown at /dev/mailbox instead of being sent.

export type MailboxEntry = Email & { id: string; sentAt: string };

const MAX_ENTRIES = 50;

/** On only outside production and only while no real SMTP server is configured. */
export function isDevMailboxEnabled() {
  return process.env.NODE_ENV !== "production" && !process.env.EMAIL_SERVER;
}

function mailboxPath() {
  return process.env.DEV_MAILBOX_PATH ?? path.join(process.cwd(), "storage", "dev-mailbox.json");
}

export async function readDevMailbox(): Promise<MailboxEntry[]> {
  if (!isDevMailboxEnabled()) return [];
  try {
    const data = JSON.parse(await readFile(mailboxPath(), "utf8"));
    return Array.isArray(data) ? data : [];
  } catch {
    return []; // no mailbox file yet, or unreadable — start fresh
  }
}

/** Saves an email to the dev mailbox (newest first, last 50 kept). */
export async function saveToDevMailbox(email: Email) {
  if (!isDevMailboxEnabled()) return;
  const entry: MailboxEntry = { ...email, id: randomUUID(), sentAt: new Date().toISOString() };
  const entries = [entry, ...(await readDevMailbox())].slice(0, MAX_ENTRIES);
  await mkdir(path.dirname(mailboxPath()), { recursive: true });
  await writeFile(mailboxPath(), JSON.stringify(entries, null, 2));
}

export async function clearDevMailbox() {
  if (!isDevMailboxEnabled()) return;
  await mkdir(path.dirname(mailboxPath()), { recursive: true });
  await writeFile(mailboxPath(), "[]");
}
