import { useEffect, useState } from "react";
import { useUiStore } from "@/stores/uiStore";

/**
 * Single source of truth for "should this panel animate?" — combines the
 * user's explicit in-app choice (Settings → animationIntensity, currently
 * defaulted to "full" since there's no settings UI for it yet) with the
 * OS-level prefers-reduced-motion signal, which always wins regardless of
 * the in-app setting. Framer Motion panels use this instead of each
 * re-deriving the same two checks.
 */
export function useMotionPreference(): boolean {
  const intensity = useUiStore((s) => s.animationIntensity);
  const [osReducedMotion, setOsReducedMotion] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setOsReducedMotion(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  if (osReducedMotion) return false;
  return intensity !== "off";
}
