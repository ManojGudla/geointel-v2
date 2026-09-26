import { useEffect } from "react";

/**
 * Tells crawlers not to list this page, for as long as it is on screen.
 *
 * Changes the robots tag index.html already has instead of adding a second
 * one beside it: two tags saying "index" and "noindex" relies on every
 * crawler resolving the conflict the same way. Restores the original on the
 * way out, since this is a single-page app and the next view may want to be
 * listed.
 */
export function useNoIndex(content = "noindex, follow"): void {
  useEffect(() => {
    let tag = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    const created = !tag;
    if (!tag) {
      tag = document.createElement("meta");
      tag.name = "robots";
      document.head.appendChild(tag);
    }
    const previous = tag.content;
    tag.content = content;
    return () => {
      if (created) tag!.remove();
      else tag!.content = previous;
    };
  }, [content]);
}
