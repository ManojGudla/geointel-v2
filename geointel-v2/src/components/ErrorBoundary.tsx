import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Label shown in the fallback UI, e.g. "GeoIntel workspace" or "Weather panel". */
  label: string;
  /** Compact fallback for small panels vs. a full-page fallback for the app root. */
  variant?: "page" | "panel";
  onReset?: () => void;
}

interface State {
  error: Error | null;
}

/**
 * Catches render-time crashes so one broken panel (or a truly unexpected
 * frontend bug) never turns the whole app into a white screen — the single
 * hardest requirement in the spec. Data-fetch errors (network failures,
 * provider outages) are handled separately by AsyncPanel; this only catches
 * actual React render exceptions.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[ErrorBoundary:${this.props.label}]`, error, info.componentStack);
  }

  private reset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

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
