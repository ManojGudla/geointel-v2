import type { Plugin, ViteDevServer } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";
import fs from "node:fs";
import path from "node:path";

/**
 * Mounts every top-level handler in api/*.ts onto Vite's own dev server.
 *
 * Why this exists: Vercel-style serverless functions and a Vite dev server
 * are normally two separate processes (`vite dev` + `vercel dev`), which is
 * exactly the split that broke local development in the previous version of
 * this project. Each api/<name>.ts file default-exports a handler shaped
 * like `(req: ApiRequest, res: ApiResponse) => void | Promise<void>` — the
 * same shape Vercel's Node runtime uses in production. This plugin adapts
 * Vite's raw connect middleware requests into that shape in dev, so
 * `npm run dev` alone is enough. In production (Vercel), these same files
 * are deployed unchanged as serverless functions — this plugin is dev-only.
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
  const apiDir = path.resolve(process.cwd(), "api");

  return {
    name: "geointel-api-plugin",
    configureServer(devServer) {
      server = devServer;

      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/")) return next();

        const url = new URL(req.url, "http://localhost");
        const routeName = url.pathname.replace(/^\/api\//, "").replace(/\/$/, "");
        const filePath = path.join(apiDir, `${routeName}.ts`);

        if (!fs.existsSync(filePath)) {
          res.statusCode = 404;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ok: false, error: `No API route for /api/${routeName}` }));
          return;
        }

        try {
          const mod = await server.ssrLoadModule(filePath);
          const handler = mod.default as (req: ApiRequest, res: ApiResponse) => unknown;

          if (typeof handler !== "function") {
            throw new Error(`api/${routeName}.ts must have a default export function`);
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
