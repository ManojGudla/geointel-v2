import { ApiUnavailableError } from "@/services/apiClient";

/**
 * What to tell someone when an AI request did not produce an answer.
 *
 * Every failure used to collapse into "ran into an unexpected problem", which
 * is the one message nobody can act on. Offline, a slow free model and a
 * dropped connection each have a different fix, and the person can only take
 * it if they are told which one happened.
 */
export function describeAiFailure(error: unknown, online: boolean = typeof navigator === "undefined" || navigator.onLine !== false): string {
  if (!online) return "You're offline. Connect to the internet to ask a new question.";
  // The server's own words: rate limits, missing keys, a provider refusing.
  if (error instanceof ApiUnavailableError) return error.message;

  const text = error instanceof Error ? error.message : "";
  if (/timed out/i.test(text)) {
    return "That took too long to answer, so it was stopped. Ask it again, or ask something shorter.";
  }
  if (/could not reach/i.test(text)) {
    return "Couldn't reach maNOWj. Check your connection and try again.";
  }
  if (/unexpected response/i.test(text)) {
    return "That answer came back unreadable. Ask it again.";
  }
  return "The AI couldn't answer this time. Please try again.";
}
