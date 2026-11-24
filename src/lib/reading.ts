/**
 * A rounded reading, or null when the provider did not report one.
 *
 * Providers such as Open-Meteo send null for a variable they have no value
 * for. Math.round(null) is 0, so a missing temperature used to print as
 * "0°C" and a missing wind speed as "0 km/h": a reading invented out of a
 * gap. Undefined printed as "NaN". Every place a provider's number is shown
 * goes through this, and shows "Not reported" (or a dash) for null.
 */
export function reading(value: number | null | undefined, digits = 0): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
