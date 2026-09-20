import { AsyncPanel } from "@/components/AsyncPanel";
import { TrustBadge } from "@/components/TrustBadge";
import { useOfficials } from "./useOfficials";
import { useLocationStore } from "@/stores/locationStore";
import type { OfficialEntry, OfficialLevel } from "@/services/officials";
import "./OfficialsPanel.css";

const LEVEL_ORDER: OfficialLevel[] = ["country", "state", "district", "city"];
const LEVEL_HEADING: Record<OfficialLevel, string> = { country: "Country", state: "State / Province", district: "District / County", city: "City" };

/** ISO 3166-1 alpha-2 -> flag emoji, via the two Unicode regional indicator symbols. */
function flagEmoji(iso2?: string): string | null {
  if (!iso2 || iso2.length !== 2) return null;
  const codePoints = [...iso2.toUpperCase()].map((c) => 0x1f1e6 + (c.charCodeAt(0) - 65));
  if (codePoints.some((cp) => cp < 0x1f1e6 || cp > 0x1f1ff)) return null;
  return String.fromCodePoint(...codePoints);
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function OfficialRow({ entry }: { entry: OfficialEntry }) {
  return (
    <div className={`officials-panel__row officials-panel__row--${entry.status}`}>
      <div className="officials-panel__row-head">
        <span className="officials-panel__role">{entry.role}</span>
        <TrustBadge trust={entry.status} />
      </div>
      {entry.status === "verified" ? (
        <>
          <p className="officials-panel__name">{entry.name}</p>
          <p className="officials-panel__meta">
            Source:{" "}
            {entry.sourceUrl ? (
              <a href={entry.sourceUrl} target="_blank" rel="noreferrer">
                {entry.sourceLabel}
              </a>
            ) : (
              entry.sourceLabel
            )}
            {entry.since && formatDate(entry.since) ? ` · In office since ${formatDate(entry.since)}` : ""}
          </p>
        </>
      ) : (
        <p className="officials-panel__unavailable">Unable to verify{entry.note ? `: ${entry.note}` : "."}</p>
      )}
    </div>
  );
}

/**
 * Official / Authority Intelligence - the current government officials tied
 * to the selected location's country/state/district/city, sourced live from
 * Wikidata (see api/officials.ts). Every entry is either a sourced,
 * verified statement or an explicit "Unable to verify" - this panel never
 * shows a name it can't back with a source, and never hides that a level
 * simply isn't covered yet (district-level coverage especially is
 * genuinely thin worldwide).
 */
export function OfficialsPanel() {
  const query = useOfficials();
  const countryCode = useLocationStore((s) => s.selectedLocation?.address.countryCode);
  const fetchedAt = query.dataUpdatedAt ? new Date(query.dataUpdatedAt).toLocaleString() : null;
  const flag = flagEmoji(countryCode);

  return (
    <details className="officials-panel">
      <summary className="officials-panel__summary">
        Official / Authority Intelligence
        {flag ? <span className="officials-panel__summary-flag">{flag}</span> : null}
      </summary>
      <AsyncPanel
        query={query}
        label="Official & authority intelligence"
        idleMessage="Select a location to see the officials connected to it."
        isEmpty={(entries) => entries.length === 0}
        emptyMessage="No administrative levels could be resolved for this location."
      >
        {(entries) => (
          <>
            {LEVEL_ORDER.filter((level) => entries.some((e) => e.level === level)).map((level) => {
              const rows = entries.filter((e) => e.level === level);
              const levelLabel = rows[0]!.levelLabel;
              return (
                <section key={level} className="officials-panel__level">
                  <h3>
                    {level === "country" && flag ? `${flag} ` : ""}
                    {LEVEL_HEADING[level]}: {levelLabel}
                  </h3>
                  {rows.map((entry, i) => (
                    <OfficialRow key={`${entry.role}-${i}`} entry={entry} />
                  ))}
                </section>
              );
            })}
            {fetchedAt && <p className="officials-panel__verified-at">Live-checked: {fetchedAt}</p>}
          </>
        )}
      </AsyncPanel>
    </details>
  );
}
