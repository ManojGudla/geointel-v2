import type { ApiHandler } from "./_lib/http";
import { ok } from "./_lib/http";

const handler: ApiHandler = async (_req, res) => {
  ok(res, { status: "online", timestamp: new Date().toISOString() });
};

export default handler;
