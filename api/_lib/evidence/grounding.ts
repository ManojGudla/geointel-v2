import type { AgentConfidence, AgentFinding, AgentKind, EvidenceItem } from "../../../src/types/ai.js";
import { AGENT_TOOLS, type ToolOutcome } from "./gather.js";

/** The exact sentence the agent brief asks for when the evidence cannot carry an answer. */
export const INSUFFICIENT = "Insufficient verified data to provide a reliable conclusion.";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "25 Nov 2026, 07:30 UTC": the form the model and the reader both see. */
export function asOfLabel(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${hh}:${mm} UTC`;
}

/**
 * The evidence as the model sees it: one line per item, with its id.
 * Labels and values were cleaned when the items were made (gather.ts), and
 * the whole table is fenced as data by the caller.
 */
export function evidenceTable(items: EvidenceItem[]): string {
  return items
    .map((item) => {
      const asOf = asOfLabel(item.retrievedAt);
      return [item.id, item.label, item.value, item.kind, item.source, asOf ? `as of ${asOf}` : "", item.note ?? ""]
        .filter((part) => part !== "")
        .join(" | ");
    })
    .join("\n");
}

const NUMBER = /\d[\d,]*(?:\.\d+)?/g;
const CITATION = /\s*[[(]\s*E\d+(?:\s*[,;]\s*E\d+)*\s*[\])]/g;

/** Every number written in a piece of text, signs and thousands separators dropped. */
export function numbersIn(text: string): number[] {
  return (text.match(NUMBER) ?? [])
    .map((raw) => Number(raw.replace(/,/g, "")))
    .filter((n) => Number.isFinite(n));
}

/**
 * The numbers an answer may use: every number written in the evidence's
 * labels, values and notes, plus each one rounded to a whole number and to
 * one decimal, since "4.25 km" may fairly be "4.3 km".
 *
 * As-of dates and times are not in this set. If they were, "25 Nov" would
 * let "25 minutes" through. They are accepted only written out the way the
 * evidence writes them (see timeFragments).
 */
export function allowedNumbers(items: EvidenceItem[]): Set<number> {
  const allowed = new Set<number>();
  for (const item of items) {
    const text = [item.label, item.value, item.note ?? ""].join(" ");
    for (const n of numbersIn(text)) {
      allowed.add(n);
      allowed.add(Math.round(n));
      allowed.add(Number(n.toFixed(1)));
    }
  }
  return allowed;
}

/**
 * The as-of dates and times in the evidence, in the forms an answer may
 * quote them: "25 Nov 2026, 07:30 UTC", "07:30 UTC", "25 Nov 2026", "25 Nov".
 * Longest first, so the full form is taken out before its parts.
 */
export function timeFragments(items: EvidenceItem[]): string[] {
  const fragments = new Set<string>();
  for (const item of items) {
    const label = asOfLabel(item.retrievedAt);
    if (!label) continue;
    const [date, time] = label.split(", ");
    fragments.add(label);
    if (time) fragments.add(time).add(time.replace(" UTC", ""));
    if (date) fragments.add(date).add(date.split(" ").slice(0, 2).join(" "));
  }
  return [...fragments].sort((a, b) => b.length - a.length);
}

function withoutTimes(sentence: string, fragments: string[]): string {
  let out = sentence;
  for (const fragment of fragments) out = out.split(fragment).join(" ");
  return out;
}

function sentencesOf(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .trim()
    // "…4 hospitals. [E3]" -> "…4 hospitals [E3]." so the citation stays with its sentence.
    .replace(/([.!?])((?:\s*[[(]\s*E\d+(?:\s*[,;]\s*E\d+)*\s*[\])])+)/g, "$2$1")
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'(\[])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export interface CheckedAnswer {
  findings: AgentFinding[];
  summary: string;
  /** Sentences dropped because they used a number the evidence does not hold. */
  removed: number;
}

/**
 * Keeps only the sentences the evidence can carry.
 *
 * A sentence that writes any number not found in the evidence is dropped,
 * whole. That is blunt on purpose: a model asked to use only the data still
 * converts units, adds things up, or remembers a figure, and a reader cannot
 * tell those numbers from the real ones. Citations like [E3] are collected
 * into `evidenceIds` (unknown ids are ignored) and taken out of the text.
 * A sentence with no citation and no number is kept as interpretation.
 */
export function checkAnswer(text: string, items: EvidenceItem[]): CheckedAnswer {
  const known = new Set(items.map((item) => item.id));
  const allowed = allowedNumbers(items);
  const times = timeFragments(items);
  const findings: AgentFinding[] = [];
  let removed = 0;

  for (const sentence of sentencesOf(text)) {
    const ids = [...sentence.matchAll(CITATION)].flatMap((m) => m[0].match(/E\d+/g) ?? []).filter((id) => known.has(id));
    const clean = sentence.replace(CITATION, "").replace(/\s+([.,;:!?])/g, "$1").trim();
    if (!clean || /^[.,;:!?]+$/.test(clean)) continue;
    if (numbersIn(withoutTimes(clean, times)).some((n) => !allowed.has(n))) {
      removed += 1;
      continue;
    }
    findings.push({ text: clean, evidenceIds: [...new Set(ids)] });
  }

  return { findings, summary: findings.map((f) => f.text).join(" "), removed };
}

const STATUS_WEIGHT = { ok: 1, partial: 0.5, failed: 0 } as const;

/**
 * How sure an answer can be, worked out from which sources answered - never
 * from the model, which has no way to know.
 *
 * Each source an agent cannot do without scores 1 if it answered in full,
 * 0.5 if partly (Overpass stopped early, an older saved copy) and 0 if not.
 * The average decides: 0 is "insufficient" (the model is not asked at all),
 * under 0.5 "low", anything short of full marks "medium", and full marks
 * "high" only if the optional sources answered too.
 */
export function confidenceFor(kind: AgentKind, outcomes: ToolOutcome[]): AgentConfidence {
  const { required } = AGENT_TOOLS[kind];
  const statusOf = (tool: string) => outcomes.find((o) => o.tool === tool)?.status ?? "failed";
  const score = required.reduce((sum, tool) => sum + STATUS_WEIGHT[statusOf(tool)], 0) / required.length;
  const problems = outcomes.filter((o) => o.status !== "ok" && o.problem).map((o) => o.problem!);
  const optionalTrouble = outcomes.some((o) => !required.includes(o.tool) && o.status !== "ok");

  if (score === 0) return { level: "insufficient", reason: problems.join(" ") || "The sources this agent needs did not answer." };
  if (score < 0.5) return { level: "low", reason: problems.join(" ") };
  if (score < 1 || optionalTrouble) return { level: "medium", reason: problems.join(" ") };
  return { level: "high", reason: "Every source this agent uses answered in full." };
}

/** The distinct sources behind the evidence that was actually obtained. */
export function sourcesOf(items: EvidenceItem[]): string[] {
  return [...new Set(items.filter((item) => item.kind !== "unavailable").map((item) => item.source))];
}
