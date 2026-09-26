import { describe, expect, it } from "vitest";
import { describeAiFailure } from "../../src/features/ai/aiErrors";
import { ApiUnavailableError } from "../../src/services/apiClient";

/**
 * Every AI failure used to read "ran into an unexpected problem". Offline, a
 * slow free model and a dropped connection each have a different fix.
 */
describe("describeAiFailure", () => {
  it("names offline first, whatever the error", () => {
    expect(describeAiFailure(new Error("anything"), false)).toMatch(/you're offline/i);
  });

  it("passes the server's own explanation through", () => {
    expect(describeAiFailure(new ApiUnavailableError("Too many AI requests. Please slow down.", "RATE_LIMITED"), true)).toBe(
      "Too many AI requests. Please slow down."
    );
  });

  it("explains a timeout as slowness, not breakage", () => {
    expect(describeAiFailure(new Error("/api/ai/copilot timed out after 35s. Check your connection and try again."), true)).toMatch(/too long/i);
  });

  it("explains an unreachable server as a connection problem", () => {
    expect(describeAiFailure(new Error("Could not reach /api/ai/copilot. Check your connection and try again."), true)).toMatch(/check your connection/i);
  });

  it("never says 'unexpected problem'", () => {
    for (const e of [new Error("x"), "string", null, new TypeError("boom")]) {
      expect(describeAiFailure(e, true)).not.toMatch(/unexpected problem/i);
    }
  });
});
