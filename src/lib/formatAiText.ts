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
export function formatAiText(raw: string): string {
  let text = raw;

  // A leaked reasoning preamble almost always ends with the model finally
  // giving its real answer after a blank line, a "Final answer:"-style
  // marker, or after inline reasoning markers. Strip a leading block that
  // looks like planning/meta-commentary rather than a direct answer.
  text = text.replace(/^(?:here'?s (?:a |my )?thinking process[:.]?|let me (?:analyze|think|break this down)[^.\n]*[:.]?|step \d+[:.][^\n]*\n?|okay,? let'?s[^.\n]*[:.]?)\s*/i, "");
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
