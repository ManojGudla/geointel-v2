/**
 * Who built this, in one place.
 *
 * The personal website is deliberately NOT written here as an address. Its
 * domain has not been bought yet, and a link to a temporary address would be
 * dead, or pointing at the wrong thing, a week after it shipped. So the link
 * is switched on from outside the code: set VITE_FOUNDER_SITE_URL in Vercel's
 * environment variables (for example https://example.com) and redeploy. Until
 * then no "Website" link is shown anywhere, which is the honest state.
 */

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

/** Null until the domain exists and the environment variable is set. */
export const FOUNDER_SITE_URL: string | null = httpsUrlOrNull(import.meta.env.VITE_FOUNDER_SITE_URL);

export { httpsUrlOrNull };
