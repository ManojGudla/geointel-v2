import { getSupabaseClient } from "./supabase.js";
import { withTimeout } from "./cache.js";

export interface KbHit {
  title: string;
  content: string;
  tags: string[];
}

// Every Copilot/agent request runs this search before it even calls the AI
// provider (api/ai/copilot.ts, api/ai/agent.ts). Keep it well inside those
// endpoints' own budgets (25s server-side to OpenRouter, api/_lib/ai.ts) -
// see withTimeout in cache.ts for why this Supabase call needed a bound at
// all: it previously had none, so a slow/unreachable Supabase project could
// hang the whole AI request regardless of how fast OpenRouter itself was.
const SUPABASE_QUERY_TIMEOUT_MS = 5_000;

/**
 * Full-text search over the product/domain knowledge base (Postgres
 * `tsvector`, no embeddings/vector DB cost - see supabase/migrations/0001_init.sql).
 * Used internally by the Copilot and the AI agents so answers can cite real
 * product documentation instead of the model inventing how the product
 * works. Returns [] (never an error) when Supabase isn't configured or the
 * query finds nothing - "no KB hits" is a normal, expected case, not a
 * failure.
 */
export async function searchKnowledgeBase(query: string, limit = 3): Promise<KbHit[]> {
  const client = getSupabaseClient();
  const trimmed = query.trim();
  if (!client || !trimmed) return [];

  try {
    const { data, error } = await withTimeout(
      client
        .from("kb_documents")
        .select("title, content, tags")
        .textSearch("search_vector", trimmed, { type: "websearch", config: "english" })
        .limit(limit),
      SUPABASE_QUERY_TIMEOUT_MS,
      "kb_documents search"
    );

    if (error) {
      console.error("[kb] search failed", error.message);
      return [];
    }
    return (data ?? []) as KbHit[];
  } catch (error) {
    // Covers a real Supabase error/throw AND now a timeout (see
    // SUPABASE_QUERY_TIMEOUT_MS above) - either way, "no KB hits" is the
    // right degrade: the Copilot/agent still answers from live location
    // data, just without a product-doc citation, instead of the whole
    // request hanging on a search that isn't answering.
    console.error("[kb] search threw", error);
    return [];
  }
}
