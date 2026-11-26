import { describe, expect, it, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { InfoPage } from "../../src/features/info/InfoPage";
import { INFO_PAGE_BY_PATH } from "../../src/seo/infoPages";
import { infoSchemaId } from "../../src/seo/routeMeta";

/**
 * The written pages as a visitor sees them once the app has loaded. The
 * static HTML is checked in infoPages.test.ts; this is the other half of the
 * promise that both say the same thing.
 */

afterEach(cleanup);

describe("a rendered tool page", () => {
  it("shows its questions and answers, open, under their own heading", () => {
    render(<InfoPage path="/tools/radius-search" />);
    const page = INFO_PAGE_BY_PATH.get("/tools/radius-search")!;
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(page.h1);
    expect(screen.getByRole("heading", { level: 2, name: page.faq!.heading })).toBeTruthy();
    for (const { q, a } of page.faq!.items) {
      expect(screen.getByRole("heading", { level: 3, name: q })).toBeTruthy();
      expect(screen.getByText(a)).toBeTruthy();
    }
  });

  it("adds its HowTo and FAQPage structured data, and takes it away again", () => {
    const page = INFO_PAGE_BY_PATH.get("/tools/measure-area")!;
    const view = render(<InfoPage path={page.path} />);
    const el = [...document.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]')].find(
      (s) => s.dataset.schemaId === infoSchemaId(page)
    );
    expect(el).toBeTruthy();
    const types = (JSON.parse(el!.textContent!)["@graph"] as Array<{ "@type": string }>).map((n) => n["@type"]);
    expect(types).toEqual(["WebPage", "HowTo", "FAQPage"]);
    view.unmount();
    expect(document.querySelector(`script[data-schema-id="${infoSchemaId(page)}"]`)).toBeNull();
  });

  it("claims its own canonical URL", () => {
    const link = document.createElement("link");
    link.rel = "canonical";
    link.href = "https://www.manowj.com/";
    document.head.appendChild(link);
    const view = render(<InfoPage path="/tools/satellite-history" />);
    expect(link.href).toBe("https://www.manowj.com/tools/satellite-history");
    expect(document.title).toBe("Free Historical Satellite Imagery & Capture Dates | maNOWj");
    view.unmount();
    expect(link.href).toBe("https://www.manowj.com/");
    link.remove();
  });
});
