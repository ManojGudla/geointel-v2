#!/usr/bin/env node
// Seeds supabase/seed/kb-documents.json into the kb_documents table.
// Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-kb.mjs
// (or `npm run seed:kb` after setting those in your shell / .env.local and
// loading it, e.g. `node --env-file=.env.local scripts/seed-kb.mjs`)

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (e.g. via .env.local).");
  process.exit(1);
}

const docs = JSON.parse(readFileSync(path.join(__dirname, "..", "supabase", "seed", "kb-documents.json"), "utf-8"));

const client = createClient(url, key, { auth: { persistSession: false } });

const { data: existing, error: fetchError } = await client.from("kb_documents").select("title");
if (fetchError) {
  console.error("Could not read kb_documents - has the migration in supabase/migrations/0001_init.sql been run yet?");
  console.error(fetchError.message);
  process.exit(1);
}

const existingTitles = new Set((existing ?? []).map((d) => d.title));
const toInsert = docs.filter((d) => !existingTitles.has(d.title));

if (toInsert.length === 0) {
  console.log(`All ${docs.length} knowledge-base documents are already seeded. Nothing to do.`);
  process.exit(0);
}

const { error: insertError } = await client.from("kb_documents").insert(toInsert);
if (insertError) {
  console.error("Insert failed:", insertError.message);
  process.exit(1);
}

console.log(`Seeded ${toInsert.length} knowledge-base document(s) (${existingTitles.size} already present).`);
