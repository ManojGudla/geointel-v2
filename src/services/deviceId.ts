const STORAGE_KEY = "geointel.deviceId.v1";

/**
 * A stable, anonymous per-browser id (a UUID persisted in localStorage),
 * used to scope feedback submissions without requiring an account - the
 * same anonymous, device-scoped identity model the app already uses for
 * settings/recent-history persistence (see uiStore.ts, searchStore.ts).
 */
export function getDeviceId(): string {
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, id);
    return id;
  } catch {
    // localStorage unavailable (private browsing, quota) - fall back to a
    // per-session id rather than crashing the feature.
    return "session-only";
  }
}
