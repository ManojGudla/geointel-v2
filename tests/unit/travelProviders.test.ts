import { describe, expect, it } from "vitest";
import { busLinks, flightLinks, hotelLinks, movieLinks, trainLinks } from "../../src/features/travel/providers";

describe("flightLinks", () => {
  it("falls back to provider homepages when origin/destination are blank", () => {
    const links = flightLinks("", "");
    expect(links.find((l) => l.label === "Google Flights")?.url).toBe("https://www.google.com/travel/flights");
    expect(links.find((l) => l.label === "Skyscanner")?.url).toBe("https://www.skyscanner.net/");
  });

  it("prefills Google Flights with an encoded free-text query", () => {
    const links = flightLinks("Hyderabad", "Delhi");
    const gf = links.find((l) => l.label === "Google Flights")!;
    expect(gf.url).toContain("Flights%20from%20Hyderabad%20to%20Delhi");
  });

  it("marks Skyscanner as unable to prefill", () => {
    const links = flightLinks("Hyderabad", "Delhi");
    expect(links.find((l) => l.label === "Skyscanner")?.note).toBeTruthy();
  });
});

describe("trainLinks", () => {
  it("builds a title-cased ConfirmTkt route slug", () => {
    const links = trainLinks("new delhi", "mumbai");
    expect(links.find((l) => l.label === "ConfirmTkt")?.url).toBe("https://www.confirmtkt.com/train-search/New-Delhi-to-Mumbai");
  });

  it("falls back to the ConfirmTkt homepage when a city is missing", () => {
    const links = trainLinks("", "Mumbai");
    expect(links.find((l) => l.label === "ConfirmTkt")?.url).toBe("https://www.confirmtkt.com/");
  });

  it("always points IRCTC at its real search page", () => {
    const links = trainLinks("Hyderabad", "Bangalore");
    expect(links.find((l) => l.label === "IRCTC")?.url).toBe("https://www.irctc.co.in/nget/train-search");
  });
});

describe("busLinks", () => {
  it("prefills redBus query params and an AbhiBus city-slug route", () => {
    const links = busLinks("Hyderabad", "Bangalore");
    expect(links.find((l) => l.label === "redBus")?.url).toBe(
      "https://www.redbus.in/search?fromCityName=Hyderabad&toCityName=Bangalore"
    );
    expect(links.find((l) => l.label === "AbhiBus")?.url).toBe("https://www.abhibus.com/bus_tickets/hyderabad-to-bangalore-bus");
  });
});

describe("movieLinks", () => {
  it("prefills BookMyShow with a city slug and leaves District as a plain handoff", () => {
    const links = movieLinks("Hyderabad");
    expect(links.find((l) => l.label === "BookMyShow")?.url).toBe("https://in.bookmyshow.com/explore/movies-hyderabad");
    expect(links.find((l) => l.label === "District")?.url).toBe("https://www.district.in/");
    expect(links.find((l) => l.label === "District")?.note).toBeTruthy();
  });
});

describe("hotelLinks", () => {
  it("prefills Booking.com and Google Hotels with the given city", () => {
    const links = hotelLinks("Goa");
    expect(links.find((l) => l.label === "Booking.com")?.url).toBe("https://www.booking.com/searchresults.html?ss=Goa");
    expect(links.find((l) => l.label === "Google Hotels")?.url).toContain("hotels%20in%20Goa");
  });
});
