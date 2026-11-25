#!/usr/bin/env node
/**
 * Live acceptance tests for the six agents, against a real deployment.
 *
 *   node scripts/agent-acceptance.mjs https://<your-preview>.vercel.app [docs/agents/TEST_RESULTS.live.md]
 *
 * Runs the agent brief's six scenarios and the multi-agent task against the
 * deployment's real providers (OpenStreetMap, Open-Meteo, the routing
 * provider, Wikidata, OpenRouter) and writes what actually came back. A test
 * passes only on a real 200 answer whose required evidence was retrieved;
 * nothing here is mocked. Seven requests, one at a time, inside the AI
 * limit of 15 a minute. If the preview is protected by Vercel Authentication,
 * run it against a deployment you can open without signing in.
 */
import { writeFileSync } from "node:fs";

const base = (process.argv[2] || "").replace(/\/$/, "");
const out = process.argv[3];
if (!/^https?:\/\//.test(base)) {
  console.error("Usage: node scripts/agent-acceptance.mjs https://<deployment> [output.md]");
  process.exit(2);
}

const HITEC = { lat: 17.4474, lon: 78.3762 };
const CHARMINAR = { lat: 17.3616, lon: 78.4747 };
const AIRPORT = { lat: 17.2403, lon: 78.4294 };

const TESTS = [
  {
    name: "1. Search: an ambiguous place, with alternatives",
    path: "/api/ai/agent",
    body: { kind: "search", anchor: { lat: 17.4156, lon: 78.4347, query: "Banjara Hills" } },
    need: ["Matches found", "Best match"],
  },
  {
    name: "2. GIS: nearby facilities and distances",
    path: "/api/ai/ask",
    body: { request: "Analyse the area within 1 km of here and route to the nearest hospital", anchor: { ...HITEC, radiusMeters: 1000 } },
    need: ["Mapped buildings within 1 km", "Nearest hospital or clinic"],
  },
  {
    name: "3. Property: classification with supporting evidence",
    path: "/api/ai/agent",
    body: { kind: "property", anchor: { ...HITEC, radiusMeters: 250 } },
    need: ["Property classification", "Classification confidence"],
  },
  {
    name: "4. Navigation: a route from the configured routing provider",
    path: "/api/ai/agent",
    body: { kind: "navigation", anchor: { ...HITEC, route: { fromLat: HITEC.lat, fromLon: HITEC.lon, toLat: AIRPORT.lat, toLon: AIRPORT.lon, mode: "car" } } },
    need: ["Route distance", "Route time"],
  },
  {
    name: "5. Travel: current weather and destination information",
    path: "/api/ai/agent",
    body: { kind: "travel", anchor: CHARMINAR },
    need: ["Temperature now", "Place name"],
  },
  {
    name: "6. Make My Trip: an editable two-day plan",
    path: "/api/ai/trip",
    body: { anchor: CHARMINAR, interests: ["attractions", "restaurants", "shopping"], days: 2, stopsPerDay: 3, mode: "car" },
    trip: true,
  },
  {
    name: "7. Multi-agent: Search, GIS, Property and Navigation together",
    path: "/api/ai/ask",
    body: { request: "Evaluate this location for a family home and plan a route to the nearest hospital", anchor: { ...HITEC, query: "HITEC City" } },
    need: ["Nearest hospital or clinic", "Route distance", "Property classification"],
    agents: ["search", "gis", "property", "navigation"],
  },
];

function cell(text) {
  return String(text ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
}

async function run(test) {
  const started = Date.now();
  let status = 0;
  let json = null;
  let error = "";
  try {
    const res = await fetch(base + test.path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(test.body), signal: AbortSignal.timeout(45_000) });
    status = res.status;
    json = await res.json().catch(() => null);
    if (!res.ok) error = json?.error || `HTTP ${status}`;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const ms = Date.now() - started;
  const result = json?.result ?? json?.plan ?? null;
  const evidence = result?.evidence ?? [];
  const problems = [];

  if (!error && test.trip) {
    const stops = (result?.days ?? []).flatMap((d) => d.stops);
    if (stops.length < 2) problems.push(`only ${stops.length} stop(s)`);
    if (stops.some((s) => s.leg === null)) problems.push("a hop was not measured");
  } else if (!error) {
    for (const label of test.need ?? []) {
      const item = evidence.find((e) => e.label.startsWith(label));
      if (!item) problems.push(`no "${label}" evidence`);
      else if (item.kind === "unavailable") problems.push(`"${label}" unavailable: ${item.note ?? ""}`);
    }
    for (const agent of test.agents ?? []) if (!result?.agents?.includes(agent)) problems.push(`agent ${agent} not involved`);
  }
  const pass = !error && problems.length === 0;
  return { test, status, ms, result, evidence, error, problems, pass };
}

const runs = [];
for (const test of TESTS) {
  process.stdout.write(`${test.name} ... `);
  const r = await run(test);
  runs.push(r);
  console.log(r.pass ? `PASS (${r.ms} ms)` : `FAIL (${r.error || r.problems.join("; ")})`);
}

const lines = [
  `# Live agent acceptance results`,
  ``,
  `Run against ${base} on ${new Date().toISOString()} with \`scripts/agent-acceptance.mjs\`. Real providers, nothing mocked.`,
  ``,
  `| Test | Endpoint | HTTP | Time | Result |`,
  `|---|---|---|---|---|`,
  ...runs.map((r) => `| ${cell(r.test.name)} | \`${r.test.path}\` | ${r.status || "-"} | ${(r.ms / 1000).toFixed(1)} s | ${r.pass ? "PASS" : `FAIL: ${cell(r.error || r.problems.join("; "))}`} |`),
  ``,
];
for (const r of runs) {
  lines.push(`## ${r.test.name}`, ``, `**Input:** \`${cell(JSON.stringify(r.test.body))}\``, ``);
  if (r.error) lines.push(`**Error:** ${cell(r.error)}`, ``);
  if (r.result?.summary || r.result?.sections) {
    const text = r.result.sections ? r.result.sections.map((s) => `${s.agent}: ${s.summary}`).join(" / ") : r.result.summary;
    lines.push(`**Answer:** ${cell(text)}`, ``, `**Model:** ${cell(r.result.model)} · **Confidence:** ${cell(r.result.confidence?.level ?? r.result.sections?.map((s) => `${s.agent} ${s.confidence.level}`).join(", "))} · **Sentences removed by the number check:** ${r.result.removedSentences ?? 0}`, ``);
  }
  if (r.result?.days) {
    for (const d of r.result.days) lines.push(`- Day ${d.day} (about ${d.totalMinutes} min): ${d.stops.map((s) => `${s.name}${s.leg ? ` (${s.leg.minutes} min hop)` : " (hop unknown)"}`).join(" → ")}${d.warnings.length ? ` · warnings: ${d.warnings.join(" ")}` : ""}`);
    lines.push(``);
  }
  if (r.evidence.length) {
    lines.push(`| Id | Evidence | Value | Kind | Source | As of |`, `|---|---|---|---|---|---|`);
    for (const e of r.evidence) lines.push(`| ${e.id} | ${cell(e.label)} | ${cell(e.value)} | ${e.kind} | ${cell(e.source)} | ${cell(e.retrievedAt ?? "")} |`);
    lines.push(``);
  }
  lines.push(`**Missing or failed:** ${r.problems.length ? cell(r.problems.join("; ")) : "none"}`, ``);
}

const markdown = lines.join("\n");
if (out) {
  writeFileSync(out, markdown);
  console.log(`\nWrote ${out}`);
} else {
  console.log(`\n${markdown}`);
}
process.exit(runs.every((r) => r.pass) ? 0 : 1);
