import { describe, expect, it } from "vitest";
import {
  ARRIVAL_METERS,
  OFF_ROUTE_BASE_METERS,
  announceDistance,
  bearingDegrees,
  distanceMeters,
  isOffRoute,
  navProgress,
  projectOntoSegment,
  routeLengthMeters,
  snapToRoute,
  type Coord,
  type NavStep,
} from "@/features/routing/navigation/navMath";
import { useNavigationStore } from "@/features/routing/navigation/navStore";

/** A straight west→east line at the equator, one point every ~0.01°. */
const straight: Coord[] = [
  [0, 0],
  [0.01, 0],
  [0.02, 0],
  [0.03, 0],
];

describe("geodesy", () => {
  it("measures known distances", () => {
    // 0.01° of longitude at the equator is about 1113 m.
    expect(distanceMeters([0, 0], [0.01, 0])).toBeCloseTo(1113, -1);
    expect(distanceMeters([0, 0], [0, 0])).toBe(0);
    // London -> Paris, ~344 km.
    expect(distanceMeters([-0.1278, 51.5074], [2.3522, 48.8566]) / 1000).toBeCloseTo(344, -1);
  });

  it("computes bearings as compass degrees", () => {
    expect(bearingDegrees([0, 0], [0, 1])).toBeCloseTo(0, 1); // north
    expect(bearingDegrees([0, 0], [1, 0])).toBeCloseTo(90, 1); // east
    expect(bearingDegrees([0, 0], [0, -1])).toBeCloseTo(180, 1); // south
    expect(bearingDegrees([0, 0], [-1, 0])).toBeCloseTo(270, 1); // west
  });

  it("never returns a negative bearing", () => {
    for (const target of [[-1, -1], [-1, 1], [1, -1]] as Coord[]) {
      const b = bearingDegrees([0, 0], target);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(360);
    }
  });
});

describe("projecting a position onto a segment", () => {
  it("finds the perpendicular foot for a point beside the segment", () => {
    const r = projectOntoSegment([0.005, 0.001], [0, 0], [0.01, 0]);
    expect(r.t).toBeCloseTo(0.5, 2);
    expect(r.point[1]).toBeCloseTo(0, 5);
    // 0.001° of latitude is about 111 m.
    expect(r.distanceMeters).toBeCloseTo(111, -1);
  });

  it("clamps to the segment ends rather than extending the line", () => {
    expect(projectOntoSegment([-0.05, 0], [0, 0], [0.01, 0]).t).toBe(0);
    expect(projectOntoSegment([0.5, 0], [0, 0], [0.01, 0]).t).toBe(1);
  });

  it("survives a zero-length segment", () => {
    const r = projectOntoSegment([0.001, 0], [0, 0], [0, 0]);
    expect(r.t).toBe(0);
    expect(Number.isFinite(r.distanceMeters)).toBe(true);
  });
});

describe("snapping to the route", () => {
  it("returns null for a geometry too short to be a line", () => {
    expect(snapToRoute([0, 0], [])).toBeNull();
    expect(snapToRoute([0, 0], [[0, 0]])).toBeNull();
  });

  it("snaps a nearby position onto the line and reports the offset", () => {
    const snapped = snapToRoute([0.015, 0.0005], straight)!;
    expect(snapped.point[1]).toBeCloseTo(0, 5);
    expect(snapped.offRouteMeters).toBeCloseTo(55, -1);
    expect(snapped.index).toBe(1);
  });

  it("reports distance travelled along the route", () => {
    const start = snapToRoute([0, 0], straight)!;
    expect(start.travelledMeters).toBeCloseTo(0, 1);

    const middle = snapToRoute([0.015, 0], straight)!;
    expect(middle.travelledMeters).toBeCloseTo(routeLengthMeters(straight) / 2, -1);

    const end = snapToRoute([0.03, 0], straight)!;
    expect(end.travelledMeters).toBeCloseTo(routeLengthMeters(straight), -1);
  });

  it("only searches forward, so a route that doubles back can't send you backwards", () => {
    // Out and back along the same line: the midpoint is equally close to two
    // places on the route. Without a forward-only search, progress collapses.
    const outAndBack: Coord[] = [
      [0, 0],
      [0.02, 0],
      [0, 0],
    ];
    const onTheWayBack = snapToRoute([0.01, 0], outAndBack, 1)!;
    expect(onTheWayBack.index).toBe(1);
    // Travelled is past the turnaround, not back at the start.
    expect(onTheWayBack.travelledMeters).toBeGreaterThan(routeLengthMeters(outAndBack) / 2);
  });
});

describe("off-route detection", () => {
  it("tolerates ordinary GPS noise", () => {
    expect(isOffRoute(10, 10)).toBe(false);
    expect(isOffRoute(OFF_ROUTE_BASE_METERS - 1, 0)).toBe(false);
  });

  it("flags a genuine departure from the route", () => {
    expect(isOffRoute(300, 5)).toBe(true);
  });

  it("is more forgiving when the device admits its fix is vague", () => {
    // 80 m off with a 5 m fix is off-route; the same 80 m with a 50 m fix
    // is not, because the phone is telling us it doesn't really know.
    expect(isOffRoute(80, 5)).toBe(true);
    expect(isOffRoute(80, 50)).toBe(false);
  });

  it("treats a missing accuracy as no extra tolerance", () => {
    expect(isOffRoute(OFF_ROUTE_BASE_METERS + 1, null)).toBe(true);
  });
});

describe("trip progress", () => {
  const steps: NavStep[] = [
    { instruction: "Head east", distanceMeters: 1113, durationSeconds: 60, location: [0, 0], type: "depart" },
    { instruction: "Turn left", distanceMeters: 1113, durationSeconds: 60, location: [0.01, 0], type: "turn", modifier: "left" },
    { instruction: "Turn right", distanceMeters: 1113, durationSeconds: 60, location: [0.02, 0], type: "turn", modifier: "right" },
    { instruction: "Arrive at your destination", distanceMeters: 0, durationSeconds: 0, location: [0.03, 0], type: "arrive" },
  ];
  const total = 180;

  it("starts on the first instruction with the whole route ahead", () => {
    const snapped = snapToRoute([0, 0], straight)!;
    const p = navProgress(snapped, straight, steps, total);
    expect(p.currentStep).toBe(0);
    expect(p.metresRemaining).toBeCloseTo(routeLengthMeters(straight), -1);
    expect(p.secondsRemaining).toBeCloseTo(total, -1);
    expect(p.arrived).toBe(false);
  });

  /**
   * This test used to pin the bug rather than the behaviour.
   *
   * It asserted currentStep === 1 at a point where the driver still had to
   * make turn 1 — which is what the old code did, and was wrong. OSRM's
   * `step.distance` is the length travelled ALONG a step while its manoeuvre
   * sits at the step's START, and the old loop added the length before
   * comparing. The result on the road: at the exact moment you had to turn
   * left the banner read "Now — Head east", and standing on the turn it read
   * "In 1.1 km — Turn left". The turn you needed was in the small grey line
   * underneath. A whole trip of instructions, each one step behind.
   *
   * The rule the banner must follow: show the next manoeuvre you have NOT yet
   * performed, and the distance to it.
   */
  it("shows the turn you still have to make, not the one you just made", () => {
    // Manoeuvres sit at 0 m (depart), 1113 m (left), 2226 m (right),
    // 3339 m (arrive) — the cumulative sum of the steps BEFORE each one.
    const beforeFirstTurn = navProgress(snapToRoute([0.008, 0], straight)!, straight, steps, total);
    expect(beforeFirstTurn.currentStep, "still approaching the left turn").toBe(1);
    expect(beforeFirstTurn.metresToNextTurn).toBeGreaterThan(0);

    const pastFirstTurn = navProgress(snapToRoute([0.012, 0], straight, 1)!, straight, steps, total);
    expect(pastFirstTurn.currentStep, "left turn done, right turn is next").toBe(2);

    const pastSecondTurn = navProgress(snapToRoute([0.022, 0], straight, 2)!, straight, steps, total);
    expect(pastSecondTurn.currentStep, "both turns done, only arrival left").toBe(3);
  });

  it("counts down to the turn and reaches zero at it, not 1.1 km past it", () => {
    // The symptom that gave the bug away: standing ON the junction, the old
    // code reported the distance to the one after it.
    const atTheTurn = navProgress(snapToRoute([0.01, 0], straight)!, straight, steps, total);
    expect(atTheTurn.currentStep).toBe(1);
    expect(atTheTurn.metresToNextTurn, "on the turn, so the distance to it is ~0").toBeLessThan(60);
  });

  it("holds the instruction until you are genuinely past the junction", () => {
    // STEP_ADVANCE_METERS is a grace period AFTER the turn. The old code
    // subtracted it from the other side of the comparison, flipping the
    // instruction 20 m EARLY — the opposite of what its own comment promised.
    const justBefore = navProgress(snapToRoute([0.00995, 0], straight)!, straight, steps, total);
    expect(justBefore.currentStep, "10 m short of the turn, still says turn").toBe(1);
  });

  it("counts down the distance to the next turn", () => {
    const early = navProgress(snapToRoute([0.002, 0], straight)!, straight, steps, total);
    const later = navProgress(snapToRoute([0.008, 0], straight)!, straight, steps, total);
    expect(later.metresToNextTurn).toBeLessThan(early.metresToNextTurn);
  });

  it("scales remaining time by how much route is left, and never goes negative", () => {
    const half = navProgress(snapToRoute([0.015, 0], straight, 1)!, straight, steps, total);
    expect(half.secondsRemaining).toBeCloseTo(total / 2, -1);

    const past = navProgress(snapToRoute([0.03, 0], straight, 2)!, straight, steps, total);
    expect(past.metresRemaining).toBeGreaterThanOrEqual(0);
    expect(past.secondsRemaining).toBeGreaterThanOrEqual(0);
  });

  it("declares arrival only within the arrival radius", () => {
    const nearly = navProgress(snapToRoute([0.0298, 0], straight, 2)!, straight, steps, total);
    expect(nearly.metresRemaining).toBeLessThan(ARRIVAL_METERS);
    expect(nearly.arrived).toBe(true);

    const notYet = navProgress(snapToRoute([0.028, 0], straight, 2)!, straight, steps, total);
    expect(notYet.arrived).toBe(false);
  });

  it("handles a route with no steps without throwing", () => {
    const p = navProgress(snapToRoute([0.01, 0], straight)!, straight, [], total);
    expect(Number.isFinite(p.metresRemaining)).toBe(true);
    expect(p.currentStep).toBe(0);
  });
});

describe("announcements", () => {
  it("says Now when you're on top of the turn", () => {
    expect(announceDistance(0)).toBe("Now");
    expect(announceDistance(24)).toBe("Now");
  });

  it("rounds metres to a readable figure", () => {
    expect(announceDistance(203)).toBe("In 200 m");
    expect(announceDistance(97)).toBe("In 100 m");
  });

  it("switches to kilometres past 1 km", () => {
    expect(announceDistance(1200)).toBe("In 1.2 km");
    expect(announceDistance(15_400)).toBe("In 15.4 km");
  });
});

describe("navigation store", () => {
  it("starts idle and holds no position", () => {
    useNavigationStore.getState().stop();
    expect(useNavigationStore.getState().state).toBe("idle");
    expect(useNavigationStore.getState().position).toBeNull();
  });

  it("resets progress when a new trip starts", () => {
    useNavigationStore.getState().update({ searchFromIndex: 12, currentStep: 5, rerouteCount: 3 });
    useNavigationStore.getState().start();
    const s = useNavigationStore.getState();
    expect(s.state).toBe("locating");
    expect(s.searchFromIndex).toBe(0);
    expect(s.currentStep).toBe(0);
    expect(s.rerouteCount).toBe(0);
    expect(s.following).toBe(true);
  });

  it("clears the position on stop so a stale marker isn't left behind", () => {
    useNavigationStore.getState().update({ position: [1, 2], snapped: [1, 2], accuracyMeters: 8 });
    useNavigationStore.getState().stop();
    expect(useNavigationStore.getState().snapped).toBeNull();
    expect(useNavigationStore.getState().accuracyMeters).toBeNull();
  });

  it("counts reroutes and restarts the forward search from the new route's start", () => {
    useNavigationStore.getState().start();
    useNavigationStore.getState().update({ searchFromIndex: 30 });
    useNavigationStore.getState().noteReroute();
    expect(useNavigationStore.getState().rerouteCount).toBe(1);
    expect(useNavigationStore.getState().searchFromIndex).toBe(0);
    expect(useNavigationStore.getState().state).toBe("navigating");
  });

  it("stops following when asked, so panning away doesn't fight the camera", () => {
    useNavigationStore.getState().start();
    useNavigationStore.getState().setFollowing(false);
    expect(useNavigationStore.getState().following).toBe(false);
  });
});
