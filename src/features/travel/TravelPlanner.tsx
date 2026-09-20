import { useState } from "react";
import { useLocationStore } from "@/stores/locationStore";
import { busLinks, flightLinks, hotelLinks, movieLinks, trainLinks, type ProviderLink } from "./providers";
import "./TravelPlanner.css";

function LinkRow({ links }: { links: ProviderLink[] }) {
  return (
    <div className="travel-planner__links">
      {links.map((link) => (
        <a key={link.label} href={link.url} target="_blank" rel="noreferrer" title={link.note}>
          {link.label} ↗
        </a>
      ))}
      {links
        .filter((l) => l.note)
        .map((l) => (
          <small key={l.label} className="travel-planner__note">
            {l.label}: {l.note}
          </small>
        ))}
    </div>
  );
}

function RouteCategory({
  icon,
  title,
  defaultOrigin,
  buildLinks,
}: {
  icon: string;
  title: string;
  defaultOrigin: string;
  buildLinks: (origin: string, destination: string) => ProviderLink[];
}) {
  const [origin, setOrigin] = useState(defaultOrigin);
  const [destination, setDestination] = useState("");

  return (
    <div className="travel-planner__card">
      <h3>
        {icon} {title}
      </h3>
      <div className="travel-planner__row">
        <input value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="From city" aria-label={`${title} from city`} />
        <span aria-hidden="true">→</span>
        <input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="To city" aria-label={`${title} to city`} />
      </div>
      <LinkRow links={buildLinks(origin, destination)} />
    </div>
  );
}

function CityCategory({
  icon,
  title,
  placeholder,
  defaultCity,
  buildLinks,
}: {
  icon: string;
  title: string;
  placeholder: string;
  defaultCity: string;
  buildLinks: (city: string) => ProviderLink[];
}) {
  const [city, setCity] = useState(defaultCity);

  return (
    <div className="travel-planner__card">
      <h3>
        {icon} {title}
      </h3>
      <div className="travel-planner__row">
        <input value={city} onChange={(e) => setCity(e.target.value)} placeholder={placeholder} aria-label={`${title} city`} />
      </div>
      <LinkRow links={buildLinks(city)} />
    </div>
  );
}

/**
 * Answers "what about tickets" honestly: real search hand-offs to two named
 * real providers per category, prefilled where each provider's own URL
 * scheme supports it. No fake prices, seats, or showtimes - no free
 * service hands those over without a paid partnership, and this project
 * has never fabricated data. See providers.ts for the URL logic.
 */
export function TravelPlanner() {
  const location = useLocationStore((s) => s.selectedLocation);
  const defaultCity = location?.address.city ?? location?.address.district ?? location?.name ?? "";

  return (
    <div className="travel-planner">
      <p className="travel-planner__intro">
        Real search links to real providers. GeoIntel doesn't process bookings or show live prices itself. Pick a category, fill in
        the route or city, and open a provider to book.
      </p>

      <RouteCategory icon="✈️" title="Flights" defaultOrigin={defaultCity} buildLinks={flightLinks} />
      <RouteCategory icon="🚆" title="Trains" defaultOrigin={defaultCity} buildLinks={trainLinks} />
      <RouteCategory icon="🚌" title="Buses" defaultOrigin={defaultCity} buildLinks={busLinks} />
      <CityCategory icon="🎬" title="Movies" placeholder="City" defaultCity={defaultCity} buildLinks={movieLinks} />
      <CityCategory icon="🏨" title="Hotels" placeholder="City or area" defaultCity={defaultCity} buildLinks={hotelLinks} />
    </div>
  );
}
