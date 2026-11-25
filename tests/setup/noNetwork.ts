/**
 * Unit tests never reach the internet.
 *
 * A test that forgets to stub a provider used to pass on a machine with no
 * network (the call failed fast) and time out in CI (the call went to the
 * real Overpass mirrors). Now any real request fails at once, everywhere,
 * with a message naming the address. Tests stub fetch themselves
 * (vi.stubGlobal) or replace the route modules; requests to this machine are
 * allowed.
 */
const realFetch = globalThis.fetch;

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (/^https?:\/\//i.test(url) && !/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(url)) {
    throw new TypeError(`Unit tests may not reach the network; stub this request: ${url.slice(0, 120)}`);
  }
  return realFetch(input as RequestInfo, init);
}) as typeof fetch;
