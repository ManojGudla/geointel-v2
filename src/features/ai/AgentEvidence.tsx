import { useId, useState } from "react";
import type { AgentFinding, AgentResult, EvidenceItem } from "@/types/ai";
import { formatAiText } from "@/lib/formatAiText";
import "./AgentEvidence.css";

const KIND_LABEL: Record<EvidenceItem["kind"], string> = {
  retrieved: "Verified data",
  computed: "Computed",
  unavailable: "Unavailable",
};

const CONFIDENCE_LABEL = { high: "High", medium: "Medium", low: "Low", insufficient: "Not enough data" } as const;

function asOf(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function seconds(ms: number): string {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

/**
 * Each piece of evidence with what it is (verified data, computed,
 * unavailable), where it came from and when. Used under agent answers and
 * under Copilot answers.
 */
export function EvidenceList({ items, highlight = null, id }: { items: EvidenceItem[]; highlight?: string | null; id?: string }) {
  return (
    <ul className="agent-evidence__list" id={id}>
      {items.map((item) => {
        const when = asOf(item.retrievedAt);
        return (
          <li key={item.id} className={`agent-evidence__item agent-evidence__item--${item.kind}${highlight === item.id ? " is-highlighted" : ""}`}>
            <span className="agent-evidence__id">{item.id}</span>
            <span className="agent-evidence__label">{item.label}</span>
            <span className="agent-evidence__value">{item.value}</span>
            <span className="agent-evidence__meta">
              <span className={`agent-evidence__kind agent-evidence__kind--${item.kind}`}>{KIND_LABEL[item.kind]}</span> · {item.source}
              {when ? ` · as of ${when}` : ""}
            </span>
            {item.note && <span className="agent-evidence__note">{item.note}</span>}
          </li>
        );
      })}
    </ul>
  );
}

/** Sentences with a chip per piece of evidence they cite; tapping a chip shows it. */
export function Findings({ findings, onCite, listId }: { findings: AgentFinding[]; onCite: (id: string) => void; listId?: string }) {
  return (
    <p className="agent-card__result">
      {findings.map((finding, i) => (
        <span key={i}>
          {formatAiText(finding.text)}
          {finding.evidenceIds.map((id) => (
            <button key={id} type="button" className="agent-evidence__chip" onClick={() => onCite(id)} aria-controls={listId} aria-label={`Show evidence ${id}`}>
              {id}
            </button>
          ))}{" "}
        </span>
      ))}
    </p>
  );
}

/** The notice for sentences the number check removed. */
export function removedNotice(count: number | undefined): string | null {
  if (!count) return null;
  return count === 1
    ? "1 sentence was removed because it used a number that is not in the evidence."
    : `${count} sentences were removed because they used numbers that are not in the evidence.`;
}

/**
 * An agent's answer laid out so every part says what it is.
 *
 * The sentences are the model's reading, and are labelled that way. Each
 * sentence that states a fact carries chips naming the evidence it rests on;
 * the evidence list underneath says, item by item, whether it is a
 * provider's own value, something this app computed, or unavailable, with
 * the source and when it was retrieved. Confidence comes from which sources
 * answered, not from the model.
 */
export function AgentEvidence({ result }: { result: AgentResult }) {
  // With no written answer the evidence IS the result, so it starts open.
  const [open, setOpen] = useState(!!result.aiUnavailable);
  const [highlight, setHighlight] = useState<string | null>(null);
  const listId = useId();
  const evidence = result.evidence ?? [];
  const findings = result.findings ?? [];

  const show = (id: string) => {
    setOpen(true);
    setHighlight(id);
  };

  return (
    <div className="agent-evidence">
      {result.confidence && (
        <p className={`agent-evidence__confidence agent-evidence__confidence--${result.confidence.level}`}>
          <strong>Confidence: {CONFIDENCE_LABEL[result.confidence.level]}.</strong> {result.confidence.reason}
        </p>
      )}

      {result.aiUnavailable ? (
        /* No AI interpretation to label: say why, and point at the facts. */
        <p className="agent-evidence__unavailable" role="status">
          {result.aiUnavailable} The facts this agent checked are below.
        </p>
      ) : (
        <>
          <p className="agent-evidence__caption">AI interpretation of the evidence</p>
          {findings.length > 0 ? (
            <Findings findings={findings} onCite={show} listId={listId} />
          ) : (
            <p className="agent-card__result">{formatAiText(result.summary)}</p>
          )}
        </>
      )}

      {removedNotice(result.removedSentences) && <p className="agent-evidence__removed">{removedNotice(result.removedSentences)}</p>}

      {evidence.length > 0 && (
        <details className="agent-evidence__details" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
          <summary>Evidence ({evidence.length})</summary>
          <EvidenceList items={evidence} highlight={highlight} id={listId} />
        </details>
      )}

      {result.steps && result.steps.length > 0 && (
        <details className="agent-evidence__details">
          <summary>How this answer was made</summary>
          <ol className="agent-evidence__steps">
            {result.steps.map((step, i) => (
              <li key={i} className={`agent-evidence__step agent-evidence__step--${step.status}`}>
                {step.step}: {step.status === "ok" ? "done" : step.status === "partial" ? "partly done" : "failed"}
                {step.ms > 0 ? `, ${seconds(step.ms)}` : ""}
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}
