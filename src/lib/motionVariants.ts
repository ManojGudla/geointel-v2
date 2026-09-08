/**
 * Shared Framer Motion presets for the app's overlay/panel components
 * (Help Guide, Feedback, Copilot, Command Palette, Directions, POI
 * Inspector...) so every one of them enters/exits with the same feel
 * instead of each inventing its own numbers. Read useMotionPreference()
 * before using these — when it's false, skip Framer Motion entirely rather
 * than passing a zero-duration transition, so there's no motion code path
 * running at all.
 */

export const overlayFade = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.18 },
};

export const panelRise = {
  initial: { opacity: 0, y: 16, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 10, scale: 0.98 },
  transition: { duration: 0.22, ease: [0.2, 0.8, 0.2, 1] as const },
};

/** For panels docked to the map's right edge (Directions, POI Inspector). */
export const panelSlideIn = {
  initial: { opacity: 0, x: 24 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 16 },
  transition: { duration: 0.2, ease: [0.2, 0.8, 0.2, 1] as const },
};

/** For the Copilot launcher/panel, which rises from the bottom-right. */
export const panelRiseFromBottom = {
  initial: { opacity: 0, y: 24, scale: 0.96 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 16, scale: 0.97 },
  transition: { duration: 0.2, ease: [0.2, 0.8, 0.2, 1] as const },
};
