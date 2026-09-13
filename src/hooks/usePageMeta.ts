import { useEffect } from "react";

/**
 * Per-route metadata for an app that has no router.
 *
 * index.html carries one title, one description and one hard-coded
 * `rel=canonical` pointing at the home page. That is correct for the home page
 * and wrong for every other path: left alone, a canonical tag tells Google that
 * whatever page you are on is a duplicate of "/", which is grounds for dropping
 * it from the index entirely. A site cannot rank a page that disowns itself.
 *
 * This logic already existed, privately, inside LandingPage.tsx, which is why
 * `/ai-map-search` was the only path that ever described itself correctly.
 * Lifting it out is what makes more than one indexable page possible at all.
 *
 * Everything is restored on unmount. Without that, opening a city page and then
 * navigating back would leave the document still wearing the city's title and
 * canonical, and the app would quietly claim to be Hyderabad.
 */

export interface PageMeta {
  title: string;
  description: string;
  /** Absolute, and the value that goes in rel=canonical. */
  url: string;
  /** Optional per-page social image; falls back to the site card. */
  image?: string;
}

export function usePageMeta({ title, description, url, image }: PageMeta) {
  useEffect(() => {
    const prevTitle = document.title;

    const overrides: Array<[Element | null, string, string]> = [
      [document.querySelector('meta[name="description"]'), "content", description],
      [document.querySelector('meta[property="og:title"]'), "content", title],
      [document.querySelector('meta[property="og:description"]'), "content", description],
      [document.querySelector('meta[property="og:url"]'), "content", url],
      [document.querySelector('meta[name="twitter:title"]'), "content", title],
      [document.querySelector('meta[name="twitter:description"]'), "content", description],
      // The one that actually decides whether this page can be indexed at all.
      [document.querySelector('link[rel="canonical"]'), "href", url],
    ];
    if (image) {
      overrides.push(
        [document.querySelector('meta[property="og:image"]'), "content", image],
        [document.querySelector('meta[name="twitter:image"]'), "content", image]
      );
    }

    const restore = overrides.map(([el, attr, next]) => {
      const prev = el?.getAttribute(attr) ?? null;
      el?.setAttribute(attr, next);
      return () => {
        if (prev !== null) el?.setAttribute(attr, prev);
      };
    });

    document.title = title;

    return () => {
      document.title = prevTitle;
      restore.forEach((fn) => fn());
    };
  }, [title, description, url, image]);
}

/**
 * Injects a JSON-LD block for the lifetime of a page.
 *
 * Separate from the tags above because structured data is added and removed
 * rather than overwritten: there is no existing element to restore, so leaving
 * one behind would have two pages' schemas on the document at once and give a
 * crawler contradictory claims about what it is looking at.
 */
export function useJsonLd(schema: object | null, id: string) {
  useEffect(() => {
    if (!schema) return;
    const el = document.createElement("script");
    el.type = "application/ld+json";
    el.dataset.schemaId = id;
    el.textContent = JSON.stringify(schema);
    document.head.appendChild(el);
    return () => el.remove();
  }, [schema, id]);
}
