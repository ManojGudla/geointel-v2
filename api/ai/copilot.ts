/**
 * Explicit entry point for /api/ai/copilot.
 *
 * The catch-all (api/[...path].ts) serves every single-segment route, but
 * Vercel's plain api/ directory matches `[...path]` against exactly ONE
 * segment — verified in production, where /api/health resolved while
 * /api/ai/copilot and /api/admin/maintenance both 404'd. Nested routes
 * therefore need a real file at their own path.
 *
 * The handler itself still lives in api/_routes/ and is still registered in
 * the ROUTES table (which is what the dev server resolves through), so this
 * is purely an entry point — no logic, and no second copy to keep in sync.
 * Four of these plus the catch-all is five functions, well inside the Hobby
 * plan's limit of 12.
 */
export { default } from "../_routes/ai/copilot.js";
