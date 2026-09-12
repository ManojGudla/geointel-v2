import { create } from "zustand";
import { useLocationStore } from "@/stores/locationStore";
import { useConsentUiStore } from "@/features/analytics/consentUiStore";

/**
 * Whether the first-run onboarding card is on screen — shared state, because
 * more than one thing needs to know the answer.
 *
 * It used to be a `useState` private to MapOnboarding, so nothing else could
 * tell. The September teaser is also a first-run surface, pinned to the
 * top-right of the map, and on a laptop-width window the two collided: the
 * onboarding card (z-index 12) drew straight over the teaser (z-index 5),
 * cutting its date line in half and hiding "Don't miss it." completely.
 *
 * Restacking the z-indexes only moves the problem — whichever wins covers the
 * other, and covering the intro is worse than covering the teaser. So the
 * rule is that the two are mutually exclusive, and both components derive
 * visibility from the SAME expression below instead of each keeping its own
 * idea of it. tests/unit/firstRunSurfaces.test.ts proves they can never both
 * be on screen.
 *
 * Deliberately not persisted: dismissing the intro is a per-visit action, and
 * the card already stops appearing permanently once a location is chosen.
 */
interface OnboardingState {
  dismissed: boolean;
  dismiss: () => void;
}

export const useOnboardingStore = create<OnboardingState>((set) => ({
  dismissed: false,
  dismiss: () => set({ dismissed: true }),
}));

/**
 * The intro shows until the visitor either dismisses it or selects a place —
 * including by ignoring it entirely and clicking the map, which its own copy
 * invites. Pure, so the mutual-exclusion rule is testable without React.
 *
 * `consentAsking` is the third input and the reason this signature changed.
 * The consent banner renders at z-index 60 against this card's 12, so while
 * both were on screen the banner covered this card's Dismiss button outright:
 * at phone and tablet widths, elementFromPoint at the centre of "Dismiss"
 * returned the banner, and the button could not be clicked at all. A visitor
 * was left with a card over the map that would not close.
 *
 * Waiting is the fix rather than restacking, because restacking just moves
 * which one is covered, and because asking someone two things at once on
 * their first screen is the thing people described as overwhelming. One
 * question, then one card.
 */
export function onboardingVisible(hasLocation: boolean, dismissed: boolean, consentAsking = false): boolean {
  return !hasLocation && !dismissed && !consentAsking;
}

export function useOnboardingVisible(): boolean {
  const location = useLocationStore((s) => s.selectedLocation);
  const dismissed = useOnboardingStore((s) => s.dismissed);
  const consentAsking = useConsentUiStore((s) => s.asking);
  return onboardingVisible(Boolean(location), dismissed, consentAsking);
}
