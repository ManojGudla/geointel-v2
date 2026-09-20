/**
 * Pure URL builders for the Travel Planner. These are honest external
 * handoffs, not a booking integration - GeoIntel has no partnership or paid
 * API access to real flight/train/bus/movie/hotel availability, so it never
 * fabricates prices, seats, or showtimes. Each category opens two real
 * providers' own search pages, prefilled where that provider's URL scheme
 * actually supports free-text prefill; where it doesn't, the link opens the
 * provider's real search page unprefilled rather than guessing at a URL
 * that might silently 404 or mislead. Same pattern as bookingLinks() in
 * DirectionsPanel.tsx.
 */

export interface ProviderLink {
  label: string;
  url: string;
  /** Shown when this provider's link can't be prefilled - sets honest expectations. */
  note?: string;
}

function titleSlug(input: string): string {
  return input
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("-");
}

function lowerSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-");
}

export function flightLinks(origin: string, destination: string): ProviderLink[] {
  const o = origin.trim();
  const d = destination.trim();
  return [
    {
      label: "Google Flights",
      url:
        o && d
          ? `https://www.google.com/travel/flights?q=${encodeURIComponent(`Flights from ${o} to ${d}`)}`
          : "https://www.google.com/travel/flights",
    },
    {
      label: "Skyscanner",
      url: "https://www.skyscanner.net/",
      note: "Skyscanner needs airport codes to prefill (search your route there)",
    },
  ];
}

export function trainLinks(origin: string, destination: string): ProviderLink[] {
  const o = origin.trim();
  const d = destination.trim();
  return [
    {
      label: "IRCTC",
      url: "https://www.irctc.co.in/nget/train-search",
      note: "opens IRCTC's train search (sign-in required to book)",
    },
    {
      label: "ConfirmTkt",
      url: o && d ? `https://www.confirmtkt.com/train-search/${titleSlug(o)}-to-${titleSlug(d)}` : "https://www.confirmtkt.com/",
    },
  ];
}

export function busLinks(origin: string, destination: string): ProviderLink[] {
  const o = origin.trim();
  const d = destination.trim();
  return [
    {
      label: "redBus",
      url:
        o && d
          ? `https://www.redbus.in/search?fromCityName=${encodeURIComponent(o)}&toCityName=${encodeURIComponent(d)}`
          : "https://www.redbus.in/",
    },
    {
      label: "AbhiBus",
      url: o && d ? `https://www.abhibus.com/bus_tickets/${lowerSlug(o)}-to-${lowerSlug(d)}-bus` : "https://www.abhibus.com/",
    },
  ];
}

export function movieLinks(city: string): ProviderLink[] {
  const c = city.trim();
  return [
    {
      label: "BookMyShow",
      url: c ? `https://in.bookmyshow.com/explore/movies-${lowerSlug(c)}` : "https://in.bookmyshow.com/",
    },
    {
      label: "District",
      url: "https://www.district.in/",
      note: "opens District (search your city there)",
    },
  ];
}

export function hotelLinks(city: string): ProviderLink[] {
  const c = city.trim();
  return [
    {
      label: "Booking.com",
      url: c ? `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(c)}` : "https://www.booking.com/",
    },
    {
      label: "Google Hotels",
      url: c
        ? `https://www.google.com/travel/hotels?q=${encodeURIComponent(`hotels in ${c}`)}`
        : "https://www.google.com/travel/hotels",
    },
  ];
}
