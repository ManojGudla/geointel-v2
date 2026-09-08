import { describe, expect, it } from "vitest";
import { formatAiText } from "../../src/lib/formatAiText";

// Regression coverage for a real, screenshotted bug: OpenRouter's free tier
// randomly routes across many underlying models, and several of them ignored
// the system prompt's "no markdown, no reasoning trace" instruction and sent
// raw "**bold**", bulleted lists, and a leaked "Here's a thinking process..."
// preamble straight into the plain-text <p> the app renders. This is the
// client-side safety net that cleans that up regardless of what the model
// actually sent.
describe("formatAiText", () => {
  it("strips bold/italic markdown emphasis", () => {
    expect(formatAiText("This shows **7 petrol** stations and *5 parks* nearby.")).toBe("This shows 7 petrol stations and 5 parks nearby.");
  });

  it("strips bullet list markers and joins into flowing text", () => {
    const raw = "Here's what's nearby:\n- 7 petrol stations\n- 5 parks\n- 4 hotels";
    const result = formatAiText(raw);
    expect(result).not.toContain("- ");
    expect(result).toContain("7 petrol stations");
    expect(result).toContain("5 parks");
  });

  it("strips numbered list markers", () => {
    const raw = "1. Analyze user input\n2. Focus on the data\n3. Give the answer";
    const result = formatAiText(raw);
    expect(result).not.toMatch(/\d\.\s/);
  });

  it("strips markdown headers", () => {
    expect(formatAiText("### Property Summary\nThis is commercial.")).toBe("Property Summary This is commercial.");
  });

  it("strips a leaked reasoning preamble", () => {
    const raw = "Here's a thinking process: 1. Analyze User Input - User says: 'Run the search agent.' I need to act as the agent. The area shows commercial evidence.";
    const result = formatAiText(raw);
    expect(result.toLowerCase()).not.toContain("thinking process");
    expect(result).toContain("commercial evidence");
  });

  it("leaves already-clean plain text unchanged (aside from whitespace normalization)", () => {
    const clean = "This area shows mostly commercial evidence with 7 petrol stations and 5 parks nearby.";
    expect(formatAiText(clean)).toBe(clean);
  });
});
