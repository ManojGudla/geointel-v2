import { useMemo } from "react";
import { usePageMeta, useJsonLd } from "@/hooks/usePageMeta";
import { infoMeta, infoSchema, infoSchemaId } from "@/seo/routeMeta";
import { INFO_PAGE_BY_PATH, INFO_PAGES, type InfoPage as InfoPageData } from "@/seo/infoPages";
import { track } from "@/services/analytics";
import "./InfoPage.css";

interface Props {
  /** One of INFO_PATHS; the shell has already checked it. */
  path: string;
}

/**
 * One of the written pages: the area report, a tool, or a page for a
 * particular job. All content comes from src/seo/infoPages.ts, which the build
 * step also reads to write this page's static HTML.
 *
 * A document, like the city pages: no map engine and no panels, so it paints
 * fast for somebody arriving from a search result. The "try it" links are the
 * product - each opens the app at a real place with this page's feature
 * already running.
 */
export function InfoPage({ path }: Props) {
  const page = INFO_PAGE_BY_PATH.get(path);
  if (!page) return null;
  return <InfoPageView page={page} />;
}

function InfoPageView({ page }: { page: InfoPageData }) {
  usePageMeta(infoMeta(page));
  const schema = useMemo(() => infoSchema(page), [page]);
  useJsonLd(schema, infoSchemaId(page));

  const related = page.related.map((path) => INFO_PAGE_BY_PATH.get(path)).filter((p): p is InfoPageData => Boolean(p));
  const others = INFO_PAGES.filter((p) => p.path !== page.path && !page.related.includes(p.path));

  return (
    <div className="info">
      <header className="info__head">
        <nav className="info__crumbs" aria-label="Breadcrumb">
          <a href="/">maNOWj GeoIntel</a>
          <span aria-hidden="true">›</span>
          <span>{page.group}</span>
          <span aria-hidden="true">›</span>
          <span aria-current="page">{page.nav}</span>
        </nav>
        <h1 className="info__title">{page.h1}</h1>
        <p className="info__lede">{page.lead}</p>
        <div className="info__actions">
          <a className="info__btn info__btn--primary" href="/" onClick={() => track("map_opened", { source: "info-page" })}>
            Open the map
          </a>
          <span className="info__free">Free. No sign-up.</span>
        </div>
      </header>

      <main className="info__main">
        <section className="info__try" aria-labelledby="info-try">
          <h2 id="info-try">Try it on a real place</h2>
          <ul>
            {page.examples.map((example) => (
              <li key={example.href}>
                <a href={example.href} onClick={() => track("map_opened", { source: "info-example" })}>
                  <span>{example.label}</span>
                  <span aria-hidden="true">→</span>
                </a>
              </li>
            ))}
          </ul>
        </section>

        {page.sections.map((section) => (
          <section key={section.heading} className="info__section">
            <h2>{section.heading}</h2>
            {section.paragraphs?.map((text) => <p key={text}>{text}</p>)}
            {section.steps && (
              <ol>
                {section.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            )}
            {section.bullets && (
              <ul>
                {section.bullets.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
          </section>
        ))}

        <section className="info__section info__limits">
          <h2>What it cannot tell you</h2>
          <ul>
            {page.limits.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section className="info__section" aria-labelledby="info-related">
          <h2 id="info-related">Related</h2>
          <ul className="info__links">
            {related.map((p) => (
              <li key={p.path}>
                <a href={p.path}>{p.nav}</a>
              </li>
            ))}
            {others.map((p) => (
              <li key={p.path}>
                <a href={p.path}>{p.nav}</a>
              </li>
            ))}
            <li>
              <a href="/ai-map-search">AI map search</a>
            </li>
            <li>
              <a href="/maps/hyderabad">City maps</a>
            </li>
          </ul>
        </section>
      </main>

      <footer className="info__footer">
        <p>
          maNOWj GeoIntel is free and independent, built by Manoj Kumar Gudla. Map data © OpenStreetMap contributors.{" "}
          <a href="/privacy">Privacy</a>
        </p>
      </footer>
    </div>
  );
}
