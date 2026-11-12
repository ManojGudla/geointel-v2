import { useRef, useState } from "react";
import { useImportStore, IMPORT_COLORS, MAX_LAYERS } from "@/stores/importStore";
import { useMapStore } from "@/stores/mapStore";
import { track } from "@/services/analytics";
import { ImportError, MAX_FILE_BYTES, parseSpatialFile, summarise, viewFor } from "./parseSpatial";
import "./ImportPanel.css";

const ACCEPT = ".geojson,.json,.kml,.csv,application/geo+json,application/json,application/vnd.google-earth.kml+xml,text/csv";

function counts(points: number, lines: number, polygons: number): string {
  const parts = [
    points ? `${points.toLocaleString("en-IN")} point${points === 1 ? "" : "s"}` : "",
    lines ? `${lines.toLocaleString("en-IN")} line${lines === 1 ? "" : "s"}` : "",
    polygons ? `${polygons.toLocaleString("en-IN")} area${polygons === 1 ? "" : "s"}` : "",
  ].filter(Boolean);
  return parts.join(", ");
}

/**
 * "Your data" in the Layers panel: add a GeoJSON, KML or CSV file and see it
 * on the map, with a switch, a colour, a zoom-to and a remove for each.
 *
 * The file is read in this browser tab and goes nowhere else. There is no
 * upload: nothing here calls the server.
 */
export function ImportPanel() {
  const layers = useImportStore((s) => s.layers);
  const add = useImportStore((s) => s.add);
  const remove = useImportStore((s) => s.remove);
  const toggle = useImportStore((s) => s.toggle);
  const setColor = useImportStore((s) => s.setColor);
  const requestCamera = useMapStore((s) => s.requestCamera);
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);

  const read = async (file: File) => {
    setError(null);
    setNotice(null);
    if (useImportStore.getState().layers.length >= MAX_LAYERS) {
      setError(`You can have ${MAX_LAYERS} files on the map at once. Remove one to add another.`);
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError(`${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${MAX_FILE_BYTES / 1024 / 1024} MB.`);
      return;
    }
    setBusy(true);
    try {
      const text = await file.text();
      const parsed = parseSpatialFile(file.name, text);
      const summary = summarise(parsed.features);
      add({ name: file.name, format: parsed.format, features: parsed.features, summary, skipped: parsed.skipped });
      requestCamera(viewFor(summary.bbox));
      setNotice(
        parsed.skipped > 0
          ? `Added ${file.name}. ${parsed.skipped.toLocaleString("en-IN")} record${parsed.skipped === 1 ? " was" : "s were"} left out because ${parsed.skipped === 1 ? "it has" : "they have"} no usable position.`
          : `Added ${file.name}.`
      );
      track("data_imported", { format: parsed.format, resultCount: parsed.features.length });
    } catch (e) {
      // Only the parser's own messages are written for people; anything else
      // would be a stack trace in a sentence.
      setError(e instanceof ImportError ? e.message : `${file.name} could not be read.`);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  const onFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (file) void read(file);
  };

  return (
    <section className="side-panel__group import">
      <h3 className="side-panel__group-title">Your data</h3>
      <div
        className={`import__drop${over ? " import__drop--over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          onFiles(e.dataTransfer.files);
        }}
      >
        <button type="button" className="import__choose" onClick={() => input.current?.click()} disabled={busy}>
          {busy ? "Reading…" : "Add a file"}
        </button>
        <p className="import__hint">GeoJSON, KML or CSV with latitude and longitude. Drop it here or choose it. Up to 10 MB.</p>
        <input
          ref={input}
          type="file"
          accept={ACCEPT}
          className="import__input"
          aria-label="Add a GeoJSON, KML or CSV file to the map"
          onChange={(e) => onFiles(e.target.files)}
        />
      </div>

      {error && (
        <p className="import__error" role="alert">
          {error}
        </p>
      )}
      {notice && !error && (
        <p className="import__notice" role="status">
          {notice}
        </p>
      )}

      {layers.length > 0 && (
        <ul className="import__layers">
          {layers.map((layer) => (
            <li key={layer.id} className="import__layer">
              <label className="import__layer-main">
                <input type="checkbox" checked={layer.visible} onChange={() => toggle(layer.id)} />
                <span className="import__swatch" style={{ background: layer.color }} aria-hidden="true" />
                <span className="import__layer-text">
                  <span className="import__layer-name">{layer.name}</span>
                  <span className="import__layer-meta">
                    {counts(layer.summary.points, layer.summary.lines, layer.summary.polygons)}
                    {layer.summary.fields.length > 0 ? ` · ${layer.summary.fields.slice(0, 4).join(", ")}${layer.summary.fields.length > 4 ? "…" : ""}` : ""}
                  </span>
                </span>
              </label>
              <div className="import__layer-actions">
                <div className="import__colors" role="group" aria-label={`Colour for ${layer.name}`}>
                  {IMPORT_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={`import__color${color === layer.color ? " is-active" : ""}`}
                      style={{ background: color }}
                      aria-label={`Use colour ${color}`}
                      aria-pressed={color === layer.color}
                      onClick={() => setColor(layer.id, color)}
                    />
                  ))}
                </div>
                <button type="button" className="import__action" onClick={() => requestCamera(viewFor(layer.summary.bbox))}>
                  Zoom to
                </button>
                <button type="button" className="import__action" onClick={() => remove(layer.id)} aria-label={`Remove ${layer.name}`}>
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="import__privacy">Read in this browser tab only. Nothing is uploaded, and it is forgotten when you close or reload the page.</p>
    </section>
  );
}
