import { AnimatePresence, motion } from "framer-motion";
import { useSettingsStore } from "@/stores/settingsStore";
import { useUiStore, type AnimationIntensity, type Units } from "@/stores/uiStore";
import { useMapStore } from "@/stores/mapStore";
import { useWeatherEffectStore } from "@/features/weather/effects/weatherEffectStore";
import { useMotionPreference } from "@/hooks/useMotionPreference";
import { overlayFade, panelRise } from "@/lib/motionVariants";
import "./SettingsPanel.css";
import { useDialog } from "@/hooks/useDialog";

const RADIUS_PRESETS = [100, 250, 500, 1000, 2000, 5000];

function formatRadius(meters: number): string {
  return meters >= 1000 ? `${meters / 1000}km` : `${meters}m`;
}

const ANIMATION_OPTIONS: Array<{ id: AnimationIntensity; label: string }> = [
  { id: "full", label: "Full" },
  { id: "reduced", label: "Reduced" },
  { id: "off", label: "Off" },
];

/**
 * A real settings surface for state that already existed in uiStore/mapStore
 * but had no UI: units, default analysis radius, panel motion, and whether
 * new sessions start the map in 3D. Radius/3D-default apply from the next
 * page load (they seed locationStore/mapStore's initial values, same as
 * before this panel existed) - units and motion apply immediately since
 * every consumer reads them live from the store.
 */
export function SettingsPanel() {
  const isOpen = useSettingsStore((s) => s.isOpen);
  const close = useSettingsStore((s) => s.close);
  /*
    Makes this behave like the role="dialog" it declares: Escape closes it,
    focus moves in on open and cycles inside, and goes back to whatever opened
    it on close. See hooks/useDialog.ts - none of that was happening before,
    and Tab walked straight out into the map behind this panel.
  */
  const dialogRef = useDialog({ open: isOpen, onClose: close });
  const motionEnabled = useMotionPreference();

  const units = useUiStore((s) => s.units);
  const setUnits = useUiStore((s) => s.setUnits);
  const animationIntensity = useUiStore((s) => s.animationIntensity);
  const setAnimationIntensity = useUiStore((s) => s.setAnimationIntensity);
  const defaultRadiusMeters = useUiStore((s) => s.defaultRadiusMeters);
  const setDefaultRadiusMeters = useUiStore((s) => s.setDefaultRadiusMeters);
  const is3DMapEnabled = useUiStore((s) => s.is3DMapEnabled);
  const setIs3DMapEnabled = useUiStore((s) => s.setIs3DMapEnabled);
  const is3DNow = useMapStore((s) => s.is3D);
  const toggle3DNow = useMapStore((s) => s.toggle3D);
  const weatherEffectsEnabled = useWeatherEffectStore((s) => s.enabled);
  const setWeatherEffectsEnabled = useWeatherEffectStore((s) => s.setEnabled);
  const displayName = useUiStore((s) => s.displayName);
  const setDisplayName = useUiStore((s) => s.setDisplayName);

  const setUnitsChoice = (next: Units) => setUnits(next);

  const content = (
    <>
      <div className="settings-panel__head">
        <h2>Settings</h2>
        <button type="button" onClick={close} aria-label="Close settings">
          ✕
        </button>
      </div>

      <div className="settings-panel__group">
        <span className="settings-panel__label">Your profile</span>
        <label className="settings-panel__text-field">
          <span>Display name</span>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Add your name"
            maxLength={80}
          />
        </label>
        <small>
          Saved to this browser only. GeoIntel doesn't have real user accounts yet (see Features → Personalization &amp;
          Settings), so this isn't synced anywhere else.
        </small>
      </div>

      <div className="settings-panel__group">
        <span className="settings-panel__label">Distance units</span>
        <div className="settings-panel__segmented" role="group" aria-label="Units">
          <button type="button" className={units === "metric" ? "active" : ""} onClick={() => setUnitsChoice("metric")}>
            Metric (km/m)
          </button>
          <button type="button" className={units === "imperial" ? "active" : ""} onClick={() => setUnitsChoice("imperial")}>
            Imperial (mi/ft)
          </button>
        </div>
        <small>Applies immediately to Directions and everywhere distances are shown.</small>
      </div>

      <div className="settings-panel__group">
        <span className="settings-panel__label">3D map</span>
        <div className="settings-panel__segmented" role="group" aria-label="3D map">
          <button type="button" className={is3DNow ? "active" : ""} onClick={() => !is3DNow && toggle3DNow()}>
            On now
          </button>
          <button type="button" className={!is3DNow ? "active" : ""} onClick={() => is3DNow && toggle3DNow()}>
            Off now
          </button>
        </div>
        <label className="settings-panel__checkbox">
          <input type="checkbox" checked={is3DMapEnabled} onChange={(e) => setIs3DMapEnabled(e.target.checked)} />
          Start new sessions in 3D
        </label>
      </div>

      {/* Off by default and stays off until someone chooses it. This is a GIS
          tool first - animated rain over a suitability analysis is not what
          anyone opened it for. */}
      <div className="settings-panel__group">
        <span className="settings-panel__label">Weather effects on the map</span>
        <label className="settings-panel__checkbox">
          <input
            type="checkbox"
            checked={weatherEffectsEnabled}
            onChange={(e) => setWeatherEffectsEnabled(e.target.checked)}
          />
          Show real weather over the map
        </label>
        <small>
          Off by default. When on, rain, snow, fog or cloud are drawn from the actual reported conditions at your
          selected location, never invented. If the weather can&apos;t be fetched, nothing is drawn. The effect sits
          under every data layer and never blocks a click.
        </small>
      </div>

      <div className="settings-panel__group">
        <span className="settings-panel__label">Default analysis radius</span>
        <div className="settings-panel__segmented settings-panel__segmented--wrap" role="group" aria-label="Default analysis radius">
          {RADIUS_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              className={defaultRadiusMeters === preset ? "active" : ""}
              onClick={() => setDefaultRadiusMeters(preset)}
            >
              {formatRadius(preset)}
            </button>
          ))}
        </div>
        <small>Used the next time you open GeoIntel. The radius selector in the right panel still adjusts the current session.</small>
      </div>

      <div className="settings-panel__group">
        <span className="settings-panel__label">Panel motion</span>
        <div className="settings-panel__segmented" role="group" aria-label="Panel motion">
          {ANIMATION_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={animationIntensity === opt.id ? "active" : ""}
              onClick={() => setAnimationIntensity(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <small>Controls the fade/slide transitions on panels like this one. Your OS's reduced-motion setting always wins.</small>
      </div>
    </>
  );

  if (!motionEnabled) {
    if (!isOpen) return null;
    return (
      <div className="settings-overlay" onClick={close}>
        <div ref={dialogRef} className="settings-panel" role="dialog" aria-label="Settings" onClick={(e) => e.stopPropagation()}>
          {content}
        </div>
      </div>
    );
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div className="settings-overlay" onClick={close} {...overlayFade}>
          <motion.div ref={dialogRef} className="settings-panel" role="dialog" aria-label="Settings" onClick={(e) => e.stopPropagation()} {...panelRise}>
            {content}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
