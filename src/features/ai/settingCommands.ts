/**
 * Plain-language commands that change what the map is DOING, rather than
 * asking it a question.
 *
 * "Turn off weather effects" has to actually turn them off. A Copilot that
 * replies "sure, weather effects are now off" while the rain keeps falling is
 * worse than one that says it can't do that — so each of these maps to a real
 * store action, and the caller applies it before it says anything.
 *
 * Deterministic string matching, no model call: these are short, fixed
 * phrasings, and spending a round-trip and a token budget on "turn off the
 * rain" would be silly.
 */
export type SettingCommand =
  | { setting: "weather-effects"; value: boolean }
  | { setting: "3d"; value: boolean }
  | { setting: "basemap"; value: "standard" | "satellite" | "dark" | "terrain" };

const ON = /\b(on|enable[d]?|show|start|turn on|switch on|add)\b/;
const OFF = /\b(off|disable[d]?|hide|stop|remove|turn off|switch off)\b/;

/** Returns null for anything that isn't unambiguously one of these commands. */
export function parseSettingCommand(input: string): SettingCommand | null {
  const text = input.toLowerCase().trim();
  if (!text) return null;

  // Weather effects. Matched on the effect words, not on "weather" alone —
  // "what's the weather here" is a question, not a command, and must fall
  // through to the normal answer path.
  const mentionsEffects = /\b(weather effect|weather effects|rain effect|weather animation|weather overlay)\b/.test(text);
  const mentionsRainish = /\b(rain|snow|fog)\b/.test(text) && /\b(effect|animation|overlay)\b/.test(text);
  if (mentionsEffects || mentionsRainish) {
    if (OFF.test(text)) return { setting: "weather-effects", value: false };
    if (ON.test(text)) return { setting: "weather-effects", value: true };
    return null;
  }

  // Both spellings, because "switch to 2d" contains no "3d" at all and used
  // to fall through to the basemap branch and come back as null.
  if (/\b(3d|2d)\b/.test(text)) {
    if (/\b2d\b/.test(text) || OFF.test(text)) return { setting: "3d", value: false };
    if (ON.test(text) || /\b3d\b/.test(text)) return { setting: "3d", value: true };
    return null;
  }

  if (/\b(basemap|base map|map style)\b/.test(text) || /\bswitch to\b/.test(text)) {
    if (/\bsatellite\b/.test(text)) return { setting: "basemap", value: "satellite" };
    if (/\bdark\b/.test(text)) return { setting: "basemap", value: "dark" };
    if (/\bterrain\b/.test(text)) return { setting: "basemap", value: "terrain" };
    if (/\b(standard|default|street|normal)\b/.test(text)) return { setting: "basemap", value: "standard" };
    return null;
  }

  return null;
}

/** What to say afterwards. Written to describe what was actually done. */
export function describeSettingCommand(command: SettingCommand): string {
  switch (command.setting) {
    case "weather-effects":
      return command.value
        ? "Weather effects are on. They use the real reported conditions at your selected location — if the weather can't be fetched, nothing is drawn."
        : "Weather effects are off.";
    case "3d":
      return command.value ? "Switched the map to 3D." : "Switched the map back to 2D.";
    case "basemap":
      return `Switched the basemap to ${command.value}.`;
  }
}
