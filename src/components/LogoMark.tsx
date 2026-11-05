import { useId } from "react";

/**
 * The maNOWj GeoIntel mark - the same drawing as public/icons/mark.svg (the
 * browser-tab and home-screen icon), inline so it is crisp at any size and
 * needs no extra request. Decorative: the wordmark beside it carries the name.
 */
export function LogoMark({ size = 36 }: { size?: number }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 512 512" width={size} height={size} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`tile-${id}`} x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0" stopColor="#8f82ff" />
          <stop offset="0.5" stopColor="#6d5bff" />
          <stop offset="1" stopColor="#4f3fe0" />
        </linearGradient>
        <linearGradient id={`shine-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.22" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="116" fill={`url(#tile-${id})`} />
      <rect width="512" height="512" rx="116" fill={`url(#shine-${id})`} />
      <ellipse cx="256" cy="300" rx="190" ry="66" transform="rotate(-18 256 300)" fill="none" stroke="#ffffff" strokeOpacity="0.85" strokeWidth="22" />
      <path
        d="M256 438 C214 372 134 312 134 220 A122 122 0 1 1 378 220 C378 312 298 372 256 438 Z"
        fill="#ffffff"
        stroke="#5b4cf0"
        strokeWidth="20"
        strokeLinejoin="round"
      />
      <circle cx="256" cy="218" r="48" fill="#5b4cf0" />
      <circle cx="412" cy="248" r="30" fill="#2dd4bf" stroke="#ffffff" strokeWidth="12" />
    </svg>
  );
}
