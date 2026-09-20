import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { PLAY_URL } from "../../src/features/play/share";

/**
 * Where a shared score sends people.
 *
 * A game result pasted into a chat is the only thing this product has that
 * spreads on its own - no ads, no audience, no budget - so the link inside it
 * is the whole acquisition channel. It was written inline in eight separate
 * files, and the copy that drifted was the one in share.ts: "https://manowj.com",
 * the bare domain. Until the apex was added to Vercel that host had no
 * certificate at all, so every result shared through RoundSummary opened on a
 * browser security warning.
 *
 * Nothing about that failed loudly. The game worked, the copy button worked,
 * the text looked right. It just quietly sent everyone who clicked it to a
 * page that told them the site was unsafe.
 */

const SRC = join(process.cwd(), "src");
const PLAY = join(SRC, "features", "play");

describe("the link inside a shared result", () => {
  it("is on the host the site actually serves from", () => {
    // Not the bare domain. It redirects now, but a redirect is a wasted round
    // trip on a link whose entire job is to be clicked by a stranger.
    expect(PLAY_URL).toBe("https://www.manowj.com");
  });

});

describe("the URL is written down once", () => {
  function files(dir: string, found: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) files(full, found);
      else if (/\.(ts|tsx)$/.test(entry)) found.push(full);
    }
    return found;
  }

  it("appears inline nowhere under features/play except share.ts", () => {
    /*
      The actual defect. Eight copies of one string is not a style problem -
      it is the mechanism by which one of them became wrong and stayed wrong,
      because nothing that reads the other seven tells you the eighth exists.
    */
    const offenders: string[] = [];
    for (const path of files(PLAY)) {
      const rel = relative(SRC, path).split(sep).join("/");
      if (rel === "features/play/share.ts") continue;
      const source = readFileSync(path, "utf8");
      if (/https?:\/\/(www\.)?manowj\.com/.test(source)) offenders.push(rel);
    }
    expect(offenders, offenders.join(", ")).toEqual([]);
  });
});

