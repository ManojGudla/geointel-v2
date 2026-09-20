/**
 * The gesture that opens the hidden entrance.
 *
 * The brief was "clicking the logo opens a page that asks for a secret code,
 * so only I can use it". A single click does not achieve the second half:
 * every visitor clicks a logo - it is the most reliable convention on the
 * web that a logo goes home - and a password box appearing for all of them
 * both breaks that convention and advertises that an admin area exists,
 * which is the opposite of hidden.
 *
 * Three taps inside a second and a bit is the smallest gesture nobody
 * performs by accident and the owner can perform without thinking. A single
 * click keeps doing nothing unusual, so nothing about the page changes for
 * anyone who does not already know.
 *
 * To be clear about what this is and is not: the gesture is obscurity, not
 * security. It hides the door. The lock is the code typed afterwards, and
 * that code is checked on the server against GEOINTEL_ADMIN_KEY - never in
 * this file, never in the bundle, never anywhere a visitor could read it.
 * Anyone who reads the source can find this gesture in a minute; they still
 * cannot get through the door, which is the part that matters.
 */

export const SECRET_TAPS = 3;
export const SECRET_WINDOW_MS = 1200;

/**
 * Folds a new tap into the recent ones, dropping any that have aged out.
 *
 * Returns a new array rather than mutating, so this is safe to call straight
 * from a React state updater.
 */
export function recordTap(previous: readonly number[], now: number): number[] {
  return [...previous, now].filter((at) => now - at < SECRET_WINDOW_MS).slice(-SECRET_TAPS);
}

/** Whether the taps recorded so far complete the gesture. */
export function isTriggered(taps: readonly number[]): boolean {
  return taps.length >= SECRET_TAPS;
}
