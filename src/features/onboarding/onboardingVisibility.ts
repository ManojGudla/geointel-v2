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
 * This used to take a third input, `consentAsking`, and hide the card while
 * the consent banner was up. The reasoning was sound and the result was the
 * worst bug on the first screen: consent is asked on the FIRST visit, which is
 * the only visit where this card matters, so the one surface that explains
 * what this application is never appeared to anyone seeing it for the first
 * time. What a new visitor actually met was a map, a search box, a row of
 * unexplained buttons and a legal notice. Several people said they could not
 * work out what the app was for, and this is why.
 *
 * The collision it was avoiding was real — the banner covered this card's
 * Dismiss button — but it was a layout problem and it is fixed in layout: the
 * banner is now one line pinned to the bottom edge, and this card is centred
 * with the banner's height reserved beneath it. Neither hides the other, and
 * the visitor gets the explanation on the visit that needs it.
 */
export function onboardingVisible(hasLocation: boolean, dismissed: boolean): boolean {
  return !hasLocation && !dismissed;
}

export function useOnboardingVisible(): boolean {
  const location = useLocationStore((s) => s.selectedLocation);
  const dismissed = useOnboardingStore((s) => s.dismissed);
  return onboardingVisible(Boolean(location), dismissed);
}

/**
 * Whether the consent banner is currently asking, so the card can leave room
 * for it rather than wait for it. Read by MapOnboarding for spacing only.
 */
export function useConsentAsking(): boolean {
  return useConsentUiStore((s) => s.asking);
}
