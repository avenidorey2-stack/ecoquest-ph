import nodemailer, { type Transporter } from "nodemailer";
import { saveToDevMailbox } from "@/lib/dev-mailbox";

export type Email = { to: string; subject: string; text: string; html: string };

let transport: Transporter | null = null;

/**
 * The email couldn't be delivered (SMTP down, or not configured in production).
 * Routes turn this — and only this — into a "try again later" 503; other errors are real bugs.
 */
export class EmailDeliveryError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "EmailDeliveryError";
  }
}

/**
 * Sends an email via SMTP (EMAIL_SERVER, e.g. smtp://user:pass@smtp.example.com:587).
 * In development without EMAIL_SERVER the message goes to the local dev mailbox
 * (viewable at /dev/mailbox) and the console; in production a missing config is an
 * error, so sign-ups never silently fail to send.
 */
export async function sendEmail(email: Email) {
  const server = process.env.EMAIL_SERVER;
  if (!server) {
    if (process.env.NODE_ENV === "production") {
      throw new EmailDeliveryError("EMAIL_SERVER is not configured — cannot send email.");
    }
    await saveToDevMailbox(email);
    console.info(`\n[email:dev] To: ${email.to} — "${email.subject}" — view it at /dev/mailbox\n\n${email.text}\n`);
    return;
  }
  transport ??= nodemailer.createTransport(server);
  try {
    await transport.sendMail({
      from: process.env.EMAIL_FROM ?? "EcoQuest PH <no-reply@ecoquest.ph>",
      to: email.to,
      subject: email.subject,
      text: email.text,
      html: email.html,
    });
  } catch (err) {
    throw new EmailDeliveryError("SMTP delivery failed.", { cause: err });
  }
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
