import { create } from "zustand";

/**
 * Whether the consent banner is currently asking the visitor a question.
 *
 * Shared state for the same reason useOnboardingStore is: something else has
 * to know the answer. The banner sits at z-index 60 and the onboarding card
 * at z-index 12, so on a phone or tablet the banner was drawn straight over
 * the card's Dismiss button. Measured on the live site: at 390px and at
 * 768px, document.elementFromPoint at the centre of "Dismiss" returned the
 * consent banner's own text, not the button. The button could not be clicked
 * at all.
 *
 * That is the worst possible version of this bug. A first-time visitor got a
 * card covering the map with a close button that did nothing, tapped it,
 * tapped it again, and concluded the app was broken. The only way out was to
 * answer the consent banner first, which nobody connects to the card that
 * will not close.
 *
 * Restacking would only swap which one gets covered, exactly as it would
 * have for the teaser collision this app already fixed. So the same rule
 * applies: the two are mutually exclusive, both derive from one pure
 * function, and tests/unit/firstRunSurfaces.test.ts holds the rule.
 *
 * Sequencing them this way also answers a separate piece of feedback, that
 * the first view felt like too much at once. It is now one question, then
 * one card.
 */
interface ConsentUiState {
  /** True only while the banner is on screen awaiting an answer. */
  asking: boolean;
  setAsking: (asking: boolean) => void;
}

export const useConsentUiStore = create<ConsentUiState>((set) => ({
  asking: false,
  setAsking: (asking) => set({ asking }),
}));
