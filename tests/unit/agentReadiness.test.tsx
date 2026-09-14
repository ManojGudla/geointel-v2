import { describe, expect, it, vi, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { AGENT_NEEDS, readinessNotice, waitingFor } from "../../src/features/ai/agentReadiness";
import type { ContextPending } from "../../src/features/ai/useCopilotContext";
import { AGENT_DEFINITIONS } from "../../src/types/ai";

/**
 * Observed on the live site, not imagined.
 *
 * The GIS agent was run on Banjara Hills and answered: "The data provided
 * only contains the location address and current weather, with no GIS
 * evidence counts, POI categories, or built-environment scores available to
 * analyze." Beside it, the map read "161 things mapped within 250 m" and was
 * covered in evidence dots — driven by the very same query that feeds the
 * agent's context.
 *
 * Nothing had failed. Weather comes from Open-Meteo and arrives in a moment;
 * GIS evidence comes from Overpass and takes seconds. The agent was asked in
 * the gap, was handed a half-empty context, and reported honestly on it —
 * the guardrail working exactly as designed. The bug is that it was asked at
 * all, and that its answer then sat on the card permanently, describing a
 * gap that had closed two seconds later.
 */

const READY: ContextPending = { gis: false, weather: false, nearby: false, route: false, officials: false };

describe("what each agent waits for", () => {
  it("covers every agent, so a new one can't be added without a decision", () => {
    for (const def of AGENT_DEFINITIONS) {
      expect(AGENT_NEEDS[def.kind], def.kind).toBeDefined();
    }
    expect(Object.keys(AGENT_NEEDS).sort()).toEqual(AGENT_DEFINITIONS.map((d) => d.kind).sort());
  });

  it("holds the GIS agent back until the evidence is in", () => {
    expect(waitingFor("gis", { ...READY, gis: true })).toEqual(["gis"]);
    expect(readinessNotice("gis", { ...READY, gis: true })).toBe("Loading the map evidence…");
  });

  it("holds the property agent back too, since it reads the same evidence", () => {
    // analyzeProperty() is computed from the GIS counts — no evidence means
    // no classification to explain.
    expect(readinessNotice("property", { ...READY, gis: true })).not.toBeNull();
  });

  it("does not make an agent wait for a source it never reads", () => {
    /*
      The reason this is per-agent rather than "wait for everything": one
      slow dependency — officials, from Wikidata — must not be able to block
      an agent that has no use for it.
    */
    const officialsSlow: ContextPending = { ...READY, officials: true };
    for (const def of AGENT_DEFINITIONS) {
      expect(readinessNotice(def.kind, officialsSlow), def.kind).toBeNull();
    }
  });

  it("lets every agent through once its sources have landed", () => {
    for (const def of AGENT_DEFINITIONS) {
      expect(readinessNotice(def.kind, READY), def.kind).toBeNull();
    }
  });

  it("names what it is waiting for, in readable English", () => {
    // "Loading…" with no subject is indistinguishable from a broken card.
    expect(readinessNotice("travel", { ...READY, weather: true, nearby: true })).toBe(
      "Loading the weather and nearby places…"
    );
    expect(readinessNotice("travel", { ...READY, nearby: true })).toBe("Loading nearby places…");
  });
});

describe("the agent card while its data is still arriving", () => {
  afterEach(() => {
    cleanup();
    vi.resetModules();
    vi.doUnmock("../../src/stores/aiStore");
    vi.doUnmock("../../src/stores/locationStore");
  });

  const HYDERABAD = { name: "Banjara Hills", displayName: "Banjara Hills, Hyderabad", lat: 17.4177, lon: 78.4399 };

  async function renderCard(pending: ContextPending, run: unknown = { status: "idle" }) {
    vi.doMock("../../src/stores/locationStore", () => ({
      useLocationStore: (selector: (s: unknown) => unknown) => selector({ selectedLocation: HYDERABAD }),
    }));
    vi.doMock("../../src/stores/aiStore", () => ({
      useAiStore: (selector: (s: unknown) => unknown) => selector({ agentRuns: { gis: run }, setAgentRun: () => {} }),
    }));
    const { AgentCard } = await import("../../src/features/ai/AgentCard");
    return render(
      <AgentCard
        definition={{ kind: "gis", label: "GIS Intelligence", icon: "🗺️", description: "Explains the evidence." }}
        context={{}}
        pending={pending}
      />
    );
  }

  it("offers no Run button while the evidence is still loading", async () => {
    await renderCard({ ...READY, gis: true });
    expect(screen.queryByRole("button", { name: "Run" })).toBeNull();
    expect(screen.getByText(/Loading the map evidence/)).toBeTruthy();
  });

  it("offers Run the moment the evidence lands", async () => {
    await renderCard(READY);
    expect(screen.getByRole("button", { name: "Run" })).toBeTruthy();
    expect(screen.queryByText(/Loading the map evidence/)).toBeNull();
  });

  it("will not let a finished card be re-run into the same gap", async () => {
    /*
      Changing the radius creates a new query key, so the evidence is
      genuinely absent again rather than merely refreshing — clicking "Run
      again" during that window would reproduce the original bug exactly.
    */
    await renderCard(
      { ...READY, gis: true },
      {
        status: "done",
        subject: { lat: HYDERABAD.lat, lon: HYDERABAD.lon, label: HYDERABAD.name },
        result: {
          kind: "gis",
          summary: "Dense retail evidence within 500m.",
          sources: [],
          generatedAt: new Date().toISOString(),
          model: "meta-llama/llama-3.3-70b-instruct:free",
        },
      }
    );
    const button = screen.getByRole("button", { name: /Loading the map evidence/ });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it("defaults to ready when no pending state is passed at all", async () => {
    // The prop is optional so no caller can accidentally freeze every card
    // by forgetting it.
    vi.doMock("../../src/stores/locationStore", () => ({
      useLocationStore: (selector: (s: unknown) => unknown) => selector({ selectedLocation: HYDERABAD }),
    }));
    vi.doMock("../../src/stores/aiStore", () => ({
      useAiStore: (selector: (s: unknown) => unknown) =>
        selector({ agentRuns: { gis: { status: "idle" } }, setAgentRun: () => {} }),
    }));
    const { AgentCard } = await import("../../src/features/ai/AgentCard");
    render(
      <AgentCard
        definition={{ kind: "gis", label: "GIS Intelligence", icon: "🗺️", description: "Explains the evidence." }}
        context={{}}
      />
    );
    expect(screen.getByRole("button", { name: "Run" })).toBeTruthy();
  });
});
