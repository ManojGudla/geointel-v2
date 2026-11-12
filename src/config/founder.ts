/**
 * Who built this, in one place.
 *
 * The personal website's address will change: it is on a temporary Vercel
 * address now and moves to its own domain once that is bought. So the address
 * has a default here and can be replaced without touching the code: set
 * VITE_FOUNDER_SITE_URL in Vercel's environment variables (for example
 * https://example.com) and redeploy, and every "Website" link follows.
 *
 * It is deliberately NOT in the page's structured data (index.html). Search
 * engines keep what they read there for a long time, and a temporary address
 * is the wrong thing for them to remember. Add it there once the domain is final.
 */

/** Until the domain is bought. Replaced by VITE_FOUNDER_SITE_URL when that is set. */
const DEFAULT_SITE_URL = "https://manoj-gudla-website.vercel.app/";

function httpsUrlOrNull(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  try {
    const url = new URL(value.trim());
    // https only: this becomes a link every visitor can click.
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export const FOUNDER = {
  name: "Manoj Kumar Gudla",
  /** How he describes himself on his own site. */
  roles: "Technology professional, AI and innovation enthusiast, digital creator",
  location: "Hyderabad, India",
  motto: "Think beyond limits. Build what matters.",
  links: [
    { label: "LinkedIn", href: "https://www.linkedin.com/in/manojkumar946/" },
    { label: "YouTube", href: "https://www.youtube.com/@maNOWj_Official" },
    { label: "Instagram", href: "https://www.instagram.com/manowj_official/" },
    { label: "GitHub", href: "https://github.com/ManojGudla" },
  ],
} as const;

/** The environment variable when it holds a valid https address, otherwise the default above. */
export const FOUNDER_SITE_URL: string | null =
  httpsUrlOrNull(import.meta.env.VITE_FOUNDER_SITE_URL) ?? httpsUrlOrNull(DEFAULT_SITE_URL);

export { httpsUrlOrNull };
