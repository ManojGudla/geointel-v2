import { useEffect, useState } from "react";
import { differenceFromViewer, placeTime } from "./placeClock";

/**
 * A ticking clock for the selected place. Renders nothing it cannot back up:
 * with no zone, or one the browser does not know, it says Unavailable.
 */
export function LocalTime({ timeZone, abbreviation }: { timeZone: string; abbreviation?: string }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    // Line each tick up with the start of the next second, so the seconds
    // change together with the device clock rather than drifting against it.
    const tick = () => {
      setNow(new Date());
      timer = setTimeout(tick, 1000 - (Date.now() % 1000));
    };
    timer = setTimeout(tick, 1000 - (Date.now() % 1000));
    return () => clearTimeout(timer);
  }, []);

  const place = placeTime(now, timeZone);
  if (!place) return <>Unavailable</>;

  const zoneLabel = abbreviation && !/^GMT[+-]/.test(abbreviation) ? `${abbreviation}, ${place.utcOffset}` : place.utcOffset;

  return (
    <span className="location-panel__time">
      <time dateTime={now.toISOString()} className="location-panel__clock">
        {place.time}
      </time>
      <span className="location-panel__timemeta">
        {place.date} · {zoneLabel}
      </span>
      <span className="location-panel__timemeta">{differenceFromViewer(place.offsetMinutes, -now.getTimezoneOffset())}</span>
      <span className="location-panel__timemeta">{timeZone}</span>
    </span>
  );
}
