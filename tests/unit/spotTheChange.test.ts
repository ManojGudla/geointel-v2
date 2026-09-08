import { describe, expect, it } from "vitest";
import { CHANGE_SITES } from "@/features/play/games/change/changeSites";
import {
  GRID,
  OPTIONS_PER_ROUND,
  ROUNDS_PER_GAME,
  buildChangeGame,
  changePoints,
  readableDate,
  tileForLatLon,
  tileGrid,
  yearsApart,
} from "@/features/play/games/change/changeEngine";
import { GIBS_EARLIEST, GIBS_LAYERS } from "@/features/timeline/gibs";

/**
 * Spot the Change.
 *
 * Two distinct risks here, and neither is caught by the game merely rendering.
 *
 * The first is factual. This game asserts things about real places, cites real
 * sources, and shows real imagery. A site whose dates fall outside what NASA
 * actually has, or whose "change" is invisible at 250 m, produces a round
 * where the player is right and the game says they are wrong.
 *
 * The second is that a question can give itself away. If the correct answer is
 * the only long option, or the only one that mentions water, the player learns
 * to pick on shape rather than look at the images — which is the entire game.
 */

describe("the change sites are real and checkable", () => {
  it("gives every site a source and an explanation", () => {
    const thin = CHANGE_SITES.filter((s) => s.source.trim().length < 8 || s.because.trim().length < 40);
    expect(thin.map((s) => s.id)).toEqual([]);
  });

  it("keeps both dates inside the imagery NASA actually holds", () => {
    // MODIS Terra starts 2000-02-24. A date before that returns blank tiles,
    // which looks to a player exactly like a broken game.
    const outside = CHANGE_SITES.filter((s) => s.before < GIBS_EARLIEST || s.after < GIBS_EARLIEST);
    expect(outside.map((s) => `${s.id} ${s.before}`)).toEqual([]);
  });

  it("always puts the two dates in the right order, with real time between them", () => {
    for (const site of CHANGE_SITES) {
      expect(site.before < site.after, `${site.id}: ${site.before} is not before ${site.after}`).toBe(true);
      /**
       * At least a year apart, or an explicit written reason why not.
       *
       * Under a year, a seasonal difference usually explains the picture
       * better than the change does, and the player is then marked wrong for
       * reading the image correctly. The Black Summer fires are the one
       * exception and they have to argue for themselves in the data file
       * rather than being waved through here.
       */
      const months = (new Date(site.after).getTime() - new Date(site.before).getTime()) / (30.4 * 24 * 3600 * 1000);
      if (months <= 12) {
        expect(site.shortIntervalBecause?.length ?? 0, `${site.id} is ${Math.round(months)} months apart with no reason given`).toBeGreaterThan(60);
      }
    }
  });

  it("has real coordinates and a zoom the layer actually publishes", () => {
    for (const site of CHANGE_SITES) {
      expect(Math.abs(site.lat), site.id).toBeLessThanOrEqual(85);
      expect(Math.abs(site.lon), site.id).toBeLessThanOrEqual(180);
      const layer = GIBS_LAYERS.find((l) => l.id === site.layer);
      expect(layer, `${site.id} names a layer that does not exist`).toBeTruthy();
      // Beyond a product's maxZoom the tiles 404 outright.
      expect(site.zoom, site.id).toBeLessThanOrEqual(layer!.maxZoom);
      expect(site.zoom, site.id).toBeGreaterThanOrEqual(4);
    }
  });

  it("has no duplicate ids and enough sites to fill a game without repeating", () => {
    expect(new Set(CHANGE_SITES.map((s) => s.id)).size).toBe(CHANGE_SITES.length);
    expect(CHANGE_SITES.length).toBeGreaterThanOrEqual(ROUNDS_PER_GAME + 4);
  });

  it("never lets a site's own distractors contain its answer", () => {
    const broken = CHANGE_SITES.filter((s) => s.distractors.includes(s.answer));
    expect(broken.map((s) => s.id)).toEqual([]);
  });
});

describe("a question cannot be answered without looking", () => {
  it("does not make the right answer the longest option every time", () => {
    /**
     * The classic tell. If the correct answer is reliably the wordiest one, a
     * player learns to pick the longest string and never looks at the imagery
     * again — and their score keeps going up, which is worse than the game
     * being hard.
     */
    let longest = 0;
    for (const site of CHANGE_SITES) {
      const all = [site.answer, ...site.distractors];
      const max = Math.max(...all.map((o) => o.length));
      if (site.answer.length === max) longest++;
    }
    expect(longest / CHANGE_SITES.length).toBeLessThan(0.6);
  });

  it("reuses each answer across several sites, so the wording is not a fingerprint", () => {
    // "A large lake almost completely dried up" is the answer at the Aral Sea,
    // Lake Urmia and Lake Poopó. A player who memorises one cannot use it to
    // shortcut the others, because the same phrase is right in three places
    // and wrong in the rest.
    const answers = CHANGE_SITES.map((s) => s.answer);
    const shared = answers.filter((a, i) => answers.indexOf(a) !== i);
    expect(shared.length).toBeGreaterThanOrEqual(2);
  });
});

describe("building a round", () => {
  it("deals the right number of rounds and options, with no repeated site", () => {
    const game = buildChangeGame("seed-a");
    expect(game).toHaveLength(ROUNDS_PER_GAME);
    expect(new Set(game.map((r) => r.site.id)).size).toBe(ROUNDS_PER_GAME);
    for (const round of game) {
      expect(round.options).toHaveLength(OPTIONS_PER_ROUND);
      expect(round.options).toContain(round.answer);
      expect(new Set(round.options).size).toBe(OPTIONS_PER_ROUND);
    }
  });

  it("does not park the answer in the same slot every round", () => {
    const positions = new Set<number>();
    for (let i = 0; i < 25; i++) {
      for (const round of buildChangeGame(`pos-${i}`)) {
        positions.add(round.options.indexOf(round.answer));
      }
    }
    expect(positions.size).toBe(OPTIONS_PER_ROUND);
  });

  it("is reproducible from its seed", () => {
    expect(buildChangeGame("same").map((r) => r.site.id)).toEqual(buildChangeGame("same").map((r) => r.site.id));
    expect(buildChangeGame("a").map((r) => r.site.id)).not.toEqual(buildChangeGame("b").map((r) => r.site.id));
  });
});

describe("the tile maths", () => {
  it("puts a known coordinate in the known tile", () => {
    // Greenwich at zoom 1 is the top-right quadrant of the world.
    expect(tileForLatLon(51.48, 0, 1)).toEqual({ x: 1, y: 0 });
    // Null Island at zoom 2 sits at the centre of the grid.
    expect(tileForLatLon(0, 0, 2)).toEqual({ x: 2, y: 2 });
  });

  it("stays inside the grid at the poles and across the date line", () => {
    for (const zoom of [4, 6, 8]) {
      const n = 2 ** zoom;
      for (const [lat, lon] of [[85, 179.9], [-85, -179.9], [0, 180]] as const) {
        const t = tileForLatLon(lat, lon, zoom);
        expect(t.x).toBeGreaterThanOrEqual(0);
        expect(t.x).toBeLessThan(n);
        expect(t.y).toBeGreaterThanOrEqual(0);
        expect(t.y).toBeLessThan(n);
      }
    }
  });

  it("builds a full square of real GIBS urls for every site", () => {
    for (const site of CHANGE_SITES) {
      const urls = tileGrid(site, site.before);
      expect(urls, site.id).toHaveLength(GRID * GRID);
      expect(new Set(urls).size, `${site.id} repeats a tile`).toBe(GRID * GRID);
      for (const url of urls) {
        expect(url.startsWith("https://gibs.earthdata.nasa.gov/"), url).toBe(true);
        expect(url).toContain(`/${site.before}/`);
        // No NaN or undefined anywhere in the path — the failure mode that
        // renders as nine broken images.
        expect(/NaN|undefined/.test(url), url).toBe(false);
      }
    }
  });
});

describe("scoring", () => {
  it("pays nothing for a wrong answer and never goes negative", () => {
    expect(changePoints(false, 1)).toBe(0);
    expect(changePoints(false, 500)).toBe(0);
    expect(changePoints(true, 9_999)).toBeGreaterThan(0);
  });

  it("rewards answering sooner", () => {
    expect(changePoints(true, 1)).toBeGreaterThan(changePoints(true, 10));
    expect(changePoints(true, 10)).toBeGreaterThan(changePoints(true, 19));
  });
});

describe("what the player reads", () => {
  it("writes dates the way a person says them", () => {
    expect(readableDate("2000-08-15")).toBe("August 2000");
    expect(readableDate("2022-02-01")).toBe("February 2022");
  });

  it("counts the years between two dates", () => {
    expect(yearsApart("2000-08-15", "2020-08-15")).toBe(20);
    expect(yearsApart("2020-07-15", "2022-09-15")).toBe(2);
  });
});
