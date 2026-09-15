/**
 * Every AI surface in this app (Copilot answers, agent result cards) renders
 * model output as plain text — `<p>{content}</p>`, no markdown renderer (see
 * CopilotPanel.tsx, AgentCard.tsx). The system prompts (api/ai/copilot.ts,
 * api/ai/agent.ts) now explicitly tell the model never to use markdown or
 * show its reasoning, but OpenRouter's free tier randomly routes across many
 * different underlying models, and not every one of them reliably follows
 * that instruction — some still emit "**bold**", bullet/numbered lists, or a
 * leaked "Here's my thinking process..." preamble. Rather than trust every
 * random free model to comply perfectly, this is a defense-in-depth pass
 * that cleans up the common artifacts client-side before display, so a
 * non-compliant response still reads as a normal sentence instead of raw
 * markdown syntax or a visible chain-of-thought dump.
 */
/**
 * A model talking about its instructions instead of answering.
 *
 * Two families, and the second is why the first was not enough. This ran on
 * the live site against nvidia/nemotron-3-super-120b-a12b:free and the card
 * opened with:
 *
 *   "We need to output a short result card for a real person to read,
 *    focusing purely on GIS evidence counts and category scores... No
 *    markdown, no bold, no lists, no headers. 3-5 plain flowing sentences."
 *
 * — the system prompt, paraphrased back as the answer. The old guard matched
 * a short list of opener phrases ("Let me analyze", "Here's my thinking
 * process") and "We need to" was simply not on it. Chasing openers one at a
 * time is a losing game: every model paraphrases differently.
 *
 * So the second family matches on SUBJECT rather than phrasing. A sentence
 * about markdown, bullet lists, sentence counts or "the result card" is a
 * sentence about how to write the answer, not about the place — no genuine
 * description of a neighbourhood mentions headers. That generalises across
 * models in a way an opener list cannot.
 */
/** A sentence that announces what the model is about to do. */
const PLANNING_OPENER =
  /^(?:okay|ok|alright|right|so|now|first|hmm)\b[,:]?\s|^(?:we|i)\s+(?:need|have|want|should|must|will|'?ll|am going)\b|^let(?:'?s| me)\b|^the user\s+(?:wants|is asking|asked|needs)\b|^my task\b|^here'?s (?:a |my )?(?:thinking|plan|approach)\b|^step\s*\d+\b|^(?:producing|writing|drafting|generating|creating|outputting)\b/i;

/** A sentence about how the answer should be written rather than about the place. */
const ABOUT_THE_FORMAT =
  /\b(?:no markdown|avoid markdown|no bold|no lists?|no headers?|no bullet|plain flowing sentence|flowing sentences|result card|\d\s*[-–]\s*\d\s+(?:plain\s+)?(?:flowing\s+)?sentences|use only (?:the )?(?:current|provided|given|supplied)|never invent|do not (?:use|invent|include)|must not (?:use|invent|include))\b/i;

const looksLikePlanning = (sentence: string) => PLANNING_OPENER.test(sentence) || ABOUT_THE_FORMAT.test(sentence);

/** Splits on sentence ends, keeping the terminator with its sentence. */
function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).filter((s) => s.trim() !== "");
}

/** How far into a response a leaked preamble is allowed to run. */
const PREAMBLE_WINDOW = 6;

export function stripLeakedReasoning(raw: string): string {
  // Explicit thinking blocks first — some models emit these verbatim, and an
  // unclosed opener means everything after it is reasoning.
  const text = raw.replace(/<(think|thinking|reasoning)>[\s\S]*?<\/\1>/gi, " ").replace(/<(?:think|thinking|reasoning)>[\s\S]*$/i, " ").trim();

  const parts = sentences(text);

  /*
    The first sentence decides whether any stripping happens at all.

    An earlier version walked forward while each sentence looked like
    planning and stopped at the first that didn't — which its own test
    caught: the live leak's fourth sentence ("Use only current location
    data") wasn't recognised, so the walk halted there and shipped that
    sentence to the reader as if it were the answer. Requiring only the
    OPENING sentence to look like planning, then removing everything up to
    the last planning-looking sentence nearby, tolerates an unrecognised
    line in the middle of the preamble without ever touching a response
    that starts with a real answer.
  */
  if (parts.length === 0 || !looksLikePlanning(parts[0]!.trim())) return text;

  let lastMeta = 0;
  for (let i = 1; i < Math.min(parts.length, PREAMBLE_WINDOW); i += 1) {
    if (looksLikePlanning(parts[i]!.trim())) lastMeta = i;
  }

  const kept = parts.slice(lastMeta + 1).join(" ").trim();
  // Never trade a bad answer for no answer. An empty card is a worse
  // outcome than a visibly rambling one, and the reader can at least judge
  // rambling for themselves — the model line underneath now says who wrote it.
  return kept.length >= 60 ? kept : text;
}

export function formatAiText(raw: string): string {
  let text = stripLeakedReasoning(raw);

  // A leaked preamble sometimes ends with the model announcing its real
  // answer instead of just starting it.
  const finalAnswerMarker = /(?:^|\n)\s*(?:final answer|so the answer is|in short|to summarize)[:.]\s*/i.exec(text);
  if (finalAnswerMarker && finalAnswerMarker.index > 20) {
    text = text.slice(finalAnswerMarker.index + finalAnswerMarker[0].length);
  }

  // Markdown emphasis: **bold**, __bold__, *italic*, _italic_ -> plain text.
  text = text.replace(/\*\*\*(.+?)\*\*\*/g, "$1");
  text = text.replace(/\*\*(.+?)\*\*/g, "$1");
  text = text.replace(/__(.+?)__/g, "$1");
  text = text.replace(/(?<![\w*])\*([^*\n]+)\*(?![\w*])/g, "$1");
  text = text.replace(/(?<![\w_])_([^_\n]+)_(?![\w_])/g, "$1");

  // Headers ("### Title") -> just the title text.
  text = text.replace(/^#{1,6}\s+/gm, "");

  // Bullet / numbered list markers at the start of a line -> a plain
  // sentence separator, so "- 7 petrol\n- 5 parks" reads as one line
  // instead of leaving stray dashes/numbers in the text.
  text = text.replace(/^\s*[-*•]\s+/gm, "");
  text = text.replace(/^\s*\d+[.)]\s+/gm, "");

  // Inline code / backticks, which read as raw formatting noise here.
  text = text.replace(/`([^`]+)`/g, "$1");

  // Collapse the extra blank lines and leading/trailing whitespace that
  // stripping the above tends to leave behind.
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line, i, arr) => line !== "" || (i > 0 && arr[i - 1] !== ""))
    .join(" ")
    .replace(/\s{2,}/g, " ")
    .trim();
}
