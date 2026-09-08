import { vi } from "vitest";
import type { ApiRequest, ApiResponse } from "../../api/_lib/http";

/**
 * A minimal fake of the (req, res) pair every api/*.ts handler receives —
 * lets us test handlers directly, without spinning up Vite or a real HTTP
 * server, and without touching the network (fetch is mocked per-test).
 */
export function fakeReqRes(query: Record<string, string> = {}) {
  const req = { query, body: undefined, headers: {}, socket: {} } as unknown as ApiRequest;

  let statusCode = 200;
  let jsonBody: unknown = undefined;

  const res = {
    status(code: number) {
      statusCode = code;
      return res;
    },
    json(data: unknown) {
      jsonBody = data;
    },
    setHeader: vi.fn(),
    getHeader: vi.fn(),
  } as unknown as ApiResponse;

  return {
    req,
    res,
    get statusCode() {
      return statusCode;
    },
    get body() {
      return jsonBody;
    },
  };
}
