import { Suspense, useEffect, useState, type ReactNode } from "react";
import { ErrorBoundary } from "./ErrorBoundary";

/**
 * A modal panel whose code is not downloaded until somebody opens it.
 *
 * The bug this exists to fix, measured in a browser: loading the map
 * workspace downloaded 1.55 MB of JavaScript across nineteen files, and
 * 209 KB of that was the games hub. Nobody opening a map needs the games
 * hub. Nor the settings panel, the privacy panel, the printable report, the
 * feedback form, the team application form, the about panel or the feature
 * status page - every one of which arrived on first load, on every visit,
 * for every visitor, on whatever connection they had.
 *
 * All of them were already `React.lazy`, which is why this looked correct.
 * The trap is that lazy splits the chunk but does nothing to decide WHEN it
 * is fetched: the import fires the moment React renders the component, and
 * all nine were mounted unconditionally at the bottom of App. Each one then
 * read its own store, saw `isOpen: false`, and returned null - after its
 * chunk had already been downloaded. A panel that renders nothing still
 * costs its full weight.
 *
 * Mounting only while open would fix the download and break two things
 * worth keeping, so it does something slightly softer: it mounts from the
 * first open ONWARDS. Before that, nothing is fetched. After it, the panel
 * stays mounted even when closed, which preserves its exit animation (an
 * AnimatePresence that unmounts with its parent never gets to run) and
 * anything half-typed in it.
 */

/** True from the first time `isOpen` goes true, and true forever after. */
export function useHasOpened(isOpen: boolean): boolean {
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    if (isOpen) setOpened(true);
  }, [isOpen]);

  // `|| isOpen` so the panel mounts on the very render it is opened, rather
  // than a frame later once the effect has run.
  return opened || isOpen;
}

interface Props {
  /** Shown if the panel's own code throws. */
  label: string;
  isOpen: boolean;
  children: ReactNode;
}

export function LazyPanel({ label, isOpen, children }: Props) {
  const mounted = useHasOpened(isOpen);
  // Returning null does not merely hide the children - it never renders
  // them, which is the whole point: an unrendered lazy element is an
  // unfetched chunk.
  if (!mounted) return null;

  return (
    <ErrorBoundary label={label} variant="panel">
      <Suspense fallback={null}>{children}</Suspense>
    </ErrorBoundary>
  );
}
