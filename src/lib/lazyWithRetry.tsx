import { lazy, type ComponentProps, type ComponentType } from "react";

/**
 * React.lazy, except a failed download can be tried again.
 *
 * React.lazy remembers a rejected import for the life of the page. That was
 * fine while the only failure anyone planned for was a stale deploy, which a
 * reload fixes. It is wrong offline: open Help on a train with no signal and
 * the Help chunk fails to download, and React would keep rethrowing that same
 * failure after the signal came back. The only way out was reloading the
 * whole page, which throws away the selected place, the map position and any
 * Copilot conversation.
 *
 * Here, a failed load marks itself as retryable. ErrorBoundary calls
 * retryFailedChunks() before it re-renders, so "Try again", or the connection
 * returning, fetches the file afresh and the panel appears where it was.
 */

const pendingRetries = new Set<() => void>();

/** Swap every component whose download failed for a fresh loader. */
export function retryFailedChunks(): void {
  for (const retry of [...pendingRetries]) retry();
  pendingRetries.clear();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyWithRetry<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>) {
  const load = () =>
    factory().catch((error: unknown) => {
      pendingRetries.add(reset);
      throw error;
    });

  // Typed loosely inside, strictly outside: lazy()'s ref-aware prop types do
  // not line up with a generic component, and nothing here forwards refs.
  let Current = lazy(load) as unknown as ComponentType<ComponentProps<T>>;
  function reset() {
    Current = lazy(load) as unknown as ComponentType<ComponentProps<T>>;
  }

  // Reads Current at render time, so a reset is picked up on the next render.
  function Retryable(props: ComponentProps<T>) {
    const Component = Current;
    return <Component {...props} />;
  }
  return Retryable;
}
