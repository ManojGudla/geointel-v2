import { track } from "@/services/analytics";
import { downloadText, exportFileName, placesToCsv, placesToGeoJson, type ExportMeta, type ExportPlace } from "./placesExport";
import "./ExportButtons.css";

interface Props {
  places: ExportPlace[];
  meta: ExportMeta;
}

/**
 * "Download: CSV · GeoJSON" under a list of places.
 *
 * The lists on screen are capped (the first 20 or 25, so a phone is not
 * scrolling forever), but the download is everything that was found, which is
 * what somebody taking the data elsewhere wants.
 */
export function ExportButtons({ places, meta }: Props) {
  if (places.length === 0) return null;

  const save = (format: "csv" | "geojson") => {
    const text = format === "csv" ? placesToCsv(places) : placesToGeoJson(places, meta);
    downloadText(exportFileName(meta.title, format), format === "csv" ? "text/csv" : "application/geo+json", text);
    track("results_exported", { format, resultCount: places.length });
  };

  return (
    <div className="export-buttons" role="group" aria-label={`Download these ${places.length} places`}>
      <span className="export-buttons__label">Download all {places.length}:</span>
      <button type="button" onClick={() => save("csv")} title="For Excel or Google Sheets">
        CSV
      </button>
      <button type="button" onClick={() => save("geojson")} title="For QGIS, ArcGIS, geojson.io or code">
        GeoJSON
      </button>
    </div>
  );
}
