import { useEffect, useRef, useState } from "react";
import { useMapStore, type Basemap } from "@/stores/mapStore";
import "./BasemapSwitcher.css";

/**
 * Basemap switching, on the map, where people look for it.
 *
 * Reported by more than a hundred users as some version of "I can't find the
 * images". They were right: satellite imagery lived only inside the Layers
 * panel, behind a rail button labelled "Data", and the map itself carried no
 * basemap control at all. Every map anyone has already used — Google, Apple,
 * Bing, OpenStreetMap — puts this on the map, so that is the first and only
 * place most people look, and finding nothing there they conclude the app
 * has no satellite view rather than going hunting through a panel.
 *
 * The controls used to be on the map and were moved into the panel because
 * four full-width basemap buttons overflowed their row on a phone and
 * collided with the Copilot launcher. That was a real problem and this does
 * not reintroduce it: collapsed, this is one button, narrower than the
 * coordinate chip it sits above, at every screen size. The four options only
 * exist while the popover is open, and the popover closes on pick, on
 * Escape, and on any click outside it.
 *
 * The main button switches straight between Standard and Satellite and is
 * labelled with the mode it will GIVE you rather than the one you are on,
 * which is the convention those same apps use and means the single most
 * requested action costs exactly one tap. Terrain and Dark are real but far
 * rarer, so they live one tap deeper rather than competing for the same
 * space. MapControls in the Layers panel still offers all four with their
 * descriptions; this is a shortcut to it, not a replacement.
 */

const OPTIONS: Array<{ id: Basemap; label: string; note: string; icon: string }> = [
  { id: "standard", label: "Standard", note: "Streets & labels", icon: "🗺️" },
  { id: "satellite", label: "Satellite", note: "Aerial imagery", icon: "🛰️" },
  { id: "terrain", label: "Terrain", note: "Relief & contours", icon: "⛰️" },
  { id: "dark", label: "Dark", note: "Low-light map", icon: "🌙" },
];

export function BasemapSwitcher() {
  const basemap = useMapStore((s) => s.basemap);
  const setBasemap = useMapStore((s) => s.setBasemap);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  /* A popover over a draggable map has to be easy to get rid of, and the
     two ways people try are clicking the map and pressing Escape. Without
     both, the panel sits there while you pan underneath it. */
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  // What the big button offers: the other one of the two common modes.
  const alternate: Basemap = basemap === "satellite" ? "standard" : "satellite";
  const alternateDef = OPTIONS.find((o) => o.id === alternate) ?? OPTIONS[1]!;

  return (
    <div className={`basemap-switcher${open ? " is-open" : ""}`} ref={rootRef}>
      {open && (
        <div className="basemap-switcher__menu" role="group" aria-label="Map style">
          {OPTIONS.map((o) => (
            <button
              key={o.id}
              type="button"
              className={`basemap-switcher__item${basemap === o.id ? " is-current" : ""}`}
              aria-pressed={basemap === o.id}
              onClick={() => {
                setBasemap(o.id);
                setOpen(false);
              }}
            >
              <span className="basemap-switcher__icon" aria-hidden="true">
                {o.icon}
              </span>
              <span className="basemap-switcher__text">
                <span className="basemap-switcher__label">{o.label}</span>
                <span className="basemap-switcher__note">{o.note}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="basemap-switcher__bar">
        <button
          type="button"
          className="basemap-switcher__main"
          onClick={() => setBasemap(alternate)}
          title={`Switch the map to ${alternateDef.label.toLowerCase()}`}
        >
          <span className="basemap-switcher__icon" aria-hidden="true">
            {alternateDef.icon}
          </span>
          <span className="basemap-switcher__main-label">{alternateDef.label}</span>
        </button>
        <button
          type="button"
          className="basemap-switcher__more"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? "Hide map styles" : "Show all map styles"}
          title="All map styles"
        >
          <span className="basemap-switcher__chevron" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
