import { beforeEach, describe, expect, it } from "vitest";
import { isBuildingFocus, useIntelTabStore } from "@/stores/intelTabStore";

/*
  Owner's request, 28 November 2026: "when it click on the building only
  property type need to come". A tap on a building records that point and
  opens the Overview, which then leads with the property type.
*/
describe("a tap on a building", () => {
  beforeEach(() => useIntelTabStore.setState({ tab: "nearby", buildingFocus: null }));

  it("opens the Overview, wherever the panel was", () => {
    useIntelTabStore.getState().focusBuilding({ lat: 17.4197, lon: 78.3475 });
    expect(useIntelTabStore.getState().tab).toBe("overview");
  });

  it("applies only while that building is the selected place", () => {
    const focus = { lat: 17.419687, lon: 78.347545 };
    expect(isBuildingFocus(focus, { lat: 17.419687, lon: 78.347545 })).toBe(true);
    // Anywhere else, by any route (a search, a link, a tap on the ground), the normal Overview.
    expect(isBuildingFocus(focus, { lat: 17.4197, lon: 78.3475 })).toBe(false);
    expect(isBuildingFocus(null, { lat: 17.419687, lon: 78.347545 })).toBe(false);
    expect(isBuildingFocus(focus, null)).toBe(false);
  });

  it("is forgotten by a tap on the ground", () => {
    useIntelTabStore.getState().focusBuilding({ lat: 1, lon: 2 });
    useIntelTabStore.getState().clearBuildingFocus();
    expect(useIntelTabStore.getState().buildingFocus).toBeNull();
  });
});
