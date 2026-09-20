import { describe, expect, it, afterEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { render, cleanup, screen } from "@testing-library/react";
import { LazyPanel } from "../../src/components/LazyPanel";

/**
 * What the map page is allowed to download, and what a modal has to do.
 *
 * Measured in Chromium before this: opening the workspace pulled 1.55 MB of
 * JavaScript across nineteen files, including the entire 209 KB games hub,
 * the settings panel, the privacy panel, the printable report, the feedback
 * form, the team application form, the about panel and the feature status
 * page. Nobody opening a map asked for any of it.
 *
 * Every one of those was ALREADY `React.lazy`, which is exactly why the bug
 * survived so long - the chunks were split, so the code looked right. Lazy
 * splits a chunk; it does not decide when the chunk is fetched. The import
 * fires when React renders the component, and all nine were mounted
 * unconditionally, each reading its own store, seeing `isOpen: false`, and
 * returning null having already paid for itself.
 */

afterEach(cleanup);

describe("a panel that has never been opened", () => {
  it("renders nothing, so its chunk is never requested", () => {
    const { container } = render(
      <LazyPanel label="Test" isOpen={false}>
        <p>panel body</p>
      </LazyPanel>
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders once it is opened", () => {
    const { rerender } = render(
      <LazyPanel label="Test" isOpen={false}>
        <p>panel body</p>
      </LazyPanel>
    );
    expect(screen.queryByText("panel body")).toBeNull();

    rerender(
      <LazyPanel label="Test" isOpen>
        <p>panel body</p>
      </LazyPanel>
    );
    expect(screen.getByText("panel body")).toBeTruthy();
  });

  it("stays mounted after it is closed again", () => {
    /*
      Deliberate, and the reason this is not a plain `isOpen && <Panel/>`.

      Several of these panels animate out with AnimatePresence, and a
      component unmounted by its parent never gets to run its exit animation
      - it vanishes. Staying mounted also keeps whatever the person had
      half-typed in the feedback form. The download has already happened by
      this point, so there is nothing left to save by unmounting.
    */
    const { rerender } = render(
      <LazyPanel label="Test" isOpen>
        <p>panel body</p>
      </LazyPanel>
    );
    expect(screen.getByText("panel body")).toBeTruthy();

    rerender(
      <LazyPanel label="Test" isOpen={false}>
        <p>panel body</p>
      </LazyPanel>
    );
    expect(screen.getByText("panel body")).toBeTruthy();
  });
});

describe("App does not mount panels it has not been asked for", () => {
  const app = readFileSync(join(process.cwd(), "src", "App.tsx"), "utf8").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

  const PANELS = [
    ["FeedbackForm", "feedbackOpen"],
    ["HelpGuide", "helpOpen"],
    ["SettingsPanel", "settingsOpen"],
    ["FeatureStatusPage", "featureStatusOpen"],
    ["JoinTeamForm", "teamOpen"],
    ["AboutPanel", "aboutOpen"],
    ["AreaReport", "reportOpen"],
    ["PlayHub", "gamesOpen"],
    ["PrivacyPanel", "privacyOpen"],
  ] as const;

  it("gates every modal panel on whether it has been opened", () => {
    for (const [component, flag] of PANELS) {
      const block = app.match(new RegExp(`<LazyPanel[^>]*isOpen=\\{${flag}\\}>\\s*<${component}\\s*/>`, "s"));
      expect(block, `${component} is not gated on ${flag}`).not.toBeNull();
    }
  });

  it("does not render any of them in a bare Suspense any more", () => {
    // The shape of the original bug: <Suspense><Panel/></Suspense> with
    // nothing deciding whether to render it.
    for (const [component] of PANELS) {
      expect(app, component).not.toMatch(new RegExp(`<Suspense[^>]*>\\s*<${component}\\s*/>`, "s"));
    }
  });

  it("keeps the consent banner out of the games boundary", () => {
    /*
      It was nested inside PlayHub's Suspense - not lazy, nothing to do with
      games, and sharing that boundary meant the one surface a first-time
      visitor must see could be held up by 209 KB of games loading beside it.
    */
    expect(app).not.toMatch(/<PlayHub\s*\/>\s*<ConsentBanner\s*\/>/s);
  });
});

describe("anything calling itself a modal behaves like one", () => {
  /*
    `aria-modal="true"` is a promise to assistive technology: focus moves in,
    Tab stays inside, Escape closes, focus returns. hooks/useDialog.ts is the
    single implementation of all four, and it had been applied to seven of
    the app's dialogs and missed on three. A role that claims a trap and does
    not have one is worse than never claiming to be a dialog: the reader is
    told to expect containment and then walks out into a page they cannot
    see.
  */
  function tsxFiles(dir: string, found: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) tsxFiles(full, found);
      else if (entry.endsWith(".tsx")) found.push(full);
    }
    return found;
  }

  const modals = tsxFiles(join(process.cwd(), "src"))
    .map((path) => ({ path, source: readFileSync(path, "utf8") }))
    .filter((f) => f.source.includes('aria-modal="true"'));

  it("finds the modals to check", () => {
    expect(modals.length).toBeGreaterThanOrEqual(4);
  });

  it("uses the shared dialog behaviour in every one of them", () => {
    const offenders = modals
      .filter((f) => !f.source.includes("useDialog"))
      .map((f) => relative(join(process.cwd(), "src"), f.path).split(sep).join("/"));
    expect(offenders, offenders.join(", ")).toEqual([]);
  });
});
