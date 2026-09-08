import { useEffect } from "react";
import { useUiStore } from "@/stores/uiStore";

/** Applies the resolved theme (system | light | dark) to the document root as data-theme. */
export function useTheme() {
  const theme = useUiStore((s) => s.theme);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") {
      root.removeAttribute("data-theme");
    } else {
      root.setAttribute("data-theme", theme);
    }
  }, [theme]);

  return theme;
}
