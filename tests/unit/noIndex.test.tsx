import { describe, expect, it, afterEach, beforeEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { useNoIndex } from "../../src/hooks/useNoIndex";

/**
 * One robots tag, changed and restored, never a second contradicting one.
 * The not-found page used to append "noindex" beside index.html's "index,
 * follow", leaving crawlers two answers to one question.
 */

function Page({ content }: { content?: string }) {
  useNoIndex(content);
  return null;
}

const tags = () => document.head.querySelectorAll('meta[name="robots"]');

beforeEach(() => {
  document.head.innerHTML = '<meta name="robots" content="index, follow">';
});

afterEach(cleanup);

describe("useNoIndex", () => {
  it("changes the existing tag instead of adding another", () => {
    render(<Page />);
    expect(tags()).toHaveLength(1);
    expect(tags()[0]!.getAttribute("content")).toBe("noindex, follow");
  });

  it("puts the original back when the page goes away", () => {
    const { unmount } = render(<Page content="noindex, nofollow" />);
    unmount();
    expect(tags()).toHaveLength(1);
    expect(tags()[0]!.getAttribute("content")).toBe("index, follow");
  });

  it("creates a tag only when there is none, and removes it after", () => {
    document.head.innerHTML = "";
    const { unmount } = render(<Page />);
    expect(tags()).toHaveLength(1);
    unmount();
    expect(tags()).toHaveLength(0);
  });
});
