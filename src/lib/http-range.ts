// HTTP byte-range parsing for media responses.

/**
 * A single `bytes=start-end` / `bytes=start-` / `bytes=-suffix` range, clamped to the file.
 * Returns null for no (or a multi-part) range — the full file is sent — and "invalid" when the
 * range can't be satisfied.
 */
export function parseRange(header: string | null, size: number): { start: number; end: number } | null | "invalid" {
  const match = header?.trim().match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return null;
  const [, from, to] = match;
  if (!from && !to) return "invalid";
  let start: number;
  let end: number;
  if (!from) {
    // Suffix range: the last N bytes.
    const suffix = Number(to);
    if (suffix === 0) return "invalid";
    start = Math.max(size - suffix, 0);
    end = size - 1;
  } else {
    start = Number(from);
    end = to ? Math.min(Number(to), size - 1) : size - 1;
  }
  if (start >= size || start > end) return "invalid";
  return { start, end };
}
