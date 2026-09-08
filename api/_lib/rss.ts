function decodeXmlEntities(value: string): string {
  return value
    .replace(/<!\[CDATA\[/g, "")
    .replace(/\]\]>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripHtml(value: string): string {
  return decodeXmlEntities(value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function getTag(block: string, tag: string): string {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return match ? stripHtml(match[1]!) : "";
}

export interface ParsedRssItem {
  title: string;
  link: string;
  pubDate: string;
  source: string;
}

export function parseRssItems(xml: string): ParsedRssItem[] {
  return [...xml.matchAll(/<item[\s\S]*?<\/item>/gi)]
    .map((m) => m[0])
    .map((item) => ({
      title: getTag(item, "title"),
      link: getTag(item, "link"),
      pubDate: getTag(item, "pubDate"),
      source: getTag(item, "source"),
    }))
    .filter((item) => item.title && /^https?:\/\//i.test(item.link));
}
