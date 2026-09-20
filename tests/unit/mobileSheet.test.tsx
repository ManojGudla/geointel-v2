import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, cleanup, fireEvent, screen } from "@testing-library/react";
import {
  DETENTS,
  DETENT_FRACTION,
  DISMISS_FRACTION,
  clampFraction,
  cycleDetent,
  fractionAfterDrag,
  lowerDetent,
  nearestDetent,
  raiseDetent,
  settle,
  shouldDismiss,
} from "../../src/features/shell/sheet";
import { useIsSheetLayout, useSheet } from "../../src/features/shell/useSheet";

/**
 * The mobile workspace panel.
 *
 * What this replaces was one line of CSS - `position: absolute; inset: 0` -
 * and it made the panel a full-screen overlay on every phone. Tapping
 * "Layers" on a map application hid the map completely, which is the most
 * plausible explanation anyone has offered for the report that people open
 * this on a phone and cannot tell what it does.
 *
 * So the property worth defending here is not "the sheet animates nicely".
 * It is: THE MAP IS NEVER FULLY COVERED. Every test below either checks that
 * directly or checks a piece of maths that, if wrong, would let it happen
 * again - a sign flip in the drag, a detent that snaps to the wrong place, a
 * dismissal threshold that swallows a deliberate drag.
 */

afterEach(cleanup);

/*
  jsdom does not implement PointerEvent. Without this, fireEvent falls back to
  a plain Event, `clientY` never reaches the handler, and every drag test
  below would pass or fail for reasons having nothing to do with the sheet -
  the worst kind of test, one that is green because it measured nothing.
  MouseEvent carries the coordinates the handlers actually read.
*/
if (typeof window.PointerEvent === "undefined") {
  class PointerEventPolyfill extends MouseEvent {
    readonly pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
    }
  }
  window.PointerEvent = PointerEventPolyfill as unknown as typeof window.PointerEvent;
}

describe("where the sheet is allowed to rest", () => {
  it("never lets any detent cover the whole column", () => {
    // The point of the whole feature. If this ever passes 1 the sheet has
    // become the full-screen overlay it was built to replace.
    for (const detent of DETENTS) {
      expect(DETENT_FRACTION[detent], detent).toBeLessThan(1);
      expect(DETENT_FRACTION[detent], detent).toBeGreaterThan(0);
    }
  });

  it("leaves a visible strip of map even at full height", () => {
    // Not merely "less than 1" - enough that a person can SEE the map is
    // still behind it, which is what tells them the panel is a layer over
    // the map rather than a different screen.
    expect(1 - DETENT_FRACTION.full).toBeGreaterThanOrEqual(0.05);
  });

  it("orders the detents low to high", () => {
    expect(DETENT_FRACTION.peek).toBeLessThan(DETENT_FRACTION.half);
    expect(DETENT_FRACTION.half).toBeLessThan(DETENT_FRACTION.full);
  });

  it("keeps the dismissal threshold clear of the lowest detent", () => {
    /*
      If these two crowd each other, letting go near the bottom becomes a
      coin toss between "rest at peek" and "close the panel". Closing
      something the user meant to keep is far more annoying than making them
      flick down once more, so there has to be real daylight between them.
    */
    expect(DISMISS_FRACTION).toBeLessThan(DETENT_FRACTION.peek);
    expect(DETENT_FRACTION.peek - DISMISS_FRACTION).toBeGreaterThan(0.1);
  });
});

describe("snapping a released drag", () => {
  it("snaps to whichever detent is nearest", () => {
    expect(nearestDetent(DETENT_FRACTION.peek)).toBe("peek");
    expect(nearestDetent(DETENT_FRACTION.half)).toBe("half");
    expect(nearestDetent(DETENT_FRACTION.full)).toBe("full");
    expect(nearestDetent(0.36)).toBe("peek");
    expect(nearestDetent(0.9)).toBe("full");
  });

  it("treats a drag most of the way down as closing it", () => {
    expect(shouldDismiss(0.05)).toBe(true);
    expect(settle(0.05)).toEqual({ dismiss: true });
  });

  it("does not close a drag that merely lands low", () => {
    // 0.25 is below peek but above the threshold: the user pulled it down
    // but not off. It settles at the bottom detent and stays open.
    expect(settle(0.25)).toEqual({ dismiss: false, detent: "peek" });
  });

  it("never returns a detent that covers the column", () => {
    for (let f = 0; f <= 1.5; f += 0.02) {
      const outcome = settle(f);
      if (!outcome.dismiss) expect(DETENT_FRACTION[outcome.detent]).toBeLessThan(1);
    }
  });
});

describe("turning a finger movement into a height", () => {
  it("shrinks the sheet when the finger moves DOWN", () => {
    /*
      The sign flip. Screen Y grows downward, sheet height grows upward, and
      getting this backwards produces a sheet that grows when you push it
      away - which is wrong in a good half of the hand-rolled sheets on the
      web. Worth a test of its own precisely because it looks obvious.
    */
    const after = fractionAfterDrag(0.62, 200, 800);
    expect(after).toBeLessThan(0.62);
    expect(after).toBeCloseTo(0.37, 5);
  });

  it("grows the sheet when the finger moves UP", () => {
    expect(fractionAfterDrag(0.34, -200, 800)).toBeCloseTo(0.59, 5);
  });

  it("cannot be dragged taller than the tallest detent", () => {
    expect(fractionAfterDrag(0.94, -5000, 800)).toBe(DETENT_FRACTION.full);
  });

  it("cannot be dragged past the bottom", () => {
    expect(fractionAfterDrag(0.34, 5000, 800)).toBe(0);
  });

  it("survives a column of zero height rather than dividing by it", () => {
    // Happens for one frame on mount, before layout.
    expect(fractionAfterDrag(0.62, 100, 0)).toBe(0.62);
    expect(clampFraction(Number.NaN)).toBe(DETENT_FRACTION.half);
  });
});

describe("stepping between detents", () => {
  it("wraps when tapped, so one control reaches every height", () => {
    expect(cycleDetent("peek")).toBe("half");
    expect(cycleDetent("half")).toBe("full");
    expect(cycleDetent("full")).toBe("peek");
  });

  it("clamps rather than wraps for the arrow keys", () => {
    // Arrowing up at the top should do nothing, not jump to the bottom.
    expect(raiseDetent("full")).toBe("full");
    expect(lowerDetent("peek")).toBe("peek");
    expect(raiseDetent("peek")).toBe("half");
    expect(lowerDetent("full")).toBe("half");
  });
});

/* ── The hook, driven through a minimal harness ─────────────────────────── */

function mockViewport(isNarrow: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: query.includes("max-width: 900px") ? isNarrow : !isNarrow,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

function Harness({ onDismiss }: { onDismiss: () => void }) {
  const isSheet = useIsSheetLayout();
  const sheet = useSheet(isSheet, onDismiss);
  return (
    <aside
      ref={sheet.sheetRef}
      data-testid="sheet"
      data-detent={sheet.detent}
      data-dragging={String(sheet.dragging)}
      style={sheet.fraction === null ? undefined : { height: `${(sheet.fraction * 100).toFixed(2)}%` }}
    >
      <button type="button" data-testid="grip" {...sheet.gripProps}>
        grip
      </button>
    </aside>
  );
}

describe("the sheet on a narrow screen", () => {
  beforeEach(() => mockViewport(true));

  it("opens at a height that shows the map and the panel at once", () => {
    render(<Harness onDismiss={() => {}} />);
    const sheet = screen.getByTestId("sheet");
    expect(sheet.dataset.detent).toBe("half");
    // Explicitly not 100%: the map is still there above it.
    const height = Number.parseFloat(sheet.style.height);
    expect(height).toBeGreaterThan(0);
    expect(height).toBeLessThan(100);
  });

  it("cycles through every height when the grip is tapped", () => {
    render(<Harness onDismiss={() => {}} />);
    const sheet = screen.getByTestId("sheet");
    const grip = screen.getByTestId("grip");

    fireEvent.click(grip);
    expect(sheet.dataset.detent).toBe("full");
    fireEvent.click(grip);
    expect(sheet.dataset.detent).toBe("peek");
    fireEvent.click(grip);
    expect(sheet.dataset.detent).toBe("half");
  });

  it("resizes from the keyboard as well as from a finger", () => {
    render(<Harness onDismiss={() => {}} />);
    const sheet = screen.getByTestId("sheet");
    const grip = screen.getByTestId("grip");

    fireEvent.keyDown(grip, { key: "ArrowUp" });
    expect(sheet.dataset.detent).toBe("full");
    fireEvent.keyDown(grip, { key: "ArrowDown" });
    expect(sheet.dataset.detent).toBe("half");
  });

  it("closes when arrowed down off the bottom detent", () => {
    const onDismiss = vi.fn();
    render(<Harness onDismiss={onDismiss} />);
    const grip = screen.getByTestId("grip");

    fireEvent.keyDown(grip, { key: "ArrowDown" }); // half -> peek
    expect(onDismiss).not.toHaveBeenCalled();
    fireEvent.keyDown(grip, { key: "ArrowDown" }); // peek -> closed
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("settles at a lower detent after being dragged down", () => {
    render(<Harness onDismiss={() => {}} />);
    const sheet = screen.getByTestId("sheet");
    const grip = screen.getByTestId("grip");

    // jsdom reports no layout, so the hook falls back to window.innerHeight
    // (768 by default). 300px down from "half" lands near "peek".
    fireEvent.pointerDown(grip, { clientY: 100, pointerId: 1 });
    expect(sheet.dataset.dragging).toBe("true");
    fireEvent.pointerMove(grip, { clientY: 400, pointerId: 1 });
    fireEvent.pointerUp(grip, { clientY: 400, pointerId: 1 });

    expect(sheet.dataset.dragging).toBe("false");
    expect(sheet.dataset.detent).toBe("peek");
  });

  it("closes when dragged most of the way down", () => {
    const onDismiss = vi.fn();
    render(<Harness onDismiss={onDismiss} />);
    const grip = screen.getByTestId("grip");

    fireEvent.pointerDown(grip, { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(grip, { clientY: 560, pointerId: 1 });
    fireEvent.pointerUp(grip, { clientY: 560, pointerId: 1 });

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("does not read a tap as a drag to almost the same place", () => {
    // pointerup lands a pixel or two from pointerdown on every real tap. If
    // that settled, it would fight the click handler that cycles.
    const onDismiss = vi.fn();
    render(<Harness onDismiss={onDismiss} />);
    const sheet = screen.getByTestId("sheet");
    const grip = screen.getByTestId("grip");

    fireEvent.pointerDown(grip, { clientY: 300, pointerId: 1 });
    fireEvent.pointerUp(grip, { clientY: 302, pointerId: 1 });

    expect(sheet.dataset.detent).toBe("half");
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("abandons a cancelled drag without resizing or closing", () => {
    const onDismiss = vi.fn();
    render(<Harness onDismiss={onDismiss} />);
    const sheet = screen.getByTestId("sheet");
    const grip = screen.getByTestId("grip");

    fireEvent.pointerDown(grip, { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(grip, { clientY: 600, pointerId: 1 });
    fireEvent.pointerCancel(grip, { clientY: 600, pointerId: 1 });

    expect(sheet.dataset.detent).toBe("half");
    expect(onDismiss).not.toHaveBeenCalled();
  });
});

describe("the panel on a wide screen", () => {
  beforeEach(() => mockViewport(false));

  it("sets no inline height, so the stylesheet's fixed column wins", () => {
    render(<Harness onDismiss={() => {}} />);
    expect(screen.getByTestId("sheet").style.height).toBe("");
  });

  it("ignores the grip entirely", () => {
    const onDismiss = vi.fn();
    render(<Harness onDismiss={onDismiss} />);
    const sheet = screen.getByTestId("sheet");

    fireEvent.click(screen.getByTestId("grip"));
    fireEvent.keyDown(screen.getByTestId("grip"), { key: "ArrowDown" });

    expect(sheet.dataset.detent).toBe("half");
    expect(sheet.style.height).toBe("");
    expect(onDismiss).not.toHaveBeenCalled();
  });
});

/* ── Guards on the stylesheets themselves ───────────────────────────────── */

describe("the stylesheet", () => {
  /*
    Comments are stripped before any of this is asserted. These files explain
    themselves at length, and several of those explanations quote the very
    declarations being guarded against - so a guard reading the raw text finds
    the thing it is banning inside the note explaining why it is banned.
  */
  const read = (...parts: string[]) =>
    readFileSync(join(process.cwd(), ...parts), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

  const sidePanel = read("src", "features", "shell", "SidePanel.css");
  const workspace = read("src", "features", "workspace", "Workspace.css");

  it("no longer makes the panel a full-screen overlay", () => {
    /*
      The regression this whole feature exists to prevent. `inset: 0` on a
      phone is what hid the map, and it is a one-line change for someone to
      put back while "simplifying" the media query.
    */
    expect(sidePanel).not.toMatch(/inset:\s*0/);
  });

  it("anchors the sheet to the bottom edge", () => {
    expect(sidePanel).toMatch(/bottom:\s*0/);
    expect(sidePanel).toMatch(/top:\s*auto/);
  });

  it("gives the grip a 44px target around its 4px bar", () => {
    // The bar is what people aim at; the target is what they hit.
    expect(sidePanel).toMatch(/\.side-panel__grip\s*\{[^}]*height:\s*44px/s);
  });

  it("stops the browser stealing the drag gesture for a scroll", () => {
    expect(sidePanel).toMatch(/touch-action:\s*none/);
  });

  it("does not animate for someone who asked it not to", () => {
    expect(sidePanel).toMatch(/prefers-reduced-motion/);
  });

  it("gets everything anchored to the bottom edge out of the sheet's way", () => {
    /*
      All four of these are positioned against the stage's bottom, which is
      precisely where the sheet rises from. Measured in a browser at 390px,
      the getting-started card was the visible one: it sits at z-index 12
      against the sheet's 18, so it showed as the top inch of a second panel
      poking out above the first.
    */
    expect(workspace).toMatch(/\.workspace__stage--sheeted/);
    for (const overlay of ["coordinate-readout", "basemap-switcher", "copilot-launcher", "onboarding"]) {
      expect(workspace, overlay).toMatch(new RegExp(`--sheeted\\s+\\.${overlay}`));
    }
  });
});
