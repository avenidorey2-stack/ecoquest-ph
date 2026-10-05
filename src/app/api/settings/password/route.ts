import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/authz";
import { hitRateLimit } from "@/lib/rate-limit";
import { changePassword } from "@/lib/account-settings";

// POST /api/settings/password { current?, next } — change (or first set) the account password.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hitRateLimit(`password-change:${user.id}`, 10, 60 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many attempts. Please try again in an hour." }, { status: 429 });
  }
  const body = (await req.json().catch(() => null)) as { current?: unknown; next?: unknown } | null;
  const result = await changePassword(user.id, body?.current, body?.next);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
