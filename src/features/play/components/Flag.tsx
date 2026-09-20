import { flagSrc } from "../data/world";
import "./Flag.css";

/**
 * A country flag, as a real image.
 *
 * This replaced flag emoji, which were broken for a large share of visitors.
 * Flag emoji are two Regional Indicator Symbols that a font is supposed to
 * compose into one glyph - and Windows ships no flag glyphs at all, so every
 * flag rendered as its two ISO letters instead. In the Flag Quiz that printed
 * "KZ" above "Which country's flag is this?", which is the answer. The game
 * was unplayable on the most common desktop platform, and looked like a
 * rendering fault everywhere it was decorative.
 *
 * The images are served from this site (public/flags), built by
 * scripts/build-flags.mjs. Median 4 KB, largest 34 KB, fetched one at a time
 * as they appear.
 *
 * `alt` defaults to EMPTY, and that is deliberate rather than an oversight.
 * In a quiz the flag IS the question, so naming the country in alt text hands
 * the answer to anyone using a screen reader, and to anyone who hovers or
 * views source. Pass `name` only where the answer is already on screen - a
 * results list, a revealed answer.
 */
export function Flag({
  code,
  name,
  size = 64,
  className,
}: {
  code: string;
  /** Only pass this where the country is already revealed. */
  name?: string;
  size?: number;
  className?: string;
}) {
  return (
    <img
      className={`flag${className ? ` ${className}` : ""}`}
      src={flagSrc(code)}
      alt={name ? `Flag of ${name}` : ""}
      width={size}
      height={Math.round((size * 3) / 4)}
      loading="lazy"
      decoding="async"
      draggable={false}
    />
  );
}
