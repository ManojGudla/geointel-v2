import { timingSafeEqual } from "node:crypto";
import type { ApiRequest } from "./http.js";

const ADMIN_HEADER = "x-geointel-admin-key";
const ENCODING_HEADER = "x-geointel-admin-key-encoding";

/**
 * The key the caller sent, as the text they typed.
 *
 * The app percent-encodes the key and says so in a second header, because a
 * header value cannot carry a curly apostrophe, an emoji or Telugu script, and
 * the browser refused to send such a key at all (see
 * src/services/adminKeyHeader.ts). A header without that marker is taken as
 * written, so a script or an older tab still works with a plain key. A value
 * marked as encoded that does not decode is treated as no key.
 */
export function providedAdminKey(req: ApiRequest): string | null {
  const raw = req.headers[ADMIN_HEADER];
  if (typeof raw !== "string" || !raw) return null;
  if (req.headers[ENCODING_HEADER] !== "uri") return raw;
  try {
    return decodeURIComponent(raw) || null;
  } catch {
    return null;
  }
}

/**
 * Whether the server has an admin key configured at all. Admin routes must
 * check this and fail closed (503, not "any request is admin") when it's
 * missing - GEOINTEL_ADMIN_KEY unset should never silently mean "everyone is
 * an admin."
 */
export function isAdminConfigured(): boolean {
  return !!process.env.GEOINTEL_ADMIN_KEY;
}

/**
 * True only if the request carries the exact configured admin key in the
 * x-geointel-admin-key header. Uses a constant-time comparison so a wrong
 * guess can't be narrowed down by response-time differences - the one
 * meaningful security property a shared-secret check like this can offer
 * without a real accounts system.
 */
export function isAdminRequest(req: ApiRequest): boolean {
  const expected = process.env.GEOINTEL_ADMIN_KEY;
  if (!expected) return false;

  const provided = providedAdminKey(req);
  if (!provided) return false;

  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  // timingSafeEqual throws on mismatched lengths - different key lengths
  // are already conclusively "not a match," so short-circuiting here is
  // safe (it leaks length, not content, and length isn't the secret).
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
