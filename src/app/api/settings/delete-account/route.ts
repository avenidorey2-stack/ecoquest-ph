import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/authz";
import { hitRateLimit } from "@/lib/rate-limit";
import { deleteAccount } from "@/lib/account-settings";

// POST /api/settings/delete-account { confirm: "DELETE", password? } — permanently deletes the account.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hitRateLimit(`delete-account:${user.id}`, 10, 60 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many attempts. Please try again in an hour." }, { status: 429 });
  }
  const body = (await req.json().catch(() => null)) as { confirm?: unknown; password?: unknown } | null;
  const result = await deleteAccount(user.id, body ?? {});
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
