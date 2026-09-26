import { describe, expect, it, beforeEach, vi } from "vitest";

/**
 * The first-visit card is for the first visit. It used to come back on every
 * visit, because neither its dismissal nor the selected place was kept.
 */

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});

async function load() {
  const onboarding = await import("../../src/features/onboarding/onboardingVisibility");
  const { useLocationStore } = await import("../../src/stores/locationStore");
  return { ...onboarding, useLocationStore };
}

describe("remembering the introduction", () => {
  it("shows on a genuinely first visit", async () => {
    const { useOnboardingStore } = await load();
    expect(useOnboardingStore.getState().dismissed).toBe(false);
  });

  it("stays dismissed on the next visit once dismissed", async () => {
    (await load()).useOnboardingStore.getState().dismiss();
    vi.resetModules();
    expect((await load()).useOnboardingStore.getState().dismissed).toBe(true);
  });

  it("stays away on the next visit once a place was picked", async () => {
    const { useLocationStore } = await load();
    useLocationStore.getState().setSelectedLocation({ lat: 1, lon: 2, name: "x", displayName: "x", address: {}, source: "t" });
    vi.resetModules();
    expect((await load()).useOnboardingStore.getState().dismissed).toBe(true);
  });
});
