/**
 * Attribution for an AI answer: which model wrote it, and when.
 *
 * Every other figure in this application carries its source and its date -
 * population says "Wikidata", air quality says "Open-Meteo", an officeholder
 * that can't be verified says so rather than being filled in from memory. The
 * AI answers were the one exception: they arrived with neither, in the part
 * of the product where the reader has the least ability to check for
 * themselves.
 *
 * That matters more here than it would elsewhere, because the default
 * provider slug (`openrouter/free`) is a router rather than a model - it
 * picks a free model at random per request. So the same agent, run twice,
 * genuinely is two different authors, and "which one" is not a detail.
 */

/** Shown when the provider didn't name the model that served a request. */
export const UNKNOWN_MODEL_LABEL = "model not reported";

/**
 * The model slug, as the provider gave it - not prettified.
 *
 * A cleaned-up display name ("Llama 3.3") would read better and be worth
 * less: the slug is the string someone can actually look up, and the
 * `:free` / vendor parts of it are the parts that explain why one run
 * answered better than the next.
 */
export function formatModelLabel(model: string | undefined | null): string {
  const trimmed = typeof model === "string" ? model.trim() : "";
  if (!trimmed) return UNKNOWN_MODEL_LABEL;
  // A router slug names no model at all, so say that rather than printing a
  // word the reader would reasonably mistake for the author's name.
  if (trimmed === "openrouter/free") return "a free model chosen by OpenRouter";
  return trimmed;
}

/**
 * Local clock time for an ISO timestamp, with the date added once the answer
 * is no longer from today - so a card left open overnight can't read as if
 * it were written a moment ago.
 */
export function formatGeneratedAt(iso: string | undefined | null, now: Date = new Date()): string {
  if (!iso) return "";
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return "";

  const time = when.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const sameDay =
    when.getFullYear() === now.getFullYear() && when.getMonth() === now.getMonth() && when.getDate() === now.getDate();
  if (sameDay) return time;
  return `${when.toLocaleDateString(undefined, { day: "numeric", month: "short" })}, ${time}`;
}

/** The single line an AI answer carries: who wrote it and when. */
export function aiAttribution(model: string | undefined | null, generatedAt?: string | null, now?: Date): string {
  const when = formatGeneratedAt(generatedAt, now);
  const who = `Written by ${formatModelLabel(model)}`;
  return when ? `${who} · ${when}` : who;
}
