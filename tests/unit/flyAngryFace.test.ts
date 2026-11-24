import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ANGRY_FACE_SRC, pickFlyerFace } from "../../src/features/play/games/fly/FlyManoj";

/**
 * Fly maNOWj: the founder's face flies, and when you crash it turns angry
 * (on the falling flyer and on the game-over card).
 */
const loaded = (name: string) => ({ complete: true, naturalWidth: 360, name }) as unknown as HTMLImageElement;
const loading = { complete: false, naturalWidth: 0 } as unknown as HTMLImageElement;

describe("Fly maNOWj faces", () => {
  it("flies the normal face and switches to the angry one on a crash", () => {
    const face = loaded("face");
    const angry = loaded("angry");
    expect(pickFlyerFace("ready", face, angry)).toEqual({ img: face, angry: false });
    expect(pickFlyerFace("playing", face, angry)).toEqual({ img: face, angry: false });
    expect(pickFlyerFace("dead", face, angry)).toEqual({ img: angry, angry: true });
  });

  it("keeps the normal face if the angry one has not loaded yet, and never draws a half-loaded image", () => {
    const face = loaded("face");
    expect(pickFlyerFace("dead", face, loading)).toEqual({ img: face, angry: false });
    expect(pickFlyerFace("playing", loading, null)).toEqual({ img: null, angry: false });
  });

  it("ships the angry face as a real 360x360 WebP at the path the game asks for", () => {
    const file = path.join(process.cwd(), "public", ANGRY_FACE_SRC);
    const bytes = fs.readFileSync(file);
    expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(bytes.subarray(8, 12).toString("ascii")).toBe("WEBP");
    // Small enough not to slow the game down.
    expect(bytes.length).toBeLessThan(40_000);
  });
});
