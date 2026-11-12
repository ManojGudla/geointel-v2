import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "../..");

describe("the first-screen starter card", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
    // A returning visitor: the first-visit notice has already been seen.
    localStorage.setItem("geointel.freeNoticeSeen.v1", "1");
  });

  it("says what the app is for and offers places to try", async () => {
    const { StarterCard } = await import("../../src/features/workspace/StarterCard");
    render(<StarterCard />);
    expect(screen.getByRole("heading", { name: /check any address in seconds/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Gachibowli" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Koramangala" })).toBeTruthy();
  });

  it("selects the place and opens what is mapped around it when an example is tapped", async () => {
    vi.doMock("../../src/services/geocode", () => ({ reverseGeocode: () => Promise.reject(new Error("offline")) }));
    const { StarterCard } = await import("../../src/features/workspace/StarterCard");
    const { useLocationStore } = await import("../../src/stores/locationStore");
    const { useShellStore } = await import("../../src/stores/shellStore");
    const { useIntelTabStore } = await import("../../src/stores/intelTabStore");
    render(<StarterCard />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Gachibowli" }));
    });
    const selected = useLocationStore.getState().selectedLocation;
    expect(selected?.name).toBe("Gachibowli");
    expect(selected?.lat).toBeCloseTo(17.4401, 3);
    // Looks 1 km around it, so the example shows a neighbourhood's worth of places.
    expect(useLocationStore.getState().radiusMeters).toBe(1000);
    expect(useShellStore.getState().section).toBe("place");
    expect(useShellStore.getState().open).toBe(true);
    expect(useIntelTabStore.getState().tab).toBe("evidence");
    // With a place chosen the card has done its job and is gone.
    expect(screen.queryByRole("heading", { name: /check any address/i })).toBeNull();
    vi.doUnmock("../../src/services/geocode");
  });

  it("stays hidden for good once dismissed", async () => {
    const first = await import("../../src/features/workspace/StarterCard");
    const { unmount } = render(<first.StarterCard />);
    fireEvent.click(screen.getByRole("button", { name: "Hide this tip" }));
    expect(screen.queryByRole("heading", { name: /check any address/i })).toBeNull();
    unmount();
    vi.resetModules();
    const again = await import("../../src/features/workspace/StarterCard");
    render(<again.StarterCard />);
    expect(screen.queryByRole("heading", { name: /check any address/i })).toBeNull();
  });

  it("waits behind the first-visit notice instead of stacking on it", async () => {
    localStorage.removeItem("geointel.freeNoticeSeen.v1");
    const { StarterCard } = await import("../../src/features/workspace/StarterCard");
    render(<StarterCard />);
    expect(screen.queryByRole("heading", { name: /check any address/i })).toBeNull();
  });
});

describe("the founder's personal website link", () => {
  it("is off until a real https address is configured", async () => {
    const { httpsUrlOrNull } = await import("../../src/config/founder");
    expect(httpsUrlOrNull(undefined)).toBeNull();
    expect(httpsUrlOrNull("")).toBeNull();
    expect(httpsUrlOrNull("not a url")).toBeNull();
    expect(httpsUrlOrNull("http://example.com")).toBeNull();
    expect(httpsUrlOrNull("javascript:alert(1)")).toBeNull();
    expect(httpsUrlOrNull("https://example.com")).toBe("https://example.com/");
  });

  it("is shown in About, from one place, and can be replaced without a code change", async () => {
    const founder = fs.readFileSync(path.join(root, "src/config/founder.ts"), "utf8");
    // One default, overridable by the environment variable.
    expect(founder).toContain("VITE_FOUNDER_SITE_URL");
    expect(founder.match(/manoj-gudla-website\.vercel\.app/g)).toHaveLength(1);
    const { FOUNDER_SITE_URL } = await import("../../src/config/founder");
    expect(FOUNDER_SITE_URL).toMatch(/^https:\/\//);
    // The panel reads it from the config, never its own copy.
    expect(fs.readFileSync(path.join(root, "src/features/about/AboutPanel.tsx"), "utf8")).not.toMatch(/vercel\.app/);
  });

  it("keeps the temporary address out of what search engines store", () => {
    // Structured data is remembered for a long time; this address will change.
    expect(fs.readFileSync(path.join(root, "index.html"), "utf8")).not.toMatch(/manoj-gudla-website/);
  });
});
