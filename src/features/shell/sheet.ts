/**
 * Where a bottom sheet is allowed to come to rest.
 *
 * On a phone the workspace panel used to be `position: absolute; inset: 0` —
 * a full-screen overlay. Tapping "Layers" on a map application therefore made
 * the map disappear, which is the single most disorienting thing this product
 * could do: the thing you came for is replaced by a list of controls for it,
 * with no visible relationship between the two. It is the most likely
 * explanation for the feedback that people open the app and cannot tell what
 * it is.
 *
 * A sheet fixes that by refusing to take the whole screen. It rests at one of
 * three heights, the map stays visible above every one of them, and dragging
 * it down past the lowest one closes it — the same gesture people already know
 * from every maps and transit app on their phone.
 *
 * The maths lives here, away from React and the DOM, because "which detent is
 * this drag nearest" and "is this drag a dismissal" are exactly the decisions
 * that are easy to get subtly wrong and impossible to eyeball in a screenshot.
 */

export type Detent = "peek" | "half" | "full";

/** Low to high. Order matters: the keyboard and the tap-to-cycle walk it. */
export const DETENTS: readonly Detent[] = ["peek", "half", "full"] as const;

/**
 * How much of the available column each detent occupies.
 *
 * `full` deliberately stops at 94%. A sheet that reaches the very top is
 * indistinguishable from the full-screen overlay this replaces, and that
 * remaining sliver of map is the whole point — it says "the map is still
 * there, this is covering it" rather than "the map is gone".
 */
export const DETENT_FRACTION: Record<Detent, number> = {
  peek: 0.34,
  half: 0.62,
  full: 0.94,
};

/**
 * Drag below this and the release closes the panel instead of snapping back.
 *
 * Comfortably under `peek` (0.34) so that letting go anywhere near the lowest
 * rest position settles there rather than dismissing. Accidentally closing a
 * panel is far more annoying than an extra deliberate flick down.
 */
export const DISMISS_FRACTION = 0.2;

/** The detent a sheet opens at: both the map and the panel readable at once. */
export const INITIAL_DETENT: Detent = "half";

export function clampFraction(fraction: number): number {
  if (Number.isNaN(fraction)) return DETENT_FRACTION[INITIAL_DETENT];
  return Math.min(DETENT_FRACTION.full, Math.max(0, fraction));
}

export function nearestDetent(fraction: number): Detent {
  let best: Detent = DETENTS[0]!;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const detent of DETENTS) {
    const distance = Math.abs(DETENT_FRACTION[detent] - fraction);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = detent;
    }
  }
  return best;
}

export function shouldDismiss(fraction: number): boolean {
  return fraction < DISMISS_FRACTION;
}

export type Settled = { dismiss: true } | { dismiss: false; detent: Detent };

/** What releasing a drag at this height should do. */
export function settle(fraction: number): Settled {
  const clamped = clampFraction(fraction);
  if (shouldDismiss(clamped)) return { dismiss: true };
  return { dismiss: false, detent: nearestDetent(clamped) };
}

/** Tapping the grip walks up and wraps, so one control reaches every height. */
export function cycleDetent(current: Detent): Detent {
  const index = DETENTS.indexOf(current);
  return DETENTS[(index + 1) % DETENTS.length]!;
}

export function raiseDetent(current: Detent): Detent {
  const index = DETENTS.indexOf(current);
  return DETENTS[Math.min(index + 1, DETENTS.length - 1)]!;
}

export function lowerDetent(current: Detent): Detent {
  const index = DETENTS.indexOf(current);
  return DETENTS[Math.max(index - 1, 0)]!;
}

/**
 * Converts a pointer movement into a height.
 *
 * Dragging DOWN (a positive delta, because screen Y grows downward) makes the
 * sheet shorter — the inversion that is wrong in half the hand-rolled sheets
 * on the web, and the reason this is a named function with a test rather than
 * an expression buried in a pointermove handler.
 */
export function fractionAfterDrag(startFraction: number, deltaY: number, availableHeight: number): number {
  if (availableHeight <= 0) return startFraction;
  return clampFraction(startFraction - deltaY / availableHeight);
}

/** What a screen reader should hear for the current height. */
export function detentLabel(detent: Detent): string {
  if (detent === "peek") return "Panel at its lowest height";
  if (detent === "half") return "Panel at half height";
  return "Panel at full height";
}
