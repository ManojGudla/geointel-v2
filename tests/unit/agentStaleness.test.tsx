import { describe, expect, it, vi, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { agentSubject, isSamePlace, stalenessNotice, NO_SUBJECT, SAME_PLACE_METRES } from "../../src/features/ai/agentSubject";

/**
 * The failure this guards against, in full:
 *
 *   1. Select Hyderabad. Run the GIS agent. Read a confident paragraph about
 *      dense retail evidence.
 *   2. Search Mumbai. The map flies there; every panel refreshes.
 *   3. The agent card still shows the Hyderabad paragraph, under a heading
 *      that says GIS Intelligence, in a panel describing Mumbai.
 *
 * Nothing in the store recorded which place an answer was about, and nothing
 * ever cleared one. It is the worst shape of error this product can make -
 * not a missing answer but a plausible one about the wrong place, in prose,
 * where there are no units to sanity-check.
 */

describe("identifying what an answer is about", () => {
  it("treats a few metres of jitter as the same place", () => {
    /*
      The evidence radius starts at 500m, so a marker nudged across a
      pavement has not changed the answer. A warning that fires on that is
      one people learn to ignore.

      This assertion is the reason the implementation is a distance
      comparison rather than a rounded key. The first version rounded both
      coordinates to 4dp and compared strings, and this pair - 20cm apart -
      failed it, because these two values round either side of a grid line.
      No grid size fixes that; only asking the real question does.
    */
    const a = agentSubject({ name: "Banjara Hills", lat: 17.41234, lon: 78.43211 });
    const b = agentSubject({ name: "Banjara Hills", lat: 17.41236, lon: 78.43213 });
    expect(isSamePlace(a, b)).toBe(true);
  });

  it("treats two genuinely different places as different", () => {
    const hyderabad = agentSubject({ name: "Hyderabad", lat: 17.385, lon: 78.4867 });
    const mumbai = agentSubject({ name: "Mumbai", lat: 19.076, lon: 72.8777 });
    expect(isSamePlace(hyderabad, mumbai)).toBe(false);
  });

  it("puts the boundary where the constant says it does", () => {
    // ~0.0009° of latitude is ~100m: outside the threshold. ~0.0002° is
    // ~22m: inside it. Checked against the declared constant so the two
    // can't drift apart.
    expect(SAME_PLACE_METRES).toBeGreaterThan(22);
    expect(SAME_PLACE_METRES).toBeLessThan(100);
    const base = agentSubject({ name: "A", lat: 17.385, lon: 78.4867 });
    expect(isSamePlace(base, agentSubject({ name: "B", lat: 17.3852, lon: 78.4867 }))).toBe(true);
    expect(isSamePlace(base, agentSubject({ name: "C", lat: 17.3859, lon: 78.4867 }))).toBe(false);
  });

  it("gives 'nothing selected' an identity of its own", () => {
    expect(agentSubject(null)).toEqual(NO_SUBJECT);
    expect(isSamePlace(NO_SUBJECT, NO_SUBJECT)).toBe(true);
    expect(isSamePlace(NO_SUBJECT, agentSubject({ name: "Mumbai", lat: 19.076, lon: 72.8777 }))).toBe(false);
  });
});

describe("the notice printed above a stale answer", () => {
  const hyderabad = agentSubject({ name: "Hyderabad", lat: 17.385, lon: 78.4867 });
  const mumbai = agentSubject({ name: "Mumbai", lat: 19.076, lon: 72.8777 });

  it("says nothing while the answer still describes what's on screen", () => {
    expect(stalenessNotice(hyderabad, hyderabad)).toBeNull();
  });

  it("names both places, so the reader knows which one they're reading about", () => {
    const notice = stalenessNotice(hyderabad, mumbai);
    expect(notice).toContain("Hyderabad");
    expect(notice).toContain("Mumbai");
  });

  it("covers the case where the selection was cleared entirely", () => {
    expect(stalenessNotice(hyderabad, NO_SUBJECT)).toContain("Hyderabad");
  });

  it("does not cry wolf for an answer with no recorded subject", () => {
    // A warning that fires when it shouldn't gets ignored when it should.
    expect(stalenessNotice(undefined, mumbai)).toBeNull();
  });
});

describe("the agent card", () => {
  afterEach(() => {
    cleanup();
    vi.resetModules();
    vi.doUnmock("../../src/stores/aiStore");
    vi.doUnmock("../../src/stores/locationStore");
  });

  const HYDERABAD = { name: "Hyderabad", displayName: "Hyderabad, Telangana", lat: 17.385, lon: 78.4867 };
  const MUMBAI = { name: "Mumbai", displayName: "Mumbai, Maharashtra", lat: 19.076, lon: 72.8777 };

  async function renderCard(opts: { location: unknown; run: unknown }) {
    vi.doMock("../../src/stores/locationStore", () => ({
      useLocationStore: Object.assign(
        (selector: (s: unknown) => unknown) => selector({ selectedLocation: opts.location }),
        { getState: () => ({ selectedLocation: opts.location }) }
      ),
    }));
    vi.doMock("../../src/stores/aiStore", () => ({
      useAiStore: (selector: (s: unknown) => unknown) =>
        selector({ agentRuns: { gis: opts.run }, setAgentRun: () => {} }),
    }));
    const { AgentCard } = await import("../../src/features/ai/AgentCard");
    return render(
      <AgentCard
        definition={{ kind: "gis", label: "GIS Intelligence", icon: "🗺️", description: "Explains the evidence." }}
        context={{}}
      />
    );
  }

  const answer = (subject: ReturnType<typeof agentSubject>) => ({
    status: "done",
    subject,
    result: {
      kind: "gis",
      summary: "Dense retail evidence within 500m.",
      sources: [],
      generatedAt: new Date().toISOString(),
      model: "meta-llama/llama-3.3-70b-instruct:free",
    },
  });

  it("warns when the answer is about somewhere you have since left", async () => {
    await renderCard({ location: MUMBAI, run: answer(agentSubject(HYDERABAD)) });

    // The answer is kept - you may still want to read it - but it can no
    // longer pass itself off as a description of what is on screen.
    expect(screen.getByText(/Dense retail evidence/)).toBeTruthy();
    expect(screen.getByText(/This answer is about Hyderabad, not Mumbai\./)).toBeTruthy();
  });

  it("offers the fix rather than just complaining", async () => {
    /*
      And the label must not carry the place name. It did at first, and a
      real Indian place name ("Chhatrapati Shivaji Maharaj International
      Airport") truncated it to "Run for Chhatra…" in a 160px card - checked
      in a browser, not guessed at. The notice above already names the place.
    */
    await renderCard({ location: MUMBAI, run: answer(agentSubject(HYDERABAD)) });
    const button = screen.getByRole("button", { name: "Run for this place" });
    expect(button.textContent).not.toContain("Mumbai");
  });

  it("stays quiet when the answer is about the place you're looking at", async () => {
    await renderCard({ location: HYDERABAD, run: answer(agentSubject(HYDERABAD)) });
    expect(screen.queryByText(/This answer is about/)).toBeNull();
    expect(screen.getByRole("button", { name: "Run again" })).toBeTruthy();
  });

  it("spends no provider request when there is nothing to analyse", async () => {
    /*
      With nothing selected, the data block every agent reads is the single
      line "No location is currently selected in the app." - so the button
      used to spend one of 15 requests a minute, shared across all six cards
      and Ask maNOWj, to be told what the card can say for free.
    */
    await renderCard({ location: null, run: { status: "idle" } });
    expect(screen.queryByRole("button", { name: "Run" })).toBeNull();
    expect(screen.getByText(/Pick a place on the map first/)).toBeTruthy();
  });

  it("still offers Run as soon as a place is selected", async () => {
    await renderCard({ location: HYDERABAD, run: { status: "idle" } });
    const button = screen.getByRole("button", { name: "Run" });
    expect(button).toBeTruthy();
    // And it is actually clickable, not a disabled lookalike.
    expect((button as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(button);
  });
});
