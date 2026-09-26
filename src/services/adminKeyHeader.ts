/**
 * The admin key, as request headers the browser will actually send.
 *
 * HTTP header values may only hold Latin-1 characters. Any code containing a
 * curly apostrophe (which phone keyboards put in automatically), an emoji or
 * Telugu script made fetch() refuse the request before it left the browser,
 * and the owner gate reported that as "Couldn't reach the server". A code with
 * an accented letter did go out, but as different bytes from the ones the
 * server compared against, so the right code read as wrong.
 *
 * Percent-encoding makes every code plain ASCII on the wire. The second header
 * tells the server to decode it; see api/_lib/adminAuth.ts.
 */
export const ADMIN_KEY_HEADER = "x-geointel-admin-key";
export const ADMIN_KEY_ENCODING_HEADER = "x-geointel-admin-key-encoding";

export function adminKeyHeaders(key: string): Record<string, string> {
  return { [ADMIN_KEY_HEADER]: encodeURIComponent(key), [ADMIN_KEY_ENCODING_HEADER]: "uri" };
}
