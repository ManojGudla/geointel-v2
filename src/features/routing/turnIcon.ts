/**
 * The arrow shown beside each turn.
 *
 * Driven by OSRM's own `maneuver.type` / `maneuver.modifier`, which come from
 * a fixed documented vocabulary - so the arrow always matches the instruction
 * instead of being guessed from the wording of the sentence.
 */
export function turnIcon(type: string, modifier?: string): string {
  switch (type) {
    case "depart":
      return "🚩";
    case "arrive":
      return "🏁";
    case "roundabout":
    case "rotary":
    case "roundabout turn":
      return "🔄";
    case "merge":
      return "🔀";
    default:
      break;
  }

  switch (modifier) {
    case "left":
      return "⬅️";
    case "right":
      return "➡️";
    case "slight left":
      return "↖️";
    case "slight right":
      return "↗️";
    case "sharp left":
      return "↰";
    case "sharp right":
      return "↱";
    case "uturn":
      return "↩️";
    case "straight":
    default:
      return "⬆️";
  }
}

/** "4 min", "1h 12m" - the same shape a maps app prints. */
export function formatDuration(seconds: number): string {
  // Tested against raw seconds, not the rounded minutes: Math.round(30/60)
  // is 1, so checking `minutes < 1` could never be true and a 30-second walk
  // was reported as "1 min".
  if (seconds < 60) return "under a minute";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

/**
 * Clock time you'd arrive if you left now. Every maps app shows this, and it
 * is the number people actually care about - "45 minutes" means less than
 * "arrive 6:12 pm".
 */
export function arrivalTime(seconds: number, now: Date = new Date()): string {
  const arrival = new Date(now.getTime() + seconds * 1000);
  return arrival.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
