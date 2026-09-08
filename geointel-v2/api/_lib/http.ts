import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * Shared request/response shape for every api/*.ts handler.
 *
 * This is structurally identical to what Vercel's Node runtime passes to a
 * serverless function, and to what plugins/vite-plugin-api.ts synthesizes in
 * local dev — so a handler written against these types runs unmodified in
 * both places. We deliberately don't depend on @vercel/node's types here to
 * keep this package installable and testable without pulling in Vercel's
 * runtime.
 */
export type ApiRequest = IncomingMessage & {
  query: Record<string, string | string[]>;
  body: unknown;
};

export type ApiResponse = ServerResponse & {
  status: (code: number) => ApiResponse;
  json: (data: unknown) => void;
};

export type ApiHandler = (req: ApiRequest, res: ApiResponse) => unknown | Promise<unknown>;

export type ApiOk<T> = { ok: true } & T;
export type ApiErr = { ok: false; error: string; code?: string };
export type ApiResult<T> = ApiOk<T> | ApiErr;

export function ok<T extends object>(res: ApiResponse, data: T, status = 200) {
  res.status(status).json({ ok: true, ...data } satisfies ApiOk<T>);
}

export function err(res: ApiResponse, status: number, error: string, code?: string) {
  res.status(status).json({ ok: false, error, code } satisfies ApiErr);
}

export function getQueryParam(req: ApiRequest, key: string): string | undefined {
  const value = req.query[key];
  return Array.isArray(value) ? value[0] : value;
}

export function getClientIp(req: ApiRequest): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0]!.trim();
  return req.socket?.remoteAddress || "unknown";
}
