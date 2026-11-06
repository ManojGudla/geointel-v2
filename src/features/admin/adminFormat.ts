/**
 * Small formatting helpers for the admin dashboard: turning raw rows
 * (ISO timestamps, user-agent strings, IP addresses) into what a person
 * scanning a list actually wants to read.
 */

export function relativeTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "Not available";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return iso;
  const seconds = Math.round((now - then) / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(then).toLocaleDateString(undefined, { day: "numeric", month: "short", year: now - then > 300 * 86_400_000 ? "numeric" : undefined });
}

export function fullTime(iso: string | null | undefined): string {
  if (!iso) return "Not available";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/** "iPhone · Safari", "Windows · Chrome" - enough to know who it was, not a raw UA string. */
export function describeDevice(ua: string | null | undefined): string {
  if (!ua) return "Unknown device";
  const os = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Windows/.test(ua)
          ? "Windows"
          : /Mac OS X|Macintosh/.test(ua)
            ? "Mac"
            : /Linux/.test(ua)
              ? "Linux"
              : "Other";
  const app = /WhatsApp/i.test(ua)
    ? "WhatsApp"
    : /Instagram/.test(ua)
      ? "Instagram"
      : /FBAN|FBAV/.test(ua)
        ? "Facebook"
        : /LinkedInApp/.test(ua)
          ? "LinkedIn"
          : /Edg\//.test(ua)
            ? "Edge"
            : /OPR\/|Opera/.test(ua)
              ? "Opera"
              : /SamsungBrowser/.test(ua)
                ? "Samsung Internet"
                : /CriOS|Chrome\//.test(ua)
                  ? "Chrome"
                  : /FxiOS|Firefox\//.test(ua)
                    ? "Firefox"
                    : /Safari\//.test(ua)
                      ? "Safari"
                      : "Browser";
  return `${os} · ${app}`;
}

/** 49.205.12.34 → 49.205.x.x. Enough to spot repeats, without a full address on screen. */
export function maskIp(ip: string | null | undefined): string {
  if (!ip) return "IP hidden";
  const first = (ip.split(",")[0] ?? "").trim();
  if (first.includes(".")) {
    const parts = first.split(".");
    return parts.length === 4 ? `${parts[0]}.${parts[1]}.x.x` : first;
  }
  if (first.includes(":")) return `${first.split(":").slice(0, 2).join(":")}:…`;
  return first;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const a = parts[0]?.[0] ?? "";
  const b = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (a + b).toUpperCase();
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  // Leading = + - @ make spreadsheet apps run the cell as a formula.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv<T extends object>(rows: T[], columns: { key: keyof T; label: string }[]): string {
  const head = columns.map((c) => csvCell(c.label)).join(",");
  const body = rows.map((row) => columns.map((c) => csvCell(row[c.key])).join(","));
  return [head, ...body].join("\r\n");
}

export function downloadCsv(filename: string, csv: string) {
  // BOM so Excel opens UTF-8 (Telugu, Hindi, emoji) correctly.
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const WEEK = 7 * 86_400_000;

/** Count of rows created in the last 7 days and in the 7 days before that. */
export function weekOverWeek(rows: { created_at: string }[], now = Date.now()) {
  let thisWeek = 0;
  let lastWeek = 0;
  for (const row of rows) {
    const age = now - new Date(row.created_at).getTime();
    if (age < WEEK) thisWeek++;
    else if (age < 2 * WEEK) lastWeek++;
  }
  return { thisWeek, lastWeek };
}
