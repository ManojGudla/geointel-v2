import type { ApiHandler } from "../_lib/http.js";
import { ok } from "../_lib/http.js";

const handler: ApiHandler = async (_req, res) => {
  ok(res, { status: "online", timestamp: new Date().toISOString() });
};

export default handler;
