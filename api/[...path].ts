import type { ApiHandler } from "./_lib/http.js";
import { err } from "./_lib/http.js";
import { ROUTES, routeKeyFromUrl } from "./_routes/index.js";

/**
 * The entire API, as one Vercel serverless function.
 *
 * Vercel counts each file under api/ as a separate function and the Hobby
 * plan allows 12 per deployment; this project has 17 endpoints, so deploying
 * them as individual files failed with "No more than 12 Serverless Functions
 * can be added to a Deployment on the Hobby plan" and shipped a frontend
 * with no API behind it. Everything now lives under api/_routes/ (the
 * underscore keeps Vercel from treating those as entry points) and this
 * catch-all dispatches to them - one function, no ceiling on how many
 * endpoints the app can have.
 *
 * The handlers themselves are unchanged: each still default-exports the same
 * (req, res) function it did as a standalone file, so this is purely a
 * change of how they're reached, not of what they do.
 */
const handler: ApiHandler = async (req, res) => {
  const key = routeKeyFromUrl(req.url);
  /**
   * `Object.hasOwn`, not `ROUTES[key]`.
   *
   * ROUTES is an object literal, so a plain lookup also finds everything on
   * Object.prototype. `/api/toString` returned a truthy value, passed the 404
   * check, and then called `Object.prototype.toString(req, res)` - which
   * returns a string and never writes a response, so the request hung until
   * the platform killed the function. `/api/__proto__` reached the call and
   * threw "route is not a function".
   */
  const route = Object.hasOwn(ROUTES, key) ? ROUTES[key] : undefined;

  if (typeof route !== "function") {
    return err(res, 404, `No API route for /api/${key}`, "NOT_FOUND");
  }

  /**
   * The last line of defence. Every handler has its own try/catch, but a throw
   * outside one - a bad query string reaching code above the try - became a
   * raw platform 500 with no JSON body, and the client parses every response
   * as JSON. The dev middleware already wrapped handlers this way; production
   * did not, so this class of bug was invisible locally.
   */
  try {
    return await route(req, res);
  } catch (error) {
    console.error(`[api/${key}] unhandled`, error instanceof Error ? error.message : error);
    if (!res.headersSent) return err(res, 500, "Something went wrong handling this request.");
    return undefined;
  }
};

export default handler;
