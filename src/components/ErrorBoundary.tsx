import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Label shown in the fallback UI, e.g. "GeoIntel workspace" or "Weather panel". */
  label: string;
  /**
   * "page" for the app root, "panel" for a normal panel, and "silent" for
   * purely decorative things - the weather effect, the teaser card. If one of
   * those crashes, rendering nothing is the correct outcome; putting a red
   * error box over the middle of the map because a snowflake threw would be a
   * worse experience than the bug itself. The failure is still logged.
   */
  variant?: "page" | "panel" | "silent";
  onReset?: () => void;
}

interface State {
  error: Error | null;
  /** The error was "this build no longer exists", not a bug in the panel. */
  stale: boolean;
}

/**
 * ── Deploys that break an open tab ────────────────────────────────────────
 *
 * Vite splits the app into fingerprinted chunks and loads the big ones on
 * demand. A new deploy gives every changed chunk a new name and removes the
 * old one, so a tab that was ALREADY OPEN when the deploy went out is holding
 * an index.html that names files which no longer exist. Nothing is wrong with
 * the server or the browser's cache; the page in memory is simply describing
 * a build that is gone. The moment the visitor opens a panel that had not
 * loaded yet, the import 404s.
 *
 * Seen on manowj.com: opening the games hub and the privacy panel right after
 * a deploy both showed "hit a problem and couldn't render". Retry could never
 * fix it - the file is genuinely gone, so re-rendering asks for the same dead
 * URL again. Only a reload helps, because the document is fetched network
 * first and comes back naming the new chunks.
 *
 * A normal visitor will not think to reload. They will read "hit a problem"
 * as "this site is broken" and leave. So this is handled rather than
 * explained.
 */
const RELOAD_KEY = "manowj.chunk-reload";

/** Long enough to cover a reload, short enough not to suppress a real one later. */
export const RELOAD_GUARD_MS = 30_000;

/** Does this error mean "the file this build asked for is not there any more"? */
export function isStaleBuildError(error: unknown): boolean {
  const text =
    error instanceof Error ? `${error.name} ${error.message}` : typeof error === "string" ? error : "";
  return /ChunkLoadError|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS/i.test(
    text
  );
}

/**
 * Guards against a reload loop.
 *
 * Reloading on a stale chunk is right exactly once. If the fresh build fails
 * the same way, reloading again would spin the tab forever and the visitor
 * would never see a message explaining anything - the worst possible outcome,
 * and strictly worse than the error box this replaces.
 */
export function shouldReloadForStaleBuild(now: number, lastAttempt: string | null): boolean {
  const then = Number(lastAttempt);
  if (!Number.isFinite(then) || then <= 0) return true;
  return now - then >= RELOAD_GUARD_MS;
}

/**
 * Catches render-time crashes so one broken panel (or a truly unexpected
 * frontend bug) never turns the whole app into a white screen - the single
 * hardest requirement in the spec. Data-fetch errors (network failures,
 * provider outages) are handled separately by AsyncPanel; this only catches
 * actual React render exceptions.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, stale: false };

  static getDerivedStateFromError(error: Error): State {
    return { error, stale: isStaleBuildError(error) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[ErrorBoundary:${this.props.label}]`, error, info.componentStack);

    // A chunk that no longer exists is not a bug in this panel, and no amount
    // of re-rendering will bring the file back. Reload once, quietly.
    if (!isStaleBuildError(error)) return;
    let lastAttempt: string | null = null;
    try {
      lastAttempt = sessionStorage.getItem(RELOAD_KEY);
    } catch {
      // Blocked storage. Treated as "never tried", so the reload still
      // happens - the visitor gets a working page, and the worst case is one
      // extra reload rather than a permanently broken panel.
    }
    if (!shouldReloadForStaleBuild(Date.now(), lastAttempt)) return;
    try {
      sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    } catch {
      /* see above */
    }
    window.location.reload();
  }

  private reset = () => {
    this.setState({ error: null, stale: false });
    this.props.onReset?.();
  };

  /** Clears the guard first, so the button always actually reloads. */
  private reload = () => {
    try {
      sessionStorage.removeItem(RELOAD_KEY);
    } catch {
      /* nothing to clear */
    }
    window.location.reload();
  };

  render() {
    const { error, stale } = this.state;
    if (!error) return this.props.children;

    // Checked before the stale branch: a decorative component is not worth a
    // message box over the middle of the map, and the reload has already been
    // attempted from componentDidCatch either way.
    if (this.props.variant === "silent") return null;

    // Shown only when the automatic reload above has already been tried and
    // the new build failed the same way. Saying "hit a problem" here would
    // send someone hunting for a fault in their own browser.
    if (stale) {
      return (
        <div
          className={`error-boundary error-boundary--${this.props.variant === "page" ? "page" : "panel"}`}
          role="alert"
        >
          <p>A new version of maNOWj GeoIntel went live while this tab was open, so this part could not load.</p>
          <button type="button" onClick={this.reload}>
            Reload the page
          </button>
        </div>
      );
    }

    if (this.props.variant === "page") {
      return (
        <div className="error-boundary error-boundary--page" role="alert">
          <h1>maNOWj GeoIntel hit a problem</h1>
          <p>Something went wrong rendering the workspace. Your data (saved locations, history) is safe.</p>
          <button type="button" onClick={this.reset}>
            Reload workspace
          </button>
        </div>
      );
    }

    return (
      <div className="error-boundary error-boundary--panel" role="alert">
        <p>
          <strong>{this.props.label}</strong> hit a problem and couldn't render.
        </p>
        <button type="button" onClick={this.reset}>
          Retry
        </button>
      </div>
    );
  }
}
