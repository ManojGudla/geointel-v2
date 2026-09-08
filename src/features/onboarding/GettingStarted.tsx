import { useLocationStore } from "@/stores/locationStore";
import { useSearchStore } from "@/stores/searchStore";
import { useShellStore, type ShellSection } from "@/stores/shellStore";
import { useHelpStore } from "@/stores/helpStore";
import { reverseGeocode } from "@/services/geocode";
import "./GettingStarted.css";

/**
 * What the Place panel shows before anything is selected.
 *
 * This replaces "Search a place or use your current location to see details
 * here." — accurate, and no help at all to the people who couldn't work the
 * app without being walked through it. An empty state is the one screen
 * every single visitor sees, so it's the only reliable place to teach
 * anything: what this tool is, something to click that proves it, and where
 * the rest of the features live.
 *
 * The example places are real coordinates, selected directly rather than
 * round-tripped through a text search — a first click that fails because a
 * volunteer geocoding service is rate-limited is a bad first click.
 */
const EXAMPLES: Array<{ name: string; where: string; lat: number; lon: number }> = [
  { name: "Charminar", where: "Hyderabad, Telangana", lat: 17.361664, lon: 78.474663 },
  { name: "Gateway of India", where: "Mumbai, Maharashtra", lat: 18.921984, lon: 72.834654 },
  { name: "India Gate", where: "New Delhi", lat: 28.612912, lon: 77.229511 },
];

const NEXT_STEPS: Array<{ section: ShellSection; icon: string; title: string; body: string }> = [
  { section: "layers", icon: "🗺️", title: "Data", body: "Change the map style, set the search area, and choose what the map shows." },
  { section: "tools", icon: "📐", title: "Analyze", body: "Measure distances and areas, and score this site for a use." },
  { section: "ai", icon: "🤖", title: "Ask", body: "Ask maNOWj a question in plain language, find things on the map, or generate a report." },
  { section: "travel", icon: "✈️", title: "Plan", body: "Search flights, trains, buses and hotels for wherever you've selected." },
];

export function GettingStarted() {
  const setSelectedLocation = useLocationStore((s) => s.setSelectedLocation);
  const setQuery = useSearchStore((s) => s.setQuery);
  const openSection = useShellStore((s) => s.openSection);
  const openHelp = useHelpStore((s) => s.open);

  const pick = async (example: (typeof EXAMPLES)[number]) => {
    setQuery(`${example.name}, ${example.where}`);
    // Coordinates are known, so this shows something immediately; the
    // reverse lookup only enriches it with the full address afterwards.
    setSelectedLocation({
      lat: example.lat,
      lon: example.lon,
      displayName: `${example.name}, ${example.where}`,
      name: example.name,
      address: {},
      source: "OpenStreetMap / Nominatim",
    });
    try {
      const location = await reverseGeocode(example.lat, example.lon);
      setSelectedLocation({ ...location, name: example.name });
    } catch {
      // The point is already selected and every panel works from it — the
      // richer address is a bonus, not a requirement.
    }
  };

  return (
    <div className="getting-started">
      <section>
        <h3 className="getting-started__lead">Start with a place</h3>
        <p className="getting-started__body">
          Search above, use your location, or click anywhere on the map. Everything in this workspace — evidence, property
          analysis, measurements, AI — works from the place you pick.
        </p>
      </section>

      <section>
        <h4 className="getting-started__label">Try one of these</h4>
        <div className="getting-started__examples">
          {EXAMPLES.map((example) => (
            <button key={example.name} type="button" onClick={() => void pick(example)}>
              <strong>{example.name}</strong>
              <span>{example.where}</span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h4 className="getting-started__label">What else is here</h4>
        <ul className="getting-started__steps">
          {NEXT_STEPS.map((step) => (
            <li key={step.section}>
              <button type="button" onClick={() => openSection(step.section)}>
                <span className="getting-started__step-icon" aria-hidden="true">
                  {step.icon}
                </span>
                <span>
                  <strong>{step.title}</strong>
                  <span>{step.body}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <p className="getting-started__body getting-started__body--quiet">
          Each of these is a button on the rail to the left — this list is only a shortcut.
        </p>
      </section>

      <button type="button" className="getting-started__help" onClick={openHelp}>
        ❓ Open the full guide
      </button>
    </div>
  );
}
