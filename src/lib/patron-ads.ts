const MAX_COMPANY_NAME = 80;
const MAX_URL = 2048;

type AdFields = { companyName: string; imageUrl: string; targetUrl: string; isActive: boolean };
type Result<T> = { ok: true; data: T } | { ok: false; error: string };

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > MAX_URL) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

/** Validates a patron ad payload. With `partial`, only provided fields are checked/returned. */
export function parsePatronAd(body: Record<string, unknown>, { partial = false } = {}): Result<Partial<AdFields>> {
  const data: Partial<AdFields> = {};

  if (body.companyName !== undefined) {
    const name = typeof body.companyName === "string" ? body.companyName.trim() : "";
    if (!name || name.length > MAX_COMPANY_NAME) {
      return { ok: false, error: `companyName must be 1–${MAX_COMPANY_NAME} characters.` };
    }
    data.companyName = name;
  } else if (!partial) return { ok: false, error: "companyName is required." };

  for (const field of ["imageUrl", "targetUrl"] as const) {
    if (body[field] !== undefined) {
      if (!isHttpsUrl(body[field])) return { ok: false, error: `${field} must be an https:// URL.` };
      data[field] = body[field] as string;
    } else if (!partial) return { ok: false, error: `${field} is required.` };
  }

  if (body.isActive !== undefined) {
    if (typeof body.isActive !== "boolean") return { ok: false, error: "isActive must be true or false." };
    data.isActive = body.isActive;
  }

  return { ok: true, data };
}
