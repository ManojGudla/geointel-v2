import { useEffect } from "react";
import "./NotFoundPage.css";

/**
 * What an unknown URL gets.
 *
 * Until now: the full map workspace, served with HTTP 200. The Vercel rewrite
 * sends every unmatched path to index.html, and App.tsx had no final branch, so
 * /hospitals, /pricing, /maps/hyderabad and /asdfgh all fell through every `if`
 * and rendered the application as though they were real pages.
 *
 * Two separate harms, and the second is the one that grows.
 *
 * For a person, a mistyped or stale link silently becomes the home page, with
 * nothing saying the address was wrong. They assume the link was fine and that
 * whatever they were promised simply is not there.
 *
 * For a crawler, every one of infinitely many URLs answers 200 with identical
 * HTML. That is textbook duplicate content: a search engine spends its crawl
 * budget on nonsense paths, finds the same page each time, and has no signal
 * about which URL is canonical. A site with two real pages can be made to look
 * like a site with thousands of worthless ones by a single bad inbound link.
 *
 * This page cannot return a real 404 status — the app is static, the rewrite
 * has already answered 200, and changing that would need server rendering. So
 * it does the two things a client CAN do, and says so honestly rather than
 * pretending the status is right: it emits `robots: noindex, follow`, which is
 * what actually keeps these URLs out of an index, and it gives the person a
 * way back.
 *
 * `follow` rather than `nofollow` on purpose: the links below point at real
 * pages, and there is no reason to waste the signal.
 */
export function NotFoundPage({ pathname }: { pathname: string }) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Page not found | maNOWj GeoIntel";

    const robots = document.createElement("meta");
    robots.name = "robots";
    robots.content = "noindex, follow";
    document.head.appendChild(robots);

    // The canonical in index.html points at the home page. Leaving it in place
    // would tell a crawler this URL is a duplicate of the home page, which is
    // the opposite of the intended signal — noindex says "do not list this",
    // canonical says "list the home page instead of this". Removing it for the
    // lifetime of this page leaves noindex to speak alone.
    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    const canonicalParent = canonical?.parentNode ?? null;
    canonical?.remove();

    return () => {
      document.title = previousTitle;
      robots.remove();
      if (canonical && canonicalParent) canonicalParent.appendChild(canonical);
    };
  }, []);

  return (
    <div className="notfound">
      <main className="notfound__card">
        <p className="notfound__eyebrow">Page not found</p>
        <h1 className="notfound__title">There is nothing at this address.</h1>
        <p className="notfound__body">
          {/* The path is shown so a person can see the typo, and escaped by
              React so a crafted URL cannot inject anything into the page. */}
          <code className="notfound__path">{pathname}</code> is not a page on this site. It may have been mistyped, or
          it may be a link to something that never existed here.
        </p>

        <div className="notfound__actions">
          <a className="notfound__btn notfound__btn--primary" href="/">
            Open the map
          </a>
          <a className="notfound__btn" href="/ai-map-search">
            What this app does
          </a>
        </div>

        <ul className="notfound__links">
          <li>
            <a href="/">Search a place and ask a question about it</a>
          </li>
          <li>
            <a href="/status">System status</a>
          </li>
        </ul>
      </main>
    </div>
  );
}
