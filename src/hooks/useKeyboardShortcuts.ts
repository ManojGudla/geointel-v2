import { useEffect } from "react";
import { useShellStore } from "@/stores/shellStore";
import { useMeasureStore } from "@/stores/measureStore";
import { useCommandPaletteStore } from "@/stores/commandPaletteStore";

/**
 * Single-key shortcuts for the things people reach for constantly.
 *
 * Two rules keep these from becoming a nuisance. They never fire while the
 * user is typing - in an input, a textarea, a select or anything
 * contenteditable - because a shortcut that eats the "l" in "hospital" is
 * worse than no shortcut. And they never fire with a modifier held, so
 * browser and OS combinations (Ctrl+L for the address bar, Cmd+A for select
 * all) keep working exactly as they should.
 *
 * Escape is deliberately layered rather than doing one thing: it undoes the
 * most recent, most specific piece of state first. Measuring, then the
 * panel. Anything with its own Escape handling - the command palette, the
 * header menu, the search dropdown - is left alone here, so pressing Escape
 * never closes two things at once.
 */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

function focusSearch() {
  const input = document.querySelector<HTMLInputElement>(".search-bar__input");
  input?.focus();
  input?.select();
}

export function useKeyboardShortcuts() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const shell = useShellStore.getState();
      const measure = useMeasureStore.getState();

      if (event.key === "Escape") {
        // The command palette owns Escape while it's open; two handlers
        // firing would close it and the panel behind it in one press.
        if (useCommandPaletteStore.getState().isOpen) return;
        if (measure.mode !== "off") {
          measure.setMode("off");
          event.preventDefault();
          return;
        }
        if (shell.open) {
          shell.closePanel();
          event.preventDefault();
        }
        return;
      }

      if (isTyping(event.target)) return;

      switch (event.key.toLowerCase()) {
        case "/":
          event.preventDefault();
          focusSearch();
          break;
        case "l":
          event.preventDefault();
          shell.openSection("layers");
          break;
        case "a":
          event.preventDefault();
          shell.openSection("tools");
          break;
        case "m":
          event.preventDefault();
          measure.setMode(measure.mode === "distance" ? "off" : "distance");
          shell.openSection("tools");
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
