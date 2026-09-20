import { useState } from "react";
import { useMapStore } from "@/stores/mapStore";
import { formatCoordinateLabel, formatDms } from "@/features/search/coordinateSearch";
import "./CoordinateReadout.css";

/**
 * Map centre coordinates, in both formats a GIS user expects, with the zoom
 * level beside them.
 *
 * Two reasons this is here rather than in a panel. It's the readout every
 * serious mapping tool keeps permanently on screen, so its absence is
 * conspicuous to exactly the audience being pitched. And it closes the loop
 * on coordinate search: paste a pair in, read a pair out, copy it straight
 * back to somebody else in whichever notation they use.
 */
export function CoordinateReadout() {
  const [lon, lat] = useMapStore((s) => s.center);
  const zoom = useMapStore((s) => s.zoom);
  const [copied, setCopied] = useState(false);

  const decimal = formatCoordinateLabel({ lat, lon });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(decimal);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access can be refused (insecure context, permission
      // policy). Nothing is broken - the coordinates are on screen to read.
      setCopied(false);
    }
  };

  return (
    <button
      type="button"
      className="coordinate-readout"
      onClick={copy}
      title="Copy the centre coordinates to your clipboard"
      aria-label={`Map centre ${decimal}, zoom ${zoom.toFixed(1)}. Click to copy.`}
    >
      <span className="coordinate-readout__decimal">{copied ? "Copied ✓" : decimal}</span>
      <span className="coordinate-readout__dms">{formatDms({ lat, lon })}</span>
      <span className="coordinate-readout__zoom">z{zoom.toFixed(1)}</span>
    </button>
  );
}
