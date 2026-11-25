import { useQuery } from "@tanstack/react-query";
import { AsyncPanel } from "@/components/AsyncPanel";
import { fetchWeather } from "@/services/intel";
import { useLocationStore } from "@/stores/locationStore";
import { reading } from "@/lib/reading";
import "./WeatherPanel.css";

const NOT_REPORTED = "Not reported";

/**
 * The weekday of a forecast date such as "2026-11-26".
 *
 * new Date("2026-11-26") is midnight UTC, which is still the 25th anywhere
 * west of Greenwich, so every visitor in the Americas saw each forecast
 * under the previous day's name. Read and printed in UTC, the date is the
 * date it says.
 */
export function forecastWeekday(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return date.toLocaleDateString([], { weekday: "short", timeZone: "UTC" });
}

export function WeatherPanel() {
  const location = useLocationStore((s) => s.selectedLocation);

  const query = useQuery({
    queryKey: ["weather", location?.lat, location?.lon],
    queryFn: ({ signal }) => fetchWeather(location!.lat, location!.lon, signal),
    enabled: !!location,
    staleTime: 10 * 60 * 1000,
  });

  return (
    <div className="weather-panel">
      <h2>Live Weather</h2>
      <AsyncPanel query={query} label="Weather" idleMessage="Select a location to see live weather.">
        {(weather) => {
          const temperature = reading(weather.temperatureC);
          const feelsLike = reading(weather.feelsLikeC);
          const humidity = reading(weather.humidityPct);
          const wind = reading(weather.windKph);
          const precipitation = reading(weather.precipitationMm, 1);
          const asOf = weather.fetchedAt ? new Date(weather.fetchedAt) : null;
          return (
          <>
            <div className="weather-panel__now">
              <span className="weather-panel__temp">{temperature !== null ? `${temperature}°C` : "—"}</span>
              <div>
                <strong>{weather.condition}</strong>
                {feelsLike !== null && <span>Feels like {feelsLike}°C</span>}
              </div>
            </div>
            <div className="weather-panel__stats">
              <div>
                <span>Humidity</span>
                <strong>{humidity !== null ? `${humidity}%` : NOT_REPORTED}</strong>
              </div>
              <div>
                <span>Wind</span>
                <strong>{wind !== null ? `${wind} km/h` : NOT_REPORTED}</strong>
              </div>
              <div>
                <span>Precipitation</span>
                <strong>{precipitation !== null ? `${precipitation} mm` : NOT_REPORTED}</strong>
              </div>
            </div>
            {weather.sunrise && weather.sunset && (
              <div className="weather-panel__sun">
                🌅 {new Date(weather.sunrise).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · 🌇{" "}
                {new Date(weather.sunset).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </div>
            )}
            <div className="weather-panel__forecast">
              {weather.forecast.slice(1, 5).map((day) => {
                const max = reading(day.maxC);
                const min = reading(day.minC);
                return (
                  <div key={day.date}>
                    <span>{forecastWeekday(day.date)}</span>
                    <strong>{max !== null ? `${max}°` : "—"}</strong>
                    <span>{min !== null ? `${min}°` : "—"}</span>
                  </div>
                );
              })}
            </div>
            {/* Source AND time, like every other figure in the app. */}
            <p className="weather-panel__source">
              Source: {weather.source}
              {asOf && !Number.isNaN(asOf.getTime())
                ? ` · as of ${asOf.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                : ""}
            </p>
          </>
          );
        }}
      </AsyncPanel>
    </div>
  );
}
