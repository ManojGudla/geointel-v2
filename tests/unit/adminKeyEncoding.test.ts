import { describe, expect, it, afterEach } from "vitest";
import { fakeReqRes } from "./testUtils";
import { isAdminRequest, providedAdminKey } from "../../api/_lib/adminAuth";
import { adminKeyHeaders } from "../../src/services/adminKeyHeader";
import { gateFailureMessage } from "../../src/features/secret/SecretGate";
import { ApiUnavailableError } from "../../src/services/apiClient";

/**
 * The owner gate said "Couldn't reach the server" on a working connection.
 * fetch() refuses any header value outside Latin-1, so a code with a curly
 * apostrophe (phone keyboards add them), an emoji or Telugu never left the
 * browser. The key now travels percent-encoded and the server decodes it.
 */

const ORIGINAL_KEY = process.env.GEOINTEL_ADMIN_KEY;
afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.GEOINTEL_ADMIN_KEY;
  else process.env.GEOINTEL_ADMIN_KEY = ORIGINAL_KEY;
});

function requestWith(headers: Record<string, string>) {
  const { req } = fakeReqRes({});
  Object.assign(req.headers, headers);
  return req;
}

const LATIN1 = /^[\u0000-ÿ]*$/;

describe("admin key on the wire", () => {
  for (const key of ["manoj’s-key", "మనోజ్2026", "key❤️", "café", "100%-sure", "plain-ascii-key"]) {
    it(`sends and accepts ${JSON.stringify(key)}`, () => {
      const headers = adminKeyHeaders(key);
      // What the browser needs in order to send it at all.
      for (const value of Object.values(headers)) expect(value).toMatch(LATIN1);
      process.env.GEOINTEL_ADMIN_KEY = key;
      expect(isAdminRequest(requestWith(headers))).toBe(true);
    });
  }

  it("still rejects a wrong key sent the new way", () => {
    process.env.GEOINTEL_ADMIN_KEY = "మనోజ్2026";
    expect(isAdminRequest(requestWith(adminKeyHeaders("మనోజ్2027")))).toBe(false);
  });

  it("still accepts a plain key sent without the encoding marker", () => {
    process.env.GEOINTEL_ADMIN_KEY = "plain-ascii-key";
    expect(isAdminRequest(requestWith({ "x-geointel-admin-key": "plain-ascii-key" }))).toBe(true);
  });

  it("treats a marked value that does not decode as no key", () => {
    process.env.GEOINTEL_ADMIN_KEY = "%E0%A4";
    const req = requestWith({ "x-geointel-admin-key": "%E0%A4", "x-geointel-admin-key-encoding": "uri" });
    expect(providedAdminKey(req)).toBeNull();
    expect(isAdminRequest(req)).toBe(false);
  });
});

describe("what the gate says when the check fails", () => {
  it("passes on the server's own message", () => {
    expect(gateFailureMessage(new ApiUnavailableError("Too many admin requests. Please slow down.", "RATE_LIMITED"), true)).toBe(
      "Too many admin requests. Please slow down."
    );
  });

  it("says offline only when offline", () => {
    expect(gateFailureMessage(new Error("Could not reach /api/admin/maintenance."), false)).toMatch(/offline/);
  });

  it("gives the real reason instead of a blanket 'couldn't reach'", () => {
    expect(gateFailureMessage(new Error("/api/admin/maintenance timed out after 20s."), true)).toBe(
      "Couldn't check the code: /api/admin/maintenance timed out after 20s."
    );
  });
});
