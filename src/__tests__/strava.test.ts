import {
  parseDescriptionForIntervals,
  inferDistanceFromLaps,
  calculatePace,
  parseIntervalSession,
} from "../lib/strava";
import { DetailedActivity } from "../types";

// --- parseDescriptionForIntervals ---

describe("parseDescriptionForIntervals", () => {
  it("parses 'NxDISTm' from name", () => {
    expect(parseDescriptionForIntervals("5x400m intervals", null)).toEqual({ distance: 400, count: 5 });
  });

  it("parses from description when name has no pattern", () => {
    expect(parseDescriptionForIntervals("Morning run", "3x800m repeats")).toEqual({ distance: 800, count: 3 });
  });

  it("parses × (multiplication sign)", () => {
    expect(parseDescriptionForIntervals("4×1600m", null)).toEqual({ distance: 1600, count: 4 });
  });

  it("parses with spaces around x", () => {
    expect(parseDescriptionForIntervals("6 x 200m", null)).toEqual({ distance: 200, count: 6 });
  });

  it("parses time-based intervals like 5x1min", () => {
    expect(parseDescriptionForIntervals("5x1min intervals", null)).toEqual({ distance: -60, count: 5 });
  });

  it("returns null for non-interval descriptions", () => {
    expect(parseDescriptionForIntervals("Easy 10k run", "Recovery jog")).toBeNull();
  });

  it("returns null for unsupported distances", () => {
    expect(parseDescriptionForIntervals("3x300m", null)).toBeNull();
  });

  it("returns null for null/empty inputs", () => {
    expect(parseDescriptionForIntervals(null, null)).toBeNull();
  });

  it("prefers name match over description", () => {
    expect(parseDescriptionForIntervals("5x400m", "3x800m")).toEqual({ distance: 400, count: 5 });
  });
});

// --- inferDistanceFromLaps ---

describe("inferDistanceFromLaps", () => {
  it("returns null with fewer than 3 laps", () => {
    expect(inferDistanceFromLaps([
      { distance: 400, elapsed_time: 90 },
      { distance: 400, elapsed_time: 90 },
    ])).toBeNull();
  });

  it("detects 400m intervals with recovery laps", () => {
    // 3x400m with 200m recovery jogs (slower pace)
    const laps = [
      { distance: 400, elapsed_time: 85 },   // work - fast
      { distance: 200, elapsed_time: 120 },   // recovery - slow
      { distance: 400, elapsed_time: 87 },   // work
      { distance: 200, elapsed_time: 115 },   // recovery
      { distance: 400, elapsed_time: 84 },   // work
    ];
    const result = inferDistanceFromLaps(laps);
    expect(result).toEqual({ distance: 400, count: 3 });
  });

  it("detects 800m intervals with recovery", () => {
    const laps = [
      { distance: 800, elapsed_time: 180 },
      { distance: 400, elapsed_time: 300 },
      { distance: 800, elapsed_time: 185 },
      { distance: 400, elapsed_time: 290 },
      { distance: 800, elapsed_time: 182 },
    ];
    const result = inferDistanceFromLaps(laps);
    expect(result).toEqual({ distance: 800, count: 3 });
  });

  it("returns null for steady-pace laps (no interval pattern)", () => {
    // All laps same distance and similar pace — not intervals
    const laps = [
      { distance: 1000, elapsed_time: 300 },
      { distance: 1000, elapsed_time: 305 },
      { distance: 1000, elapsed_time: 298 },
      { distance: 1000, elapsed_time: 302 },
    ];
    expect(inferDistanceFromLaps(laps)).toBeNull();
  });

  it("returns null for empty laps", () => {
    expect(inferDistanceFromLaps([])).toBeNull();
  });
});

// --- calculatePace ---

describe("calculatePace", () => {
  it("calculates pace for 400m in 90s", () => {
    // 90s / 0.4km = 225s/km = 3:45
    expect(calculatePace(400, 90)).toBe("3:45");
  });

  it("calculates pace for 1000m in 240s", () => {
    // 240s / 1km = 4:00
    expect(calculatePace(1000, 240)).toBe("4:00");
  });

  it("calculates pace for 1600m in 360s", () => {
    // 360s / 1.6km = 225s/km = 3:45
    expect(calculatePace(1600, 360)).toBe("3:45");
  });

  it("returns N/A for zero distance", () => {
    expect(calculatePace(0, 90)).toBe("N/A");
  });
});

// --- parseIntervalSession ---

function makeActivity(overrides: Partial<DetailedActivity> = {}): DetailedActivity {
  return {
    id: 1,
    name: "5x400m intervals",
    description: "5x400m with recovery",
    distance: 3200,
    moving_time: 900,
    elapsed_time: 1000,
    start_date: "2024-06-15T10:00:00Z",
    type: "Run",
    sport_type: "Run",
    laps: [
      { id: 1, name: "Lap 1", elapsed_time: 88, distance: 400, moving_time: 85, start_index: 0, end_index: 1, lap_index: 1 },
      { id: 2, name: "Lap 2", elapsed_time: 200, distance: 200, moving_time: 190, start_index: 1, end_index: 2, lap_index: 2 },
      { id: 3, name: "Lap 3", elapsed_time: 90, distance: 400, moving_time: 87, start_index: 2, end_index: 3, lap_index: 3 },
      { id: 4, name: "Lap 4", elapsed_time: 195, distance: 200, moving_time: 185, start_index: 3, end_index: 4, lap_index: 4 },
      { id: 5, name: "Lap 5", elapsed_time: 86, distance: 400, moving_time: 83, start_index: 4, end_index: 5, lap_index: 5 },
    ],
    ...overrides,
  };
}

describe("parseIntervalSession", () => {
  it("detects intervals from description and computes avg time/pace", () => {
    const result = parseIntervalSession(makeActivity());
    expect(result).not.toBeNull();
    expect(result!.distance).toBe(400);
    expect(result!.detected_by).toBe("description");
    expect(result!.sessionDate).toBe("2024-06-15");
    expect(result!.avgTime).toBe(88); // avg of 88, 90, 86
    expect(result!.avgPace).toBe(calculatePace(400, 88));
  });

  it("falls back to lap inference when description has no pattern", () => {
    const result = parseIntervalSession(makeActivity({ name: "Track workout", description: null }));
    expect(result).not.toBeNull();
    expect(result!.detected_by).toBe("lap");
    expect(result!.distance).toBe(400);
  });

  it("returns null with no laps", () => {
    expect(parseIntervalSession(makeActivity({ laps: undefined }))).toBeNull();
  });

  it("returns null with only 1 lap", () => {
    expect(parseIntervalSession(makeActivity({
      laps: [{ id: 1, name: "Lap 1", elapsed_time: 88, distance: 400, moving_time: 85, start_index: 0, end_index: 1, lap_index: 1 }],
    }))).toBeNull();
  });

  it("uses start_date_local for sessionDate when available", () => {
    const result = parseIntervalSession(makeActivity({ start_date_local: "2024-06-15T15:30:00" }));
    expect(result!.sessionDate).toBe("2024-06-15");
  });

  it("returns null for non-interval activity", () => {
    const result = parseIntervalSession(makeActivity({
      name: "Easy jog",
      description: null,
      laps: [
        { id: 1, name: "Lap 1", elapsed_time: 300, distance: 1000, moving_time: 295, start_index: 0, end_index: 1, lap_index: 1 },
        { id: 2, name: "Lap 2", elapsed_time: 305, distance: 1000, moving_time: 300, start_index: 1, end_index: 2, lap_index: 2 },
        { id: 3, name: "Lap 3", elapsed_time: 298, distance: 1000, moving_time: 293, start_index: 2, end_index: 3, lap_index: 3 },
      ],
    }));
    expect(result).toBeNull();
  });
});
