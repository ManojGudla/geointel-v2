import { describe, expect, it } from "vitest";
import { bookingLinks } from "../../src/features/routing/bookingLinks";
import type { RoutePoint } from "../../src/stores/routeStore";

const from: RoutePoint = { lat: 48.8566, lon: 2.3522, displayName: "Paris", name: "Paris" };
const to: RoutePoint = { lat: 48.8584, lon: 2.2945, displayName: "Eiffel Tower", name: "Eiffel Tower" };

describe("bookingLinks", () => {
  it("prefills Uber and Google Maps with real coordinates", () => {
    const links = bookingLinks(from, to, "car");
    expect(links.find((l) => l.label === "Uber")?.url).toBe(
      "https://m.uber.com/looking?pickup=48.8566,2.3522&drop[0]=48.8584,2.2945"
    );
    expect(links.find((l) => l.label === "Google Maps")?.url).toBe(
      "https://www.google.com/maps/dir/?api=1&origin=48.8566,2.3522&destination=48.8584,2.2945"
    );
  });

  it("prefills Apple Maps with saddr/daddr and dirflg=d for car/bike", () => {
    const links = bookingLinks(from, to, "car");
    expect(links.find((l) => l.label === "Apple Maps")?.url).toBe(
      "https://maps.apple.com/?saddr=48.8566,2.3522&daddr=48.8584,2.2945&dirflg=d"
    );
  });

  it("uses dirflg=w for walking directions on Apple Maps", () => {
    const links = bookingLinks(from, to, "walk");
    expect(links.find((l) => l.label === "Apple Maps")?.url).toContain("dirflg=w");
  });

  it("falls back to homepages for every provider when no destination is set", () => {
    const links = bookingLinks(null, null, "car");
    expect(links.find((l) => l.label === "Google Maps")?.url).toBe("https://maps.google.com");
    expect(links.find((l) => l.label === "Apple Maps")?.url).toBe("https://maps.apple.com/");
    expect(links.find((l) => l.label === "Uber")?.url).toContain("pickup=my_location");
  });

  it("never fabricates a prefill URL for Rapido or Ola - links to their real homepage instead", () => {
    const links = bookingLinks(from, to, "car");
    expect(links.find((l) => l.label === "Rapido")?.url).toBe("https://www.rapido.bike/");
    expect(links.find((l) => l.label === "Ola")?.url).toBe("https://www.olacabs.com/");
  });
});
