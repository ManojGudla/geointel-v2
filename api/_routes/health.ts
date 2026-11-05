import type { ApiHandler } from "../_lib/http.js";
import { ok } from "../_lib/http.js";
import { getOverpassHealth } from "../_lib/overpass.js";

/**
 * Is the app usable right now - not just "is the server up".
 *
 * This used to answer {status:"online"} unconditionally, so on 2026-11-06 the
 * header showed a green "GIS Online" while every Nearby and What's-here query
 * was failing because the OpenStreetMap mirrors were overloaded. A server
 * that answers is not the same as an app that works.
 *
 * Map-data health comes from the real queries this instance has run recently
 * (see getOverpassHealth), so checking costs nothing and adds no load to the
 * volunteer-run mirrors. Still HTTP 200 when degraded: the API is reachable,
 * and the header distinguishes "limited" from "offline" using the body.
 * The full per-provider breakdown, with live probes, is /api/status.
 */
const handler: ApiHandler = async (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const mapData = getOverpassHealth();
  ok(res, {
    status: mapData.status === "degraded" ? "degraded" : "online",
    timestamp: new Date().toISOString(),
    services: { mapData: mapData.status },
    mapDataCheckedAt: mapData.checkedAt,
  });
};

export default handler;
