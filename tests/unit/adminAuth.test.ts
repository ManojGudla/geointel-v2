import { describe, expect, it, afterEach } from "vitest";
import { fakeReqRes } from "./testUtils";
import { isAdminConfigured, isAdminRequest } from "../../api/_lib/adminAuth";

const ORIGINAL_KEY = process.env.GEOINTEL_ADMIN_KEY;

describe("api/_lib/adminAuth", () => {
  afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.GEOINTEL_ADMIN_KEY;
    else process.env.GEOINTEL_ADMIN_KEY = ORIGINAL_KEY;
  });

  it("reports not configured when GEOINTEL_ADMIN_KEY is unset", () => {
    delete process.env.GEOINTEL_ADMIN_KEY;
    expect(isAdminConfigured()).toBe(false);
  });

  it("reports configured once GEOINTEL_ADMIN_KEY is set", () => {
    process.env.GEOINTEL_ADMIN_KEY = "correct-horse-battery-staple";
    expect(isAdminConfigured()).toBe(true);
  });

  it("rejects any request when no key is configured - never 'everyone is admin'", () => {
    delete process.env.GEOINTEL_ADMIN_KEY;
    const result = fakeReqRes({});
    result.req.headers["x-geointel-admin-key"] = "anything";
    expect(isAdminRequest(result.req)).toBe(false);
  });

  it("rejects a request with no admin key header", () => {
    process.env.GEOINTEL_ADMIN_KEY = "correct-horse-battery-staple";
    const result = fakeReqRes({});
    expect(isAdminRequest(result.req)).toBe(false);
  });

  it("rejects a request with the wrong key", () => {
    process.env.GEOINTEL_ADMIN_KEY = "correct-horse-battery-staple";
    const result = fakeReqRes({});
    result.req.headers["x-geointel-admin-key"] = "wrong-guess";
    expect(isAdminRequest(result.req)).toBe(false);
  });

  it("rejects a key that's a prefix/suffix of the real one (not just a naive substring check)", () => {
    process.env.GEOINTEL_ADMIN_KEY = "correct-horse-battery-staple";
    const result = fakeReqRes({});
    result.req.headers["x-geointel-admin-key"] = "correct-horse-battery-stapl";
    expect(isAdminRequest(result.req)).toBe(false);
  });

  it("accepts a request with the exact correct key", () => {
    process.env.GEOINTEL_ADMIN_KEY = "correct-horse-battery-staple";
    const result = fakeReqRes({});
    result.req.headers["x-geointel-admin-key"] = "correct-horse-battery-staple";
    expect(isAdminRequest(result.req)).toBe(true);
  });
});
