import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { parseWaybackConfig } from "../../api/_routes/imagery-versions";
import { waybackTileUrl, WAYBACK_HOST } from "../../src/features/timeline/wayback";
import { useTimelineStore } from "../../src/stores/timelineStore";

/**
 * Historical imagery was NASA's 250 m mosaic only: at street zoom a grey
 * smear. It now defaults to Esri's past versions of the satellite map, sharp
 * enough for buildings, with NASA kept as a choice.
 */

describe("parseWaybackConfig", () => {
  it("keeps only a numeric release and a date from the title, oldest first", () => {
    const raw = {
      "43291": { itemTitle: "Wayback 2026-10-29", itemURL: "x", extra: "dropped" },
      "10": { itemTitle: "Wayback 2014-02-20" },
      "999": { itemTitle: "Something else" },
      abc: { itemTitle: "Wayback 2020-01-01" },
      "12": { itemTitle: "Wayback 2014-02-20" },
      "13": { itemTitle: "Wayback 2020-13-45" },
      "14": null,
    };
    expect(parseWaybackConfig(raw)).toEqual([
      { release: 10, date: "2014-02-20" },
      { release: 43291, date: "2026-10-29" },
    ]);
  });

  it("reads Esri's real title format", () => {
    // Exactly as in Esri's published file, checked character by character.
    const raw = {
      "10": { itemTitle: "World Imagery (Wayback 2014-02-20)" },
      "43291": { itemTitle: "World Imagery (Wayback 2026-10-29)" },
    };
    expect(parseWaybackConfig(raw)).toEqual([
      { release: 10, date: "2014-02-20" },
      { release: 43291, date: "2026-10-29" },
    ]);
  });

  it("returns nothing for something that is not Esri's list", () => {
    expect(parseWaybackConfig(null)).toEqual([]);
    expect(parseWaybackConfig("nope")).toEqual([]);
  });
});

describe("waybackTileUrl", () => {
  it("builds Esri's tile address for a release", () => {
    expect(waybackTileUrl(43291)).toBe(
      `${WAYBACK_HOST}/arcgis/rest/services/World_Imagery/WMTS/1.0.0/default028mm/MapServer/tile/43291/{z}/{y}/{x}`
    );
  });
});

describe("security policy", () => {
  it("allows the Wayback tile host in production and development, and nothing wider", () => {
    const vercel = readFileSync("vercel.json", "utf8");
    const plugin = readFileSync("plugins/vite-plugin-api.ts", "utf8");
    expect(vercel.match(/wayback\.maptiles\.arcgis\.com/g)).toHaveLength(2);
    expect(plugin).toContain('"https://wayback.maptiles.arcgis.com"');
    expect(vercel).not.toContain("https://*.arcgis.com");
  });
});

vi.mock("../../src/features/timeline/wayback", async (orig) => ({
  ...(await orig<typeof import("../../src/features/timeline/wayback")>()),
  fetchWaybackVersions: vi.fn(async () => [
    { release: 10, date: "2014-02-20" },
    { release: 22252, date: "2026-01-29" },
    { release: 43291, date: "2026-10-29" },
  ]),
}));

import { TimelinePanel } from "../../src/features/timeline/TimelinePanel";

describe("<TimelinePanel> sharp history", () => {
  beforeEach(() => useTimelineStore.setState({ enabled: true, source: "sharp", release: null }));
  afterEach(cleanup);

  const renderPanel = () =>
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <TimelinePanel />
      </QueryClientProvider>
    );

  it("starts on the newest version and says what its date means", async () => {
    renderPanel();
    await waitFor(() => expect(useTimelineStore.getState().release).toBe(43291));
    expect(screen.getByText(/as it was published on 2026-10-29/)).toBeTruthy();
    expect(screen.getByText(/taken on or before that date/)).toBeTruthy();
  });

  it("steps back through versions with the slider", async () => {
    renderPanel();
    const slider = await screen.findByLabelText("Map version");
    fireEvent.change(slider, { target: { value: "0" } });
    expect(useTimelineStore.getState().release).toBe(10);
  });

  it("still offers NASA's daily imagery", async () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /NASA daily/ }));
    expect(useTimelineStore.getState().source).toBe("nasa");
  });
});
