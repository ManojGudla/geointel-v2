import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useHelpStore } from "@/stores/helpStore";
import { useFeatureStatusStore } from "@/stores/featureStatusStore";
import { AGENT_DEFINITIONS } from "@/types/ai";
import { useMotionPreference } from "@/hooks/useMotionPreference";
import { overlayFade, panelRise } from "@/lib/motionVariants";
import "./HelpGuide.css";
import { useDialog } from "@/hooks/useDialog";

type Section = "map" | "intelligence" | "agents" | "planning" | "account" | "roadmap";

const SECTIONS: Array<{ id: Section; label: string; icon: string }> = [
  { id: "map", label: "Map & Search", icon: "🗺️" },
  { id: "intelligence", label: "Location Intelligence", icon: "📊" },
  { id: "agents", label: "Ask maNOWj & AI Agents", icon: "✨" },
  { id: "planning", label: "Routing & Nearby", icon: "🧭" },
  { id: "account", label: "Feedback & Your Data", icon: "💬" },
  { id: "roadmap", label: "What's coming next", icon: "🚧" },
];

/**
 * A real, accurate feature guide — every claim here matches something that
 * actually works today (cross-check against README.md before editing this
 * file). The "What's coming next" tab is here on purpose: honest status,
 * not a feature list that overpromises.
 */
export function HelpGuide() {
  const isOpen = useHelpStore((s) => s.isOpen);
  const close = useHelpStore((s) => s.close);
  /*
    Makes this behave like the role="dialog" it declares: Escape closes it,
    focus moves in on open and cycles inside, and goes back to whatever opened
    it on close. See hooks/useDialog.ts — none of that was happening before,
    and Tab walked straight out into the map behind this panel.
  */
  const dialogRef = useDialog({ open: isOpen, onClose: close });
  const [section, setSection] = useState<Section>("map");
  const motionEnabled = useMotionPreference();

  if (!motionEnabled) {
    if (!isOpen) return null;
    return (
      <div className="help-guide-overlay" onClick={close}>
        <div ref={dialogRef} className="help-guide" role="dialog" aria-label="Help & Guide" onClick={(e) => e.stopPropagation()}>
          <HelpGuideBody section={section} setSection={setSection} close={close} />
        </div>
      </div>
    );
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div className="help-guide-overlay" onClick={close} {...overlayFade}>
          <motion.div
            className="help-guide"
            role="dialog"
            aria-label="Help & Guide"
            onClick={(e) => e.stopPropagation()}
            {...panelRise}
          >
            <HelpGuideBody section={section} setSection={setSection} close={close} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function HelpGuideBody({ section, setSection, close }: { section: Section; setSection: (s: Section) => void; close: () => void }) {
  const openFeatureStatus = useFeatureStatusStore((s) => s.open);
  return (
    <>
        <div className="help-guide__head">
          <h2>Help & Guide</h2>
          <button type="button" onClick={close} aria-label="Close help">
            ✕
          </button>
        </div>

        <div className="help-guide__body">
          <nav className="help-guide__nav" aria-label="Help sections">
            {SECTIONS.map((s) => (
              <button key={s.id} type="button" className={section === s.id ? "active" : ""} onClick={() => setSection(s.id)}>
                <span aria-hidden="true">{s.icon}</span> {s.label}
              </button>
            ))}
          </nav>

          <div className="help-guide__content">
            {section === "map" && (
              <>
                <h3>Map & Search</h3>
                <p>Type a place, address, landmark, or postcode into the search bar, or click "Use My Location." Selecting a result centers the map, drops a marker, and loads every intelligence panel for that spot.</p>
                <p>Switch basemaps with the Standard / Satellite / Dark / Terrain buttons above the map — all four are free, keyless tile sources (OpenStreetMap, Esri World Imagery, Esri Dark Gray Canvas, OpenTopoMap). "2D/3D" tilts the camera and — once you're zoomed in close on a city area — renders real extruded building shapes from OpenStreetMap footprint data, not a generic block per building; heights come from OSM tags when available and a labeled estimate otherwise.</p>
                <p><strong>Click any point on the map</strong> — a building, a shop marker, or bare ground — to open a popup with real property information for that exact spot: classification, confidence, and the underlying OpenStreetMap evidence.</p>
                <p>The bottom-left <strong>Distance / Area</strong> toolbar measures the real world: pick a mode, click points on the map, and the running length or area updates live (Undo removes the last point, Clear resets). Also reachable from the command palette (Ctrl/Cmd+K).</p>
                <p>The right-hand panel controls the Analysis Radius (100m–5km) and which GIS layers render as dots on the map (buildings, shops, offices, amenities, and more), with an opacity slider.</p>
              </>
            )}

            {section === "intelligence" && (
              <>
                <h3>Location Intelligence</h3>
                <p>The left panel has five tabs once a location is selected:</p>
                <p><strong>Overview</strong> — address, coordinates, timezone, and Property Intelligence: a classification (Commercial, Residential, Mixed Use, etc.) computed from real GIS evidence, never guessed from the address text. Every result is labeled VERIFIED, INFERRED, or UNAVAILABLE so you always know how much evidence backs it. Below that, an "Official / Authority Intelligence" section (collapsed by default — click to expand) shows the current government officials tied to this location's country, state, district, and city, sourced live from Wikidata. Every name is either backed by a source and a "since" date, or the row plainly says "Unable to verify" — it never guesses a name, and coverage is naturally strongest at the country level and thinner at the district level, since not every country's local officials are tracked on Wikidata.</p>
                <p><strong>Evidence</strong> — the raw GIS counts and category scores behind that classification, with an expandable "why this result" explanation.</p>
                <p><strong>Weather & News</strong> — live current conditions and forecast (Open-Meteo), and news scoped to the selected place's name (Google News).</p>
                <p><strong>Nearby</strong> — 13 categories of real nearby places (restaurants, hospitals, ATMs, transit, and more) sorted by distance.</p>
                <p><strong>Travel</strong> — flights, trains, buses, movies, and hotels, each opening real provider search pages prefilled from the selected location.</p>
              </>
            )}

            {section === "agents" && (
              <>
                <h3>Ask maNOWj & AI Agents</h3>
                <p>Click "✨ Ask maNOWj" (bottom-right of the map) to ask a free-text question about the selected location — it answers only from the real data already loaded (property analysis, GIS evidence, weather, nearby places, and the Official / Authority Intelligence data described in the Location Intelligence tab) plus a knowledge base about how GeoIntel itself works. If you ask about a government official and the app hasn't verified a name for that role, it says so rather than answering from its own memory — officeholders change, and a name it merely "recalls" could be wrong.</p>
                <p>Open <strong>🤖 Ask</strong> in the workspace rail for the AI Agents — six focused agents, each reading the same real on-screen data from its own angle:</p>
                <ul>
                  {AGENT_DEFINITIONS.map((a) => (
                    <li key={a.kind}>
                      <span aria-hidden="true">{a.icon}</span> <strong>{a.label}</strong> — {a.description}
                    </li>
                  ))}
                </ul>
                <p>Every answer says which model wrote it and at what time. That isn't decoration: on the free tier the request goes to a router that picks whichever free model is available at that moment, so running the same agent twice can genuinely give you two different authors of two different standards. If an answer looks weak, "Run again" is worth a try — and the line underneath tells you whether you got a different model the second time.</p>
                <p>Neither Ask maNOWj nor any agent invents facts about a location. Both need a one-time free setup (a Supabase project and an OpenRouter key) — until that's configured, they show a plain "not configured yet" message.</p>
              </>
            )}

            {section === "planning" && (
              <>
                <h3>Routing & Nearby</h3>
                <p>Click "Directions" (or a location's marker) to open the journey panel: set a From/To, pick Car, Walk, or Bike, and get a real route from OSRM with distance, duration, and alternative-route count. "Use My Current Location" reverse-geocodes your GPS position into a real address automatically.</p>
                <p>"Book a ride from this route" opens Uber, Rapido, Ola, or Google Maps with your route prefilled where supported — GeoIntel hands you off to those apps rather than showing invented fares or availability, since no free service provides that data without a paid partnership.</p>
                <p>The <strong>Travel</strong> tab (in the left panel) works the same honest way for flights, trains, buses, movies, and hotels: fill in a route or city and it opens two real providers each — Google Flights & Skyscanner, IRCTC & ConfirmTkt, redBus & AbhiBus, BookMyShow & District, Booking.com & Google Hotels — prefilled where that provider's own search page supports it. No invented prices, seats, or showtimes.</p>
              </>
            )}

            {section === "account" && (
              <>
                <h3>Feedback & Your Data</h3>
                <p>Click "💬 Feedback" in the header any time to leave a star rating, pick a category, and add a comment. It's saved to a real database — you'll see a confirmation only once it's actually saved, and a clear error if it couldn't be.</p>
                <p>GeoIntel doesn't require an account today — you're identified only by an anonymous id stored in your browser, used solely to attribute feedback. No personal data is required to use the app.</p>
              </>
            )}

            {section === "roadmap" && (
              <>
                <h3>What's coming next</h3>
                <p>Built and working today: search & geocoding, the interactive map with 4 basemaps, real 3D building extrusions, distance & area measurement, GIS evidence & property intelligence, click-to-inspect, live weather & news, nearby places, routing & ride-booking handoffs, the Travel Planner, Ask maNOWj & 6 AI agents, the command palette, and feedback.</p>
                <p>Real, planned follow-ups — not silently skipped: Saved Locations & Recent History, PDF/print reports, accounts with Premium and Team features, and a broader Playwright test suite. Each will ship the same way everything above did: real data, real error states, verified before it's called done.</p>
                <button
                  type="button"
                  onClick={() => {
                    close();
                    openFeatureStatus();
                  }}
                >
                  📋 See the full feature-by-feature status
                </button>
              </>
            )}
          </div>
        </div>
    </>
  );
}
