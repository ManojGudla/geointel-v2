import { describe, expect, it, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { NotFoundPage } from "../../src/features/notfound/NotFoundPage";

/**
 * Until this page existed, every unknown URL on the domain answered HTTP 200
 * with the full map application. The Vercel rewrite sends all unmatched paths
 * to index.html and App.tsx had no final branch, so /pricing, /maps/london and
 * /asdfgh were all served as though they were real pages.
 *
 * The SEO harm is the one that compounds: infinitely many URLs, each returning
 * 200 with byte-identical HTML, is textbook duplicate content. A single bad
 * inbound link can make a two-page site look like a thousand-page one full of
 * nothing, and burn the crawl budget discovering that.
 *
 * The page cannot send a real 404 status from a static host, so the signal that
 * actually keeps these URLs out of an index is the noindex tag. These tests
 * hold that tag, and hold the canonical removal beside it, because the two
 * together are the whole mechanism.
 */

afterEach(cleanup);

describe("the not-found page", () => {
  it("tells crawlers not to index it, but to follow its links", () => {
    render(<NotFoundPage pathname="/nope" />);
    const robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    expect(robots?.content).toBe("noindex, follow");
  });

  it("removes the inherited canonical while it is on screen", () => {
    /*
      index.html hard-codes canonical → the home page. Leaving it here would
      say "this URL is a duplicate of the home page" at the same moment the
      robots tag says "do not index this URL" — two contradictory instructions
      about the same page. noindex has to speak alone.
    */
    const link = document.createElement("link");
    link.rel = "canonical";
    link.href = "https://www.manowj.com/";
    document.head.appendChild(link);

    const view = render(<NotFoundPage pathname="/nope" />);
    expect(document.querySelector('link[rel="canonical"]')).toBeNull();

    // And it must come back, or navigating away leaves the whole app without
    // a canonical for the rest of the session.
    view.unmount();
    expect(document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href).toBe("https://www.manowj.com/");
    document.querySelector('link[rel="canonical"]')?.remove();
  });

  it("cleans up its robots tag on unmount", () => {
    // A stray noindex left behind after navigation would deindex the real app.
    const view = render(<NotFoundPage pathname="/nope" />);
    view.unmount();
    expect(document.querySelector('meta[name="robots"]')).toBeNull();
  });

  it("shows the path so a person can see their own typo", () => {
    render(<NotFoundPage pathname="/hospitalss" />);
    expect(screen.getByText("/hospitalss")).toBeTruthy();
  });

  it("does not execute markup from a crafted path", () => {
    // The path comes from the URL bar, so it is attacker-controlled on any
    // link someone can be sent. React escapes it; this holds that it stays
    // escaped if the rendering ever changes.
    render(<NotFoundPage pathname={'/<img src=x onerror="alert(1)">'} />);
    expect(document.querySelector("img")).toBeNull();
    expect(screen.getByText('/<img src=x onerror="alert(1)">')).toBeTruthy();
  });

  it("offers a way back to something real", () => {
    render(<NotFoundPage pathname="/nope" />);
    const hrefs = [...document.querySelectorAll<HTMLAnchorElement>("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/");
    expect(hrefs).toContain("/ai-map-search");
  });
});
