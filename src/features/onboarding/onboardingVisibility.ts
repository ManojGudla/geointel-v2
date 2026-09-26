import { create } from "zustand";
import { useLocationStore } from "@/stores/locationStore";
import { useConsentUiStore } from "@/features/analytics/consentUiStore";

/**
 * Whether the first-run onboarding card is on screen - shared state, because
 * more than one thing needs to know the answer.
 *
 * It used to be a `useState` private to MapOnboarding, so nothing else could
 * tell. The September teaser is also a first-run surface, pinned to the
 * top-right of the map, and on a laptop-width window the two collided: the
 * onboarding card (z-index 12) drew straight over the teaser (z-index 5),
 * cutting its date line in half and hiding "Don't miss it." completely.
 *
 * Restacking the z-indexes only moves the problem - whichever wins covers the
 * other, and covering the intro is worse than covering the teaser. So the
 * rule is that the two are mutually exclusive, and both components derive
 * visibility from the SAME expression below instead of each keeping its own
 * idea of it. tests/unit/firstRunSurfaces.test.ts proves they can never both
 * be on screen.
 *
 * Remembered in this browser. It used to be deliberately per-visit, on the
 * belief that the card "stops appearing permanently once a location is
 * chosen". It did not: the selected place is not kept between visits, so
 * every returning visitor met the same introduction, centred over the map,
 * every time. Once someone has dismissed it or picked a place, they have
 * seen what it is for.
 */
const DONE_KEY = "geointel.onboardingDone.v1";

function alreadyDone(): boolean {
  try {
    return localStorage.getItem(DONE_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberDone() {
  try {
    localStorage.setItem(DONE_KEY, "1");
  } catch {
    // Blocked storage: the card simply shows again next visit.
  }
}

interface OnboardingState {
  dismissed: boolean;
  dismiss: () => void;
}

export const useOnboardingStore = create<OnboardingState>((set) => ({
  dismissed: alreadyDone(),
  dismiss: () => {
    rememberDone();
    set({ dismissed: true });
  },
}));

// Picking a place counts as having used the introduction.
useLocationStore.subscribe((state, previous) => {
  if (state.selectedLocation && !previous.selectedLocation) rememberDone();
});

/**
 * The intro shows until the visitor either dismisses it or selects a place -
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
 * The collision it was avoiding was real - the banner covered this card's
 * Dismiss button - but it was a layout problem and it is fixed in layout: the
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
