import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { TeamResult } from "../../src/types/ai";

/** The team panel, with the request itself replaced (MOCK: no server, no model). */
const RESULT: TeamResult = {
  request: "Evaluate this place for a family home and plan a route to the nearest hospital",
  understood: "Asked to analyse what is mapped around the place, assess the property and route to the nearest hospital or clinic.",
  agents: ["gis", "property", "navigation"],
  sections: [
    { agent: "gis", summary: "Offices dominate.", findings: [{ text: "Offices dominate, with 14 mapped within 250 m.", evidenceIds: ["E3"] }], confidence: { level: "high", reason: "Every source this agent uses answered in full." } },
    { agent: "property", summary: "Insufficient verified data to provide a reliable conclusion.", findings: [], confidence: { level: "insufficient", reason: "Too little is mapped here to classify the property." } },
    { agent: "navigation", summary: "Care Clinic is 1.9 km by road.", findings: [{ text: "Care Clinic is 1.9 km by road.", evidenceIds: ["E5"] }], confidence: { level: "high", reason: "Every source this agent uses answered in full." } },
  ],
  evidence: [
    { id: "E3", label: "Mapped offices within 250 m", value: "14", kind: "retrieved", source: "OpenStreetMap via Overpass", retrievedAt: "2026-11-25T07:30:00.000Z" },
    { id: "E5", label: "Route distance", value: "1.9 km", kind: "retrieved", source: "OSRM", retrievedAt: "2026-11-25T07:30:00.000Z" },
  ],
  steps: [
    { step: "Understanding the request: 3 agents chosen", status: "ok", ms: 1 },
    { step: "Calculating the route (routing provider)", status: "ok", ms: 1200 },
    { step: "Writing the report (AI model, one request for all agents)", status: "ok", ms: 6400 },
  ],
  route: { name: "Care Clinic", lat: 17.452, lon: 78.379, mode: "car" },
  sources: ["OpenStreetMap via Overpass", "OSRM"],
  model: "test-model",
  generatedAt: "2026-11-25T07:31:00.000Z",
  removedSentences: 0,
};

const HITEC = { name: "HITEC City", displayName: "HITEC City, Hyderabad", lat: 17.4474, lon: 78.3762 };
const routeActions = { setFrom: vi.fn(), setMode: vi.fn(), openPanel: vi.fn() };

async function renderTeam(askAgentTeam: (...args: unknown[]) => Promise<TeamResult>) {
  vi.doMock("../../src/services/ai", () => ({ askAgentTeam }));
  vi.doMock("../../src/stores/locationStore", () => ({
    useLocationStore: (selector: (s: unknown) => unknown) => selector({ selectedLocation: HITEC, radiusMeters: 250 }),
  }));
  vi.doMock("../../src/stores/routeStore", () => ({
    useRouteStore: (selector: (s: unknown) => unknown) => selector({ from: null, to: null, mode: "car", ...routeActions }),
  }));
  const { AgentTeam } = await import("../../src/features/ai/AgentTeam");
  return render(<AgentTeam />);
}

describe("asking the agents together", () => {
  afterEach(() => {
    cleanup();
    vi.resetModules();
    vi.doUnmock("../../src/services/ai");
    vi.doUnmock("../../src/stores/locationStore");
    vi.doUnmock("../../src/stores/routeStore");
    vi.clearAllMocks();
  });

  it("sends the request with the selected place only", async () => {
    const ask = vi.fn(async () => RESULT);
    await renderTeam(ask);
    fireEvent.change(screen.getByLabelText("What should the agents do?"), { target: { value: "Is this good for a family?" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    await waitFor(() => expect(ask).toHaveBeenCalled());
    expect(ask.mock.calls[0]).toEqual(["Is this good for a family?", { lat: 17.4474, lon: 78.3762, radiusMeters: 250 }]);
  });

  it("says only that it is working while it works: no staged steps", async () => {
    let finish: (r: TeamResult) => void = () => {};
    await renderTeam(() => new Promise<TeamResult>((resolve) => (finish = resolve)));
    fireEvent.click(screen.getByRole("button", { name: "Plan a day around here" }));
    expect(await screen.findByRole("status")).toBeTruthy();
    expect(screen.queryByText("What the agents did")).toBeNull();
    finish(RESULT);
    expect(await screen.findByText("What the agents did")).toBeTruthy();
  });

  it("shows what was understood, which agents took part, and the real steps with times", async () => {
    await renderTeam(async () => RESULT);
    fireEvent.click(screen.getByRole("button", { name: "Analyse the area within 1 km of here" }));
    expect(await screen.findByText(RESULT.understood)).toBeTruthy();
    const agents = screen.getByRole("list", { name: "Agents involved" });
    expect(agents.textContent).toContain("GIS Intelligence");
    expect(agents.textContent).toContain("Navigation");
    expect(screen.getByText("Writing the report (AI model, one request for all agents): done, 6.4 s")).toBeTruthy();
  });

  it("names the agent and its confidence on every section, including the one with too little data", async () => {
    await renderTeam(async () => RESULT);
    fireEvent.click(screen.getByRole("button", { name: "Analyse the area within 1 km of here" }));
    const sections = await screen.findAllByRole("article");
    expect(sections).toHaveLength(3);
    expect(sections[1]!.textContent).toContain("Property Intelligence");
    expect(sections[1]!.textContent).toContain("Confidence: Not enough data.");
    expect(sections[1]!.textContent).toContain("Insufficient verified data to provide a reliable conclusion.");
  });

  it("draws the route it found in the Directions panel", async () => {
    await renderTeam(async () => RESULT);
    fireEvent.click(screen.getByRole("button", { name: "Analyse the area within 1 km of here" }));
    fireEvent.click(await screen.findByRole("button", { name: "Show the route to Care Clinic on the map" }));
    expect(routeActions.setFrom).toHaveBeenCalledWith(HITEC);
    expect(routeActions.setMode).toHaveBeenCalledWith("car");
    expect(routeActions.openPanel).toHaveBeenCalledWith({ lat: 17.452, lon: 78.379, name: "Care Clinic", displayName: "Care Clinic" });
  });

  it("opens the evidence at the item a citation names", async () => {
    const { container } = await renderTeam(async () => RESULT);
    fireEvent.click(screen.getByRole("button", { name: "Analyse the area within 1 km of here" }));
    fireEvent.click(await screen.findByRole("button", { name: "Show evidence E5" }));
    expect(container.querySelector(".is-highlighted")!.textContent).toContain("Route distance");
  });
});
