import { useQuery } from "@tanstack/react-query";
import { AsyncPanel } from "@/components/AsyncPanel";
import { fetchWeather } from "@/services/intel";
import { useLocationStore } from "@/stores/locationStore";
import "./WeatherPanel.css";

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
        {(weather) => (
          <>
            <div className="weather-panel__now">
              <span className="weather-panel__temp">{Math.round(weather.temperatureC)}°C</span>
              <div>
                <strong>{weather.condition}</strong>
                <span>Feels like {Math.round(weather.feelsLikeC)}°C</span>
              </div>
            </div>
            <div className="weather-panel__stats">
              <div>
                <span>Humidity</span>
                <strong>{Math.round(weather.humidityPct)}%</strong>
              </div>
              <div>
                <span>Wind</span>
                <strong>{Math.round(weather.windKph)} km/h</strong>
              </div>
              <div>
                <span>Precipitation</span>
                <strong>{weather.precipitationMm} mm</strong>
              </div>
            </div>
            {weather.sunrise && weather.sunset && (
              <div className="weather-panel__sun">
                🌅 {new Date(weather.sunrise).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · 🌇{" "}
                {new Date(weather.sunset).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </div>
            )}
            <div className="weather-panel__forecast">
              {weather.forecast.slice(1, 5).map((day) => (
                <div key={day.date}>
                  <span>{new Date(day.date).toLocaleDateString([], { weekday: "short" })}</span>
                  <strong>{Math.round(day.maxC)}°</strong>
                  <span>{Math.round(day.minC)}°</span>
                </div>
              ))}
            </div>
            <p className="weather-panel__source">Source: {weather.source}</p>
          </>
        )}
      </AsyncPanel>
    </div>
  );
}
