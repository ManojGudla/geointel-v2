import { describe, expect, it } from "vitest";
import { classifyFeatures } from "../../api/_routes/gis";

/**
 * Street furniture is not the building you clicked.
 *
 * The subject rule took ANY amenity within 35m as a commercial subject, any
 * tourism tag as a landmark and any transit tag as transport. A bench, a
 * parking space or a bin outside a house made the house "Commercial" at
 * VERIFIED confidence; a bus-stop pole outside an apartment block made it
 * "Transport"; a tourist information board made it a "Landmark".
 */

const PIN = { lat: 17.41861, lon: 78.34682 };

function node(metresNorth: number, tags: Record<string, string>, id: number) {
  return { type: "node" as const, id, lat: PIN.lat + metresNorth / 111_320, lon: PIN.lon, tags };
}

/** A house 20m from the pin: close enough to be the subject if nothing on the pin qualifies. */
const house = (id = 1) => ({
  type: "way" as const,
  id,
  center: { lat: PIN.lat + 20 / 111_320, lon: PIN.lon },
  tags: { building: "house" },
});

/** The tagged feature sits exactly on the pin, the house 20m away. */
function subjectWith(extra: Record<string, string>) {
  const { subject } = classifyFeatures([node(0, extra, 99), house()], PIN, 250);
  return subject;
}

describe("what can be the subject", () => {
  for (const tags of [
    { amenity: "bench" },
    { amenity: "parking" },
    { amenity: "waste_basket" },
    { amenity: "drinking_water" },
    { amenity: "toilets" },
    { amenity: "atm" },
    { amenity: "bicycle_parking" },
  ]) {
    it(`a ${tags.amenity} next to a house does not make it commercial`, () => {
      expect(subjectWith(tags)?.category).toBe("residential");
    });
  }

  it("a bus stop outside does not make a house transport", () => {
    expect(subjectWith({ highway: "bus_stop", public_transport: "platform" })?.category).toBe("residential");
  });

  it("an information board does not make a house a landmark", () => {
    expect(subjectWith({ tourism: "information" })?.category).toBe("residential");
  });

  it("a real business on the spot still wins", () => {
    expect(subjectWith({ amenity: "restaurant", name: "Paradise" })?.category).toBe("commercial");
  });

  it("a hotel is a business, not a landmark", () => {
    expect(subjectWith({ tourism: "hotel" })?.category).toBe("commercial");
  });

  it("a museum is still a landmark", () => {
    expect(subjectWith({ tourism: "museum" })?.category).toBe("landmark");
  });

  it("a railway station is still transport", () => {
    expect(subjectWith({ railway: "station" })?.category).toBe("transport");
  });

  it("street furniture still counts as evidence about the area", () => {
    const { counts } = classifyFeatures([node(0, { amenity: "bench" }, 99), house()], PIN, 250);
    expect(counts.amenities).toBe(1);
  });
});
