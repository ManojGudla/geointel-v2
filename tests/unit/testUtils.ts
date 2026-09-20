import { vi } from "vitest";
import type { ApiRequest, ApiResponse } from "../../api/_lib/http";

/**
 * A minimal fake of the (req, res) pair every api/*.ts handler receives -
 * lets us test handlers directly, without spinning up Vite or a real HTTP
 * server, and without touching the network (fetch is mocked per-test).
 */
export function fakeReqRes(query: Record<string, string> = {}) {
  const req = { query, body: undefined, headers: {}, socket: {} } as unknown as ApiRequest;

  let statusCode = 200;
  let jsonBody: unknown = undefined;
  /**
   * Headers are RECORDED, not just counted. Caching correctness is expressed
   * entirely in headers - a response marked public is served to the next
   * visitor by a shared CDN - so a fake that swallowed them would let a test
   * pass while the real thing leaked one person's answer to everyone.
   * Last write wins, exactly like a real ServerResponse.
   */
  const headers = new Map<string, string>();

  const res = {
    status(code: number) {
      statusCode = code;
      return res;
    },
    json(data: unknown) {
      jsonBody = data;
    },
    setHeader: vi.fn((name: string, value: string) => {
      headers.set(String(name).toLowerCase(), String(value));
      return res;
    }),
    getHeader: vi.fn((name: string) => headers.get(String(name).toLowerCase())),
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
    /** Case-insensitive, like a real response. Undefined when never set. */
    header(name: string) {
      return headers.get(name.toLowerCase());
    },
  };
}
