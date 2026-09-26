/**
 * The time at the selected place, worked out on this device from the place's
 * IANA timezone (which Open-Meteo returns for the point).
 *
 * Nothing here is fetched per second: the zone arrives once with the weather
 * answer and the browser's own clock does the rest, so the time stays right
 * offline and costs no requests. The only way it can be wrong is the device
 * clock being wrong, which is why the zone is always shown beside the time.
 */

export interface PlaceTime {
  /** "14:05:32" */
  time: string;
  /** "Fri 11 Sep" */
  date: string;
  /** The place's offset from UTC right now, in minutes (daylight saving included). */
  offsetMinutes: number;
  /** "UTC+5:30" */
  utcOffset: string;
}

/** A zone the browser does not recognise gives null, never a guessed time. */
export function isKnownTimeZone(timeZone: string | undefined | null): timeZone is string {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

function offsetMinutesAt(now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  const wholeSeconds = Math.floor(now.getTime() / 1000) * 1000;
  return Math.round((asUtc - wholeSeconds) / 60_000);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Built from parts because browsers disagree on the short forms ("Sep" or
 * "Sept", with or without a comma), and one format everywhere reads better.
 */
function placeDate(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", day: "numeric", month: "numeric" }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("weekday")} ${get("day")} ${MONTHS[Number(get("month")) - 1] ?? ""}`.trim();
}

function formatOffset(minutes: number): string {
  if (minutes === 0) return "UTC";
  const sign = minutes > 0 ? "+" : "-";
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `UTC${sign}${h}${m ? `:${String(m).padStart(2, "0")}` : ""}`;
}

export function placeTime(now: Date, timeZone: string | undefined | null): PlaceTime | null {
  if (!isKnownTimeZone(timeZone)) return null;
  const offsetMinutes = offsetMinutesAt(now, timeZone);
  return {
    time: new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(now),
    date: placeDate(now, timeZone),
    offsetMinutes,
    utcOffset: formatOffset(offsetMinutes),
  };
}

/**
 * How the place's clock compares with the reader's, e.g. "5 h 30 min ahead of
 * you". `viewerOffsetMinutes` is minutes east of UTC (the negative of
 * Date#getTimezoneOffset).
 */
export function differenceFromViewer(placeOffsetMinutes: number, viewerOffsetMinutes: number): string {
  const diff = placeOffsetMinutes - viewerOffsetMinutes;
  if (diff === 0) return "Same time as you";
  const abs = Math.abs(diff);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const amount = [h ? `${h} h` : "", m ? `${m} min` : ""].filter(Boolean).join(" ");
  return `${amount} ${diff > 0 ? "ahead of" : "behind"} you`;
}
