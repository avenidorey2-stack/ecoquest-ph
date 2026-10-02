import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearDevMailbox, isDevMailboxEnabled, readDevMailbox, saveToDevMailbox } from "@/lib/dev-mailbox";

// tests/setup.ts mocks sendEmail globally; these tests need the real one.
const { sendEmail, EmailDeliveryError } = await vi.importActual<typeof import("@/lib/email")>("@/lib/email");

const email = (n: number) => ({ to: `user${n}@example.ph`, subject: `Subject ${n}`, text: `Body ${n}`, html: `<p>${n}</p>` });

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "ecoquest-mailbox-"));
  vi.stubEnv("DEV_MAILBOX_PATH", path.join(dir, "mailbox.json"));
  vi.stubEnv("EMAIL_SERVER", "");
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
});

describe("isDevMailboxEnabled", () => {
  it("is on outside production when no SMTP server is configured", () => {
    expect(isDevMailboxEnabled()).toBe(true);
  });

  it("is off in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(isDevMailboxEnabled()).toBe(false);
  });

  it("is off once EMAIL_SERVER is set", () => {
    vi.stubEnv("EMAIL_SERVER", "smtp://user:pass@smtp.example.com:587");
    expect(isDevMailboxEnabled()).toBe(false);
  });
});

describe("dev mailbox storage", () => {
  it("starts empty and stores emails newest first", async () => {
    expect(await readDevMailbox()).toEqual([]);
    await saveToDevMailbox(email(1));
    await saveToDevMailbox(email(2));
    const entries = await readDevMailbox();
    expect(entries.map((e) => e.subject)).toEqual(["Subject 2", "Subject 1"]);
    expect(entries[0]).toMatchObject({ to: "user2@example.ph", text: "Body 2", html: "<p>2</p>" });
    expect(entries[0].id).toBeTruthy();
    expect(Date.parse(entries[0].sentAt)).not.toBeNaN();
  });

  it("keeps only the latest 50", async () => {
    for (let i = 1; i <= 55; i++) await saveToDevMailbox(email(i));
    const entries = await readDevMailbox();
    expect(entries).toHaveLength(50);
    expect(entries[0].subject).toBe("Subject 55");
    expect(entries.at(-1)!.subject).toBe("Subject 6");
  });

  it("clears", async () => {
    await saveToDevMailbox(email(1));
    await clearDevMailbox();
    expect(await readDevMailbox()).toEqual([]);
  });

  it("recovers from a corrupt mailbox file", async () => {
    writeFileSync(path.join(dir, "mailbox.json"), "{not json");
    expect(await readDevMailbox()).toEqual([]);
    await saveToDevMailbox(email(1));
    expect(await readDevMailbox()).toHaveLength(1);
  });

  it("does nothing in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await saveToDevMailbox(email(1));
    vi.stubEnv("NODE_ENV", "test");
    expect(await readDevMailbox()).toEqual([]);
  });
});

describe("sendEmail without EMAIL_SERVER", () => {
  it("delivers to the dev mailbox in development", async () => {
    await sendEmail(email(7));
    expect((await readDevMailbox()).map((e) => e.subject)).toEqual(["Subject 7"]);
  });

  it("refuses in production instead of silently dropping the email", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const result = sendEmail(email(8));
    await expect(result).rejects.toBeInstanceOf(EmailDeliveryError);
    await expect(result).rejects.toThrow(/EMAIL_SERVER is not configured/);
    vi.stubEnv("NODE_ENV", "test");
    expect(await readDevMailbox()).toEqual([]);
  });
});

describe("sendEmail with EMAIL_SERVER", () => {
  it("reports SMTP failures as EmailDeliveryError", async () => {
    // Nothing listens on port 1, so the connection is refused immediately.
    vi.stubEnv("EMAIL_SERVER", "smtp://127.0.0.1:1");
    await expect(sendEmail(email(9))).rejects.toBeInstanceOf(EmailDeliveryError);
  });
});
