import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AgentEvidence } from "../../src/features/ai/AgentEvidence";
import type { AgentResult } from "../../src/types/ai";

const RESULT: AgentResult = {
  kind: "travel",
  summary: "It is 31 °C now. There are 2 hospitals and clinics within 1 km. This suggests a comfortable, well-served spot.",
  findings: [
    { text: "It is 31 °C now.", evidenceIds: ["E2"] },
    { text: "There are 2 hospitals and clinics within 1 km.", evidenceIds: ["E3"] },
    { text: "This suggests a comfortable, well-served spot.", evidenceIds: [] },
  ],
  evidence: [
    { id: "E1", label: "Place name", value: "Banjara Hills", kind: "retrieved", source: "OpenStreetMap Nominatim", retrievedAt: "2026-11-25T07:30:00.000Z" },
    { id: "E2", label: "Temperature now", value: "31 °C", kind: "retrieved", source: "Open-Meteo", retrievedAt: "2026-11-25T07:30:00.000Z" },
    { id: "E3", label: "Hospitals and clinics within 1 km", value: "2 (closest: Care Clinic, 350 m)", kind: "retrieved", source: "OpenStreetMap via Overpass", retrievedAt: "2026-11-25T07:30:00.000Z" },
    { id: "E4", label: "Population", value: "Unavailable", kind: "unavailable", source: "Wikidata", note: "It did not answer within 8 seconds." },
  ],
  confidence: { level: "medium", reason: "Population sources did not answer." },
  steps: [
    { step: "Reading current weather (Open-Meteo)", status: "ok", ms: 420 },
    { step: "Looking up population (Wikidata)", status: "failed", ms: 8000 },
    { step: "Checking every number against the evidence", status: "partial", ms: 0 },
  ],
  removedSentences: 1,
  sources: ["Open-Meteo"],
  generatedAt: "2026-11-25T07:31:00.000Z",
  model: "test-model",
};

describe("an agent answer, laid out by what each part is", () => {
  afterEach(cleanup);

  it("says how confident it is, and why, before the answer", () => {
    render(<AgentEvidence result={RESULT} />);
    expect(screen.getByText("Confidence: Medium.")).toBeTruthy();
    expect(screen.getByText(/Population sources did not answer\./)).toBeTruthy();
  });

  it("labels the sentences as the AI's interpretation", () => {
    render(<AgentEvidence result={RESULT} />);
    expect(screen.getByText("AI interpretation of the evidence")).toBeTruthy();
  });

  it("puts a chip on each sentence naming the evidence it rests on", () => {
    render(<AgentEvidence result={RESULT} />);
    expect(screen.getByRole("button", { name: "Show evidence E2" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Show evidence E3" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Show evidence E1" })).toBeNull();
  });

  it("opens the evidence at the item a chip names", () => {
    const { container } = render(<AgentEvidence result={RESULT} />);
    const details = container.querySelector("details") as HTMLDetailsElement;
    expect(details.open).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Show evidence E3" }));
    expect(details.open).toBe(true);
    expect(container.querySelector(".is-highlighted")!.textContent).toContain("Hospitals and clinics within 1 km");
  });

  it("marks every item as verified data, computed or unavailable, with its source", () => {
    const { container } = render(<AgentEvidence result={RESULT} />);
    const items = [...container.querySelectorAll(".agent-evidence__item")].map((li) => li.textContent);
    expect(items[1]).toContain("Verified data · Open-Meteo · as of");
    expect(items[3]).toContain("Unavailable · Wikidata");
    expect(items[3]).toContain("It did not answer within 8 seconds.");
  });

  it("says when a sentence was removed for an unsupported number", () => {
    render(<AgentEvidence result={RESULT} />);
    expect(screen.getByText("1 sentence was removed because it used a number that is not in the evidence.")).toBeTruthy();
  });

  it("lists the real steps, with their outcome and time", () => {
    const { container } = render(<AgentEvidence result={RESULT} />);
    const steps = [...container.querySelectorAll(".agent-evidence__step")].map((li) => li.textContent);
    expect(steps).toEqual([
      "Reading current weather (Open-Meteo): done, 420 ms",
      "Looking up population (Wikidata): failed, 8.0 s",
      "Checking every number against the evidence: partly done",
    ]);
  });
});

describe("a Copilot answer with the facts behind it", () => {
  beforeEach(() => {
    // jsdom has no matchMedia; the answer asks it whether to animate.
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })));
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("offers the evidence on request, and says when a sentence was removed", async () => {
    const { ChatAnswer } = await import("../../src/features/ai/ChatAnswer");
    render(<ChatAnswer text="It is 31 °C now." sources={["Open-Meteo"]} evidence={RESULT.evidence} removedSentences={1} animate={false} />);
    expect(screen.getByText("1 sentence was removed because it used a number that is not in the evidence.")).toBeTruthy();
    expect(screen.queryByText("Temperature now")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "☰ Evidence (4)" }));
    expect(screen.getByText("Temperature now")).toBeTruthy();
    expect(screen.getByText("It did not answer within 8 seconds.")).toBeTruthy();
  });

  it("shows no evidence button for an answer that used none", async () => {
    const { ChatAnswer } = await import("../../src/features/ai/ChatAnswer");
    render(<ChatAnswer text="Manoj Kumar Gudla built it." sources={[]} animate={false} />);
    expect(screen.queryByRole("button", { name: /Evidence/ })).toBeNull();
  });
});
