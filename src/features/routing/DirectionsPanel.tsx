import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useMotionPreference } from "@/hooks/useMotionPreference";
import { panelSlideIn } from "@/lib/motionVariants";
import { PlaceInput } from "./PlaceInput";
import { useRoute } from "./useRoute";
import { bookingLinks } from "./bookingLinks";
import { arrivalTime, formatDuration, turnIcon } from "./turnIcon";
import { formatDistance } from "@/features/map/geo";
import { useRouteStore } from "@/stores/routeStore";
import { useNavigationStore } from "./navigation/navStore";
import { useGeolocation } from "@/hooks/useGeolocation";
import { reverseGeocode } from "@/services/geocode";
import { useUiStore } from "@/stores/uiStore";
import type { RouteMode } from "@/types/intel";
import "./DirectionsPanel.css";

const MODES: Array<{ id: RouteMode; label: string; icon: string }> = [
  { id: "car", label: "Drive", icon: "🚗" },
  { id: "walk", label: "Walk", icon: "🚶" },
  { id: "bike", label: "Cycle", icon: "🚲" },
];

/**
 * Directions.
 *
 * Rewritten because the old panel was, in practice, non-functional: it only
 * ever routed if you clicked a dropdown suggestion with the mouse, so filling
 * both boxes by typing produced a panel that just sat there with no route, no
 * error and no explanation. See PlaceInput for that fix.
 *
 * Beyond making it work, this is the interactive version: a swap button, live
 * status while it's routing, selectable alternative routes, arrival time, and
 * a turn list where every step is a button that flies the map to that exact
 * manoeuvre and marks it — the behaviour people expect from a maps app.
 */
export function DirectionsPanel() {
  const from = useRouteStore((s) => s.from);
  const to = useRouteStore((s) => s.to);
  const mode = useRouteStore((s) => s.mode);
  const isPanelOpen = useRouteStore((s) => s.isPanelOpen);
  const selectedOption = useRouteStore((s) => s.selectedOption);
  const activeStep = useRouteStore((s) => s.activeStep);
  const setFrom = useRouteStore((s) => s.setFrom);
  const setTo = useRouteStore((s) => s.setTo);
  const setMode = useRouteStore((s) => s.setMode);
  const setSelectedOption = useRouteStore((s) => s.setSelectedOption);
  const setActiveStep = useRouteStore((s) => s.setActiveStep);
  const swap = useRouteStore((s) => s.swap);
  const closePanel = useRouteStore((s) => s.closePanel);
  const startNavigation = useNavigationStore((s) => s.start);
  const navState = useNavigationStore((s) => s.state);
  const navActive = navState === "navigating" || navState === "locating" || navState === "rerouting";

  const [fromText, setFromText] = useState(from?.displayName ?? "");
  const [toText, setToText] = useState(to?.displayName ?? "");
  const geolocation = useGeolocation();
  const units = useUiStore((s) => s.units);

  const query = useRoute();

  // The store is the source of truth for the endpoints, and it can be changed
  // from outside this panel (Quick Actions' "Directions", the Copilot, the
  // swap button). Mirroring it into the text fields keeps the boxes honest —
  // without this, swapping changed the route but not what you could read.
  useEffect(() => {
    setFromText(from?.displayName ?? "");
  }, [from]);
  useEffect(() => {
    setToText(to?.displayName ?? "");
  }, [to]);

  useEffect(() => {
    if (geolocation.status !== "granted" || !geolocation.coords) return;
    let cancelled = false;
    const { lat, lon } = geolocation.coords;

    reverseGeocode(lat, lon)
      .then((loc) => {
        if (!cancelled) setFrom(loc);
      })
      .catch(() => {
        if (!cancelled) setFrom({ lat, lon, displayName: "My Location", name: "My Location" });
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geolocation.status]);

  const motionEnabled = useMotionPreference();
  const route = query.data;
  const options = route?.options ?? [];
  const option = options[selectedOption] ?? options[0];
  const steps = option?.steps ?? [];

  const bothSet = !!from && !!to;
  // Typed text that hasn't become a place yet — the exact state that used to
  // fail silently. Now it says so.
  const pendingFrom = !from && fromText.trim().length > 0;
  const pendingTo = !to && toText.trim().length > 0;

  const content = (
    <>
      <div className="directions-panel__head">
        <h2>Directions</h2>
        <button type="button" onClick={closePanel} aria-label="Close directions">
          ✕
        </button>
      </div>

      <div className="directions-panel__fields">
        <PlaceInput
          label="From"
          value={fromText}
          onChange={setFromText}
          resolved={!!from}
          onSelect={(s) => setFrom({ lat: s.lat, lon: s.lon, displayName: s.displayName, name: s.name })}
          placeholder="Starting point"
        />

        <button
          type="button"
          className="directions-panel__swap"
          onClick={swap}
          disabled={!from && !to}
          title="Swap start and destination"
          aria-label="Swap start and destination"
        >
          ⇅
        </button>

        <PlaceInput
          label="To"
          value={toText}
          onChange={setToText}
          resolved={!!to}
          onSelect={(s) => setTo({ lat: s.lat, lon: s.lon, displayName: s.displayName, name: s.name })}
          placeholder="Destination"
        />
      </div>

      <button type="button" className="directions-panel__locate" onClick={geolocation.locate}>
        📍 Use my current location as the start
      </button>
      {geolocation.error && <p className="directions-panel__error">{geolocation.error}</p>}

      <div className="directions-panel__modes" role="group" aria-label="Travel mode">
        {MODES.map((m) => (
          <button key={m.id} type="button" className={mode === m.id ? "active" : ""} onClick={() => setMode(m.id)}>
            <span aria-hidden="true">{m.icon}</span> {m.label}
          </button>
        ))}
      </div>

      {/* Every state below says what is happening. The old panel's failure
          mode — both boxes filled, nothing rendered, no reason given — is
          the one thing that must not be possible here. */}
      {!bothSet && (
        <p className="directions-panel__prompt">
          {pendingFrom || pendingTo
            ? "Choose a suggestion from the list (or press Enter) so I know exactly which place you mean."
            : !from && !to
              ? "Enter a start and a destination to see the route."
              : !from
                ? "Now add a starting point."
                : "Now add a destination."}
        </p>
      )}

      {bothSet && query.isPending && (
        <p className="directions-panel__prompt" role="status">
          <span className="directions-panel__spinner" aria-hidden="true" /> Finding the best route…
        </p>
      )}

      {bothSet && query.isError && (
        <div className="directions-panel__failed" role="alert">
          <p>Couldn&apos;t get a route for this trip.</p>
          <p className="directions-panel__failed-why">
            {mode === "car"
              ? "The routing service may be busy, or there may be no road connection between these two points."
              : `There may be no continuous ${mode === "walk" ? "walking" : "cycling"} route this far. Try Drive.`}
          </p>
          <button type="button" onClick={() => query.refetch()}>
            Try again
          </button>
        </div>
      )}

      {route && option && (
        <>
          <div className="directions-panel__summary">
            <div className="directions-panel__summary-main">
              <strong>{formatDuration(option.durationSeconds)}</strong>
              <span>{formatDistance(option.distanceMeters, units)}</span>
            </div>
            <span className="directions-panel__eta">Arrive around {arrivalTime(option.durationSeconds)}</span>
          </div>

          {options.length > 1 && (
            <div className="directions-panel__options" role="group" aria-label="Route options">
              {options.map((o, i) => (
                <button
                  key={i}
                  type="button"
                  className={i === selectedOption ? "active" : ""}
                  onClick={() => setSelectedOption(i)}
                >
                  <strong>{formatDuration(o.durationSeconds)}</strong>
                  <span>{o.summary}</span>
                </button>
              ))}
            </div>
          )}

          {/* Start navigation. Uses the real GPS, follows you, advances the
              instruction as you pass each turn and fetches a new route if you
              go off course — see navigation/useNavigation.ts. Disabled for a
              route you can't actually travel live. */}
          <button
            type="button"
            className="directions-panel__start"
            /**
             * Closes the panel as well as starting.
             *
             * The navigation banner is z-index 25 and this panel is 15, so the
             * banner was drawn straight over the top of it — the FROM field
             * ended up half hidden underneath, which is exactly what the
             * reported screenshot shows. The panel also stayed interactive
             * behind the banner, and tapping a step in the list flew the
             * camera away from the driver mid-trip.
             *
             * Nothing in the panel is useful once you are following the route,
             * so it gets out of the way. Ending navigation brings it back.
             */
            onClick={() => {
              startNavigation();
              closePanel();
            }}
            disabled={navActive}
          >
            {navActive ? "Navigating…" : "▶ Start navigation"}
          </button>
          <p className="directions-panel__start-note">
            Uses your device&apos;s location to follow the route and re-route if you go off course. Times are free-flow
            estimates — live traffic isn&apos;t available from a free routing provider, so it isn&apos;t included.
          </p>

          {steps.length > 0 && (
            <div className="directions-panel__steps">
              <div className="directions-panel__steps-head">
                <h3>{steps.length} steps</h3>
                {activeStep !== null && (
                  <button type="button" onClick={() => setActiveStep(null)}>
                    Show whole route
                  </button>
                )}
              </div>
              <ol>
                {steps.map((step, i) => (
                  <li key={i}>
                    {/* A button, not a list item: tapping it flies the map to
                        this manoeuvre and marks it, which is what makes the
                        directions navigable rather than just readable. */}
                    <button
                      type="button"
                      className={i === activeStep ? "active" : undefined}
                      onClick={() => setActiveStep(i === activeStep ? null : i)}
                      aria-current={i === activeStep ? "step" : undefined}
                    >
                      <span className="directions-panel__step-icon" aria-hidden="true">
                        {turnIcon(step.type, step.modifier)}
                      </span>
                      <span className="directions-panel__step-text">
                        <span className="directions-panel__step-instruction">{step.instruction}</span>
                        {(step.distanceMeters > 0 || step.durationSeconds > 0) && (
                          <span className="directions-panel__step-meta">
                            {step.distanceMeters > 0 && formatDistance(step.distanceMeters, units)}
                            {step.distanceMeters > 0 && step.durationSeconds >= 60 && " · "}
                            {step.durationSeconds >= 60 && formatDuration(step.durationSeconds)}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          )}

          <p className="directions-panel__source">
            Route from {route.source} · OpenStreetMap data. Live traffic is not included.
          </p>

          {from && to && (
            <div className="directions-panel__booking">
              <strong>Book a ride</strong>
              <div className="directions-panel__booking-links">
                {bookingLinks(from, to, mode).map((link) => (
                  <a key={link.label} href={link.url} target="_blank" rel="noreferrer">
                    {link.label}
                  </a>
                ))}
              </div>
              <small>These open the provider&apos;s own app or site — GeoIntel doesn&apos;t process bookings itself.</small>
            </div>
          )}
        </>
      )}
    </>
  );

  if (!motionEnabled) {
    if (!isPanelOpen) return null;
    return <div className="directions-panel">{content}</div>;
  }

  return (
    <AnimatePresence>
      {isPanelOpen && (
        <motion.div className="directions-panel" {...panelSlideIn}>
          {content}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
