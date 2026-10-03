import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { isDevMailboxEnabled, readDevMailbox } from "@/lib/dev-mailbox";
import { clearMailbox } from "./actions";

export const metadata: Metadata = { title: "Dev mailbox · EcoQuest PH", robots: { index: false } };

// Development-only inbox for emails "sent" without an SMTP server (see src/lib/email.ts).
// Returns 404 in production or whenever EMAIL_SERVER is configured.
export default async function DevMailboxPage() {
  await connection(); // always read the latest mailbox
  if (!isDevMailboxEnabled()) notFound();

  const emails = await readDevMailbox();

  return (
    <div className="min-h-screen bg-slate-50 p-4 text-slate-900">
      <div className="mx-auto max-w-3xl space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">📬 Dev mailbox</h1>
            <p className="text-sm text-slate-500">
              Emails the app would have sent. Development only — set <code>EMAIL_SERVER</code> to send real email.
            </p>
          </div>
          <div className="flex gap-2">
            <a href="/dev/mailbox" className="rounded-lg border bg-white px-3 py-1.5 text-sm hover:bg-slate-50">
              Refresh
            </a>
            {emails.length > 0 && (
              <form action={clearMailbox}>
                <button className="rounded-lg border bg-white px-3 py-1.5 text-sm text-red-700 hover:bg-red-50">
                  Clear all
                </button>
              </form>
            )}
          </div>
        </header>

        {emails.length === 0 ? (
          <p className="rounded-xl border bg-white p-8 text-center text-sm text-slate-500">
            No emails yet. Sign up at <a href="/signup" className="text-emerald-700 underline">/signup</a> and refresh.
          </p>
        ) : (
          <ul className="space-y-4">
            {emails.map((email) => {
              const links = [...new Set(email.text.match(/https?:\/\/\S+/g) ?? [])];
              return (
                <li key={email.id} className="overflow-hidden rounded-xl border bg-white">
                  <div className="border-b px-4 py-3 text-sm">
                    <p className="font-semibold">{email.subject}</p>
                    <p className="text-slate-500">
                      To {email.to} · {new Date(email.sentAt).toLocaleString("en-PH", { timeZone: "Asia/Manila" })}
                    </p>
                    {links.map((link) => (
                      <a
                        key={link}
                        href={link}
                        className="mt-2 mr-2 inline-block rounded-lg bg-emerald-700 px-3 py-1.5 font-medium text-white hover:bg-emerald-800"
                      >
                        Open link →
                      </a>
                    ))}
                  </div>
                  {/* Rendered sandboxed with scripts disabled; links open in this tab. */}
                  <iframe
                    title={email.subject}
                    sandbox="allow-top-navigation-by-user-activation"
                    srcDoc={`<base target="_top"><div style="font-family:system-ui,sans-serif;font-size:14px">${email.html}</div>`}
                    className="h-64 w-full"
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
