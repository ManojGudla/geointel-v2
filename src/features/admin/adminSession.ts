/**
 * Where a verified admin key lives for the rest of a tab's life.
 *
 * Two places now need this: the admin dashboard's own login form, and the
 * hidden gate behind the header logo. It is one string, and a second copy of
 * it in another file is how you get a gate that appears to succeed and a
 * dashboard that then asks for the key again.
 *
 * sessionStorage rather than localStorage, deliberately. The key is a shared
 * secret with no expiry and no revocation — the only thing limiting the
 * damage of one sitting in a browser is how long it sits there, and
 * sessionStorage is gone when the tab closes. localStorage would keep it on
 * disk indefinitely, which for a key that unlocks maintenance mode is not a
 * trade worth making for the convenience of not retyping it tomorrow.
 *
 * Every access is wrapped: storage throws outright in a Safari private
 * window, and a thrown exception here would take down the header.
 */

export const ADMIN_SESSION_KEY = "geointel.adminKey";

export function readAdminKey(): string | null {
  try {
    return sessionStorage.getItem(ADMIN_SESSION_KEY);
  } catch {
    return null;
  }
}

export function writeAdminKey(key: string): void {
  try {
    sessionStorage.setItem(ADMIN_SESSION_KEY, key);
  } catch {
    // Non-fatal: the key just will not survive a reload of this tab.
  }
}

export function clearAdminKey(): void {
  try {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
  } catch {
    // Nothing to do — if it cannot be read it cannot be used either.
  }
}
