/**
 * Who built this, in one place.
 *
 * The personal website moved from its temporary Vercel address to
 * https://me.manowj.com in November 2026. The address can still be replaced
 * without touching the code: set VITE_FOUNDER_SITE_URL in Vercel's
 * environment variables and redeploy, and every "Website" link follows.
 *
 * It is still NOT in the page's structured data (index.html). Add it there
 * once you are sure this is the address you want search engines to keep.
 */

/** Replaced by VITE_FOUNDER_SITE_URL when that is set. */
const DEFAULT_SITE_URL = "https://me.manowj.com/";

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
