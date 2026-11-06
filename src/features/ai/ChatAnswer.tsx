import { useEffect, useState } from "react";
import { useMotionPreference } from "@/hooks/useMotionPreference";

/**
 * One assistant answer, presented the way ChatGPT and Gemini present theirs:
 * plain text beside a small mark (no box around it), typed out word by word
 * when it first arrives, with a quiet action row underneath - Copy, and the
 * sources one tap away. No model name or timestamp on every message; that
 * footer ("Written by nvidia/nemotron-… · 10:10 AM") read like a log line,
 * and people asked for a normal chat.
 */
export function ChatAnswer({ text, sources, animate }: { text: string; sources?: string[]; animate: boolean }) {
  const motionEnabled = useMotionPreference();
  const words = text.split(/(\s+)/);
  const [shown, setShown] = useState(animate && motionEnabled ? 0 : words.length);
  const [copied, setCopied] = useState(false);
  const [showSources, setShowSources] = useState(false);

  useEffect(() => {
    if (shown >= words.length) return;
    // ~45 words a second: quick enough that nobody waits on it, slow enough to read as "typing".
    const timer = window.setTimeout(() => setShown((n) => Math.min(words.length, n + 2)), 22);
    return () => window.clearTimeout(timer);
  }, [shown, words.length]);

  const done = shown >= words.length;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked (some in-app browsers): nothing to do.
    }
  };

  return (
    <div className="chat-answer">
      <span className="chat-answer__mark" aria-hidden="true">
        ✨
      </span>
      <div className="chat-answer__body">
        <p className="chat-answer__text">
          {done ? text : words.slice(0, shown).join("")}
          {!done && <span className="chat-answer__caret" aria-hidden="true" />}
        </p>
        {done && (
          <div className="chat-answer__actions">
            <button type="button" onClick={() => void copy()} aria-label={copied ? "Copied" : "Copy answer"}>
              {copied ? "✓ Copied" : "⧉ Copy"}
            </button>
            {sources && sources.length > 0 && (
              <button type="button" onClick={() => setShowSources((v) => !v)} aria-expanded={showSources}>
                ⓘ Sources
              </button>
            )}
          </div>
        )}
        {showSources && sources && (
          <ul className="chat-answer__sources">
            {sources.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
