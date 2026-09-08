import type { ApiHandler } from "../_lib/http.js";
import { withMaintenanceGuard } from "../_lib/maintenance.js";
import { ok, err, getQueryParam, getClientIp, withEdgeCache } from "../_lib/http.js";
import { TtlCache, RateLimiter, fetchWithTimeout } from "../_lib/cache.js";

const cache = new TtlCache<unknown>(15 * 60 * 1000);
const limiter = new RateLimiter(60_000, 30);

// WMO weather codes -> short human-readable condition, per Open-Meteo's docs.
const WMO_CONDITIONS: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  71: "Slight snow",
  73: "Moderate snow",
  75: "Heavy snow",
  80: "Slight rain showers",
  81: "Moderate rain showers",
  82: "Violent rain showers",
  95: "Thunderstorm",
  96: "Thunderstorm with hail",
  99: "Thunderstorm with heavy hail",
};

function describeCode(code: number): string {
  return WMO_CONDITIONS[code] ?? "Unknown";
}

interface OpenMeteoResponse {
  current?: {
    temperature_2m: number;
    apparent_temperature: number;
    relative_humidity_2m: number;
    wind_speed_10m: number;
    precipitation: number;
    weather_code: number;
  };
  daily?: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    weather_code: number[];
    sunrise: string[];
    sunset: string[];
  };
}

const handler: ApiHandler = async (req, res) => {
  const lat = Number(getQueryParam(req, "lat"));
  const lon = Number(getQueryParam(req, "lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return err(res, 400, "Query parameters 'lat' and 'lon' are required numbers.");
  }

  const ip = getClientIp(req);
  const rate = limiter.check(ip);
  if (!rate.allowed) return err(res, 429, "Too many weather requests. Please slow down.", "RATE_LIMITED");

  const cacheKey = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  const cached = cache.get(cacheKey) as OpenMeteoResponse | undefined;
  let data = cached;

  if (!data) {
    try {
      const url = new URL("https://api.open-meteo.com/v1/forecast");
      url.searchParams.set("latitude", String(lat));
      url.searchParams.set("longitude", String(lon));
      url.searchParams.set("current", "temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,precipitation,weather_code");
      url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,weather_code,sunrise,sunset");
      url.searchParams.set("timezone", "auto");
      url.searchParams.set("forecast_days", "5");

      const response = await fetchWithTimeout(url.toString(), {}, 8000);
      if (!response.ok) throw new Error(`Open-Meteo returned HTTP ${response.status}`);
      data = (await response.json()) as OpenMeteoResponse;
      cache.set(cacheKey, data);
    } catch (error) {
      console.error("[api/weather]", error);
      return err(res, 502, "Weather is temporarily unavailable.", "PROVIDER_UNAVAILABLE");
    }
  }

  if (!data?.current || !data.daily) {
    return err(res, 502, "Weather provider returned an incomplete response.", "PROVIDER_UNAVAILABLE");
  }

  const { current, daily } = data;

  ok(res, {
    weather: {
      temperatureC: current.temperature_2m,
      feelsLikeC: current.apparent_temperature,
      condition: describeCode(current.weather_code),
      // The raw WMO code as well as the human label: the optional weather
      // visual effects map the CODE to an effect, and matching on the English
      // label would break the moment that wording changed.
      weatherCode: current.weather_code,
      humidityPct: current.relative_humidity_2m,
      windKph: current.wind_speed_10m,
      precipitationMm: current.precipitation,
      sunrise: daily.sunrise?.[0],
      sunset: daily.sunset?.[0],
      forecast: daily.time.map((date, i) => ({
        date,
        maxC: daily.temperature_2m_max[i]!,
        minC: daily.temperature_2m_min[i]!,
        condition: describeCode(daily.weather_code[i]!),
      })),
      source: "Open-Meteo",
      fetchedAt: new Date().toISOString(),
    },
  });
};

export default withMaintenanceGuard(withEdgeCache(900)(handler));
