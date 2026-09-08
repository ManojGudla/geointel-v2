import type { Plugin, ViteDevServer } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";

/**
 * Serves the API on Vite's own dev server, using the same route table
 * production uses.
 *
 * Why this exists: Vercel-style serverless functions and a Vite dev server
 * are normally two separate processes (`vite dev` + `vercel dev`), which is
 * exactly the split that broke local development in the previous version of
 * this project. Each handler default-exports a function shaped like
 * `(req: ApiRequest, res: ApiResponse) => void | Promise<void>` — the same
 * shape Vercel's Node runtime uses in production. This plugin adapts Vite's
 * raw connect middleware requests into that shape in dev, so `npm run dev`
 * alone is enough.
 *
 * This used to resolve a request by looking for a matching api/<name>.ts on
 * disk, which mirrored how Vercel discovered functions. It doesn't work that
 * way any more: Vercel's Hobby plan caps a deployment at 12 serverless
 * functions and this project has 17 endpoints, so the handlers now live
 * under api/_routes/ and are dispatched by a single catch-all
 * (api/[...path].ts). Dev resolves through that same api/_routes/index.ts
 * table rather than the filesystem, so an unregistered handler 404s in dev
 * exactly as it would in production instead of working locally and
 * vanishing on deploy.
 */

export type ApiRequest = IncomingMessage & {
  query: Record<string, string | string[]>;
  body: unknown;
};

export type ApiResponse = ServerResponse & {
  status: (code: number) => ApiResponse;
  json: (data: unknown) => void;
};

function decorateResponse(res: ServerResponse): ApiResponse {
  const r = res as ApiResponse;
  r.status = (code: number) => {
    res.statusCode = code;
    return r;
  };
  r.json = (data: unknown) => {
    if (!res.getHeader("Content-Type")) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
    }
    res.end(JSON.stringify(data));
  };
  return r;
}

// Hosts this app actually talks to from the browser: same-origin /api/*
// (which proxies Nominatim, Overpass, Open-Meteo, OSRM, News, and Supabase
// server-side — none of those need a browser-side CSP allowance) plus the
// four keyless raster tile providers MapLibre fetches tiles from directly
// (see src/features/map/basemaps.ts). Keep this list in sync with that
// file, and with the equivalent CSP in vercel.json for production.
const TILE_HOSTS = [
  "https://tile.openstreetmap.org",
  "https://server.arcgisonline.com",
  "https://a.tile.opentopomap.org",
  "https://b.tile.opentopomap.org",
  // RainViewer's weather-radar tiles (see api/_routes/live.ts). The manifest
  // that names the tile host is proxied through /api/live, but the tiles
  // themselves are fetched by MapLibre directly, so the host needs a real
  // allowance here. Wildcarded because the manifest returns whichever cache
  // host is currently serving.
  "https://*.rainviewer.com",
  // NASA GIBS dated satellite imagery (see src/features/timeline/gibs.ts).
  "https://gibs.earthdata.nasa.gov",
];

/**
 * Applied to every dev-server response (not just /api/*), mirroring the
 * production headers in vercel.json as closely as the dev server allows.
 * CSP here is intentionally looser than production — Vite's HMR client
 * needs 'unsafe-eval'/'unsafe-inline' and a websocket connection to itself
 * — so this is "sane defaults for local dev," not the production policy.
 */
function setSecurityHeaders(res: ServerResponse) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      `img-src 'self' data: blob: ${TILE_HOSTS.join(" ")}`,
      `connect-src 'self' ws: wss: ${TILE_HOSTS.join(" ")}`,
      "worker-src 'self' blob:",
      "font-src 'self' https://fonts.gstatic.com",
      "manifest-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
    ].join("; ")
  );
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  if (req.method === "GET" || req.method === "HEAD") return undefined;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  if (!chunks.length) return undefined;
  const raw = Buffer.concat(chunks).toString("utf-8");
  const contentType = req.headers["content-type"] || "";
  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  return raw;
}

export default function apiPlugin(): Plugin {
  let server: ViteDevServer;
  const routesModulePath = path.resolve(process.cwd(), "api/_routes/index.ts");

  return {
    name: "geointel-api-plugin",
    configureServer(devServer) {
      server = devServer;

      server.middlewares.use((_req, res, next) => {
        setSecurityHeaders(res);
        next();
      });

      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/")) return next();

        const url = new URL(req.url, "http://localhost");
        const routeName = url.pathname.replace(/^\/api\//, "").replace(/\/$/, "");

        try {
          const routesMod = await server.ssrLoadModule(routesModulePath);
          const routes = routesMod.ROUTES as Record<string, (req: ApiRequest, res: ApiResponse) => unknown>;
          const handler = routes?.[routeName];

          if (typeof handler !== "function") {
            res.statusCode = 404;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ok: false, error: `No API route for /api/${routeName}`, code: "NOT_FOUND" }));
            return;
          }

          const apiReq = req as ApiRequest;
          apiReq.query = Object.fromEntries(url.searchParams.entries());
          apiReq.body = await readBody(req);

          const apiRes = decorateResponse(res);
          await handler(apiReq, apiRes);
        } catch (error) {
          server.ssrFixStacktrace(error as Error);
          console.error(`[api/${routeName}]`, error);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(
              JSON.stringify({
                ok: false,
                error: "Internal server error while handling this API route.",
              })
            );
          }
        }
      });
    },
  };
}
