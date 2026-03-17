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

  it("parses asterisk separator", () => {
    expect(parseDescriptionForIntervals("5*400m", null)).toEqual({ distance: 400, count: 5 });
  });

  it("handles grouped set notation like '12 *(400m fast + 200m recovery)'", () => {
    // The '(' after '*' used to break the regex match
    const desc = "2k warmup + 4 * 100m strides + 12 *(400m fast + 200m recovery) + 0.5k cooldown";
    expect(parseDescriptionForIntervals("Intervals", desc)).toEqual({ distance: 400, count: 12 });
  });

  it("picks highest-count match when description has multiple NxDm patterns", () => {
    // 4 * 100m strides should lose to 12 * 400m
    const desc = "4 * 100m strides + 12 * 400m";
    expect(parseDescriptionForIntervals("Workout", desc)).toEqual({ distance: 400, count: 12 });
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

// --- Ladder interval detection ---

describe("parseDescriptionForIntervals - ladder patterns", () => {
  it("parses '200-400-800m' ascending ladder", () => {
    const result = parseDescriptionForIntervals("200-400-800m ladder", null);
    expect(result).toEqual([
      { distance: 200, count: 1 },
      { distance: 400, count: 1 },
      { distance: 800, count: 1 },
    ]);
  });

  it("parses '800-400-200m' descending ladder", () => {
    const result = parseDescriptionForIntervals("800-400-200m", null);
    expect(result).toEqual([
      { distance: 800, count: 1 },
      { distance: 400, count: 1 },
      { distance: 200, count: 1 },
    ]);
  });

  it("parses ladder from description when name has no pattern", () => {
    const result = parseDescriptionForIntervals("Track session", "200-400-800-400-200m pyramid");
    expect(result).toEqual([
      { distance: 200, count: 1 },
      { distance: 400, count: 1 },
      { distance: 800, count: 1 },
      { distance: 400, count: 1 },
      { distance: 200, count: 1 },
    ]);
  });

  it("detects ladder when 'ladder' keyword is in name", () => {
    const result = parseDescriptionForIntervals("Ladder workout", "200, 400, 800, 1200m");
    expect(result).toEqual([
      { distance: 200, count: 1 },
      { distance: 400, count: 1 },
      { distance: 800, count: 1 },
      { distance: 1200, count: 1 },
    ]);
  });

  it("ignores ladder-like sequences with unsupported distances", () => {
    // 300m is not a valid interval distance
    expect(parseDescriptionForIntervals("300-600-900m", null)).toBeNull();
  });

  it("does not treat '5x400m' as a ladder", () => {
    const result = parseDescriptionForIntervals("5x400m intervals", null);
    expect(result).toEqual({ distance: 400, count: 5 });
  });
});

// --- New: asterisk separator and reversed pattern ---

describe("parseDescriptionForIntervals - asterisk and reversed patterns", () => {
  it("parses '4*100m strides' (asterisk separator)", () => {
    expect(parseDescriptionForIntervals("Warmup + 4*100m strides", null))
      .toEqual({ distance: 100, count: 4 });
  });

  it("parses '400m x 5' (reversed pattern)", () => {
    expect(parseDescriptionForIntervals("400m x 5", null))
      .toEqual({ distance: 400, count: 5 });
  });

  it("parses '800m * 3' (reversed with asterisk)", () => {
    expect(parseDescriptionForIntervals("800m * 3", null))
      .toEqual({ distance: 800, count: 3 });
  });

  it("parses '5*400m' (normal with asterisk)", () => {
    expect(parseDescriptionForIntervals("5*400m", null))
      .toEqual({ distance: 400, count: 5 });
  });
});

// --- 100m stride detection ---

describe("parseIntervalSession - tempo run filtering", () => {
  function makeTempoActivity(name: string, laps: Array<{ distance: number; elapsed_time: number }>): DetailedActivity {
    return {
      id: 99,
      name,
      description: null,
      distance: laps.reduce((s, l) => s + l.distance, 0),
      moving_time: laps.reduce((s, l) => s + l.elapsed_time, 0),
      elapsed_time: laps.reduce((s, l) => s + l.elapsed_time, 0),
      start_date: "2024-06-01T08:00:00Z",
      type: "Run",
      sport_type: "Run",
      laps: laps.map((l, i) => ({
        id: i,
        name: `Lap ${i + 1}`,
        elapsed_time: l.elapsed_time,
        distance: l.distance,
        moving_time: l.elapsed_time,
        start_index: i,
        end_index: i + 1,
        lap_index: i + 1,
      })),
    };
  }

  it("does NOT detect 1000m tempo laps as intervals on a tempo run", () => {
    // 10 consistent 1000m laps — classic tempo run
    const laps = Array.from({ length: 10 }, () => ({ distance: 1000, elapsed_time: 340 }));
    const activity = makeTempoActivity("Tempo Run", laps);
    expect(parseIntervalSession(activity)).toBeNull();
  });

  it("DOES detect 100m strides embedded in a tempo run", () => {
    const laps = [
      { distance: 1000, elapsed_time: 420 }, // warmup
      { distance: 100,  elapsed_time: 26 },  // stride
      { distance: 20,   elapsed_time: 29 },  // recovery gap
      { distance: 100,  elapsed_time: 25 },  // stride
      { distance: 20,   elapsed_time: 29 },
      { distance: 100,  elapsed_time: 26 },  // stride
    ];
    const activity = makeTempoActivity("Tempo Run with strides", laps);
    const result = parseIntervalSession(activity);
    expect(result).not.toBeNull();
    expect((result as ParsedInterval).distance).toBe(100);
  });

  it("still detects description-parsed intervals on a tempo run (e.g. Tempo + 5x400m)", () => {
    const activity = makeTempoActivity("Tempo + 5x400m", [
      { distance: 400, elapsed_time: 88 },
      { distance: 200, elapsed_time: 120 },
      { distance: 400, elapsed_time: 90 },
      { distance: 200, elapsed_time: 115 },
      { distance: 400, elapsed_time: 86 },
    ]);
    const result = parseIntervalSession(activity);
    expect(result).not.toBeNull();
    expect((result as ParsedInterval).distance).toBe(400);
    expect((result as ParsedInterval).detected_by).toBe("description");
  });
});

describe("inferDistanceFromLaps - 100m strides", () => {
  // Helper to build a stride lap set: strideCount fast 100m laps,
  // each followed by a tiny 20m standing pause.
  function makeStrideLaps(strideCount: number, warmupLaps: Array<{ distance: number; elapsed_time: number }> = []) {
    const laps: Array<{ distance: number; elapsed_time: number }> = [...warmupLaps];
    for (let i = 0; i < strideCount; i++) {
      laps.push({ distance: 100, elapsed_time: 26 }); // fast stride ~0.26 sec/m
      if (i < strideCount - 1) {
        laps.push({ distance: 20, elapsed_time: 29 }); // standing pause (GPS artifact)
      }
    }
    return laps;
  }

  it("detects 4x100m strides after a warmup lap", () => {
    const laps = makeStrideLaps(4, [{ distance: 1000, elapsed_time: 430 }]);
    const result = inferDistanceFromLaps(laps);
    expect(result).toEqual({ distance: 100, count: 4 });
  });

  it("detects 3x100m strides with no warmup", () => {
    const laps = makeStrideLaps(3);
    const result = inferDistanceFromLaps(laps);
    expect(result).toEqual({ distance: 100, count: 3 });
  });

  it("does NOT detect strides when long laps heavily outnumber 100m laps (tempo run GPS artifacts)", () => {
    // Simulate a tempo run: 10x1000m tempo laps with 3 fast 100m GPS artifact laps in between
    const laps: Array<{ distance: number; elapsed_time: number }> = [];
    // 3 slow 1000m warmup
    for (let i = 0; i < 3; i++) laps.push({ distance: 1000, elapsed_time: 420 });
    // GPS transition artifacts: 1 slow 100m + 3 fast 100m
    laps.push({ distance: 100, elapsed_time: 71 }); // slow
    laps.push({ distance: 20, elapsed_time: 29 });
    laps.push({ distance: 100, elapsed_time: 27 }); // fast
    laps.push({ distance: 20, elapsed_time: 29 });
    laps.push({ distance: 100, elapsed_time: 26 }); // fast
    laps.push({ distance: 20, elapsed_time: 29 });
    laps.push({ distance: 100, elapsed_time: 25 }); // fast
    // 7 fast 1000m tempo laps
    for (let i = 0; i < 7; i++) laps.push({ distance: 1000, elapsed_time: 335 });
    // 1 slow 1000m cooldown
    laps.push({ distance: 1000, elapsed_time: 450 });
    // 11 long laps total (>300m), 3 fast 100m strides → strides < longLaps → blocked
    expect(inferDistanceFromLaps(laps)).toBeNull();
  });
});

describe("inferDistanceFromLaps - ladder patterns", () => {
  it("detects ascending ladder 200-400-800 with recovery laps", () => {
    const laps = [
      { distance: 200, elapsed_time: 38 },   // work
      { distance: 200, elapsed_time: 120 },   // recovery (slow)
      { distance: 400, elapsed_time: 80 },    // work
      { distance: 200, elapsed_time: 120 },   // recovery
      { distance: 800, elapsed_time: 170 },   // work
    ];
    const result = inferDistanceFromLaps(laps);
    expect(result).toEqual([
      { distance: 200, count: 1 },
      { distance: 400, count: 1 },
      { distance: 800, count: 1 },
    ]);
  });

  it("detects descending ladder 800-400-200 with recovery laps", () => {
    const laps = [
      { distance: 800, elapsed_time: 170 },
      { distance: 200, elapsed_time: 120 },
      { distance: 400, elapsed_time: 80 },
      { distance: 200, elapsed_time: 120 },
      { distance: 200, elapsed_time: 38 },
    ];
    const result = inferDistanceFromLaps(laps);
    expect(result).toEqual([
      { distance: 800, count: 1 },
      { distance: 400, count: 1 },
      { distance: 200, count: 1 },
    ]);
  });

  it("does not detect ladder from steady tempo laps", () => {
    const laps = [
      { distance: 1000, elapsed_time: 270 },
      { distance: 1000, elapsed_time: 265 },
      { distance: 1000, elapsed_time: 260 },
      { distance: 1000, elapsed_time: 255 },
    ];
    expect(inferDistanceFromLaps(laps)).toBeNull();
  });

  it("still detects normal same-distance intervals (not ladder)", () => {
    const laps = [
      { distance: 400, elapsed_time: 85 },
      { distance: 200, elapsed_time: 120 },
      { distance: 400, elapsed_time: 87 },
      { distance: 200, elapsed_time: 115 },
      { distance: 400, elapsed_time: 84 },
    ];
    expect(inferDistanceFromLaps(laps)).toEqual({ distance: 400, count: 3 });
  });
});

describe("parseIntervalSession - ladder workouts", () => {
  it("returns array of ParsedIntervals for ladder described in name", () => {
    const activity: DetailedActivity = {
      id: 100,
      name: "200-400-800m ladder",
      description: null,
      distance: 2000,
      moving_time: 600,
      elapsed_time: 900,
      start_date: "2024-07-01T10:00:00Z",
      type: "Run",
      sport_type: "Run",
      laps: [
        { id: 1, name: "Lap 1", elapsed_time: 38, distance: 200, moving_time: 36, start_index: 0, end_index: 1, lap_index: 1 },
        { id: 2, name: "Lap 2", elapsed_time: 120, distance: 200, moving_time: 115, start_index: 1, end_index: 2, lap_index: 2 },
        { id: 3, name: "Lap 3", elapsed_time: 80, distance: 400, moving_time: 78, start_index: 2, end_index: 3, lap_index: 3 },
        { id: 4, name: "Lap 4", elapsed_time: 120, distance: 200, moving_time: 115, start_index: 3, end_index: 4, lap_index: 4 },
        { id: 5, name: "Lap 5", elapsed_time: 170, distance: 800, moving_time: 165, start_index: 4, end_index: 5, lap_index: 5 },
      ],
    };
    const result = parseIntervalSession(activity);
    expect(Array.isArray(result)).toBe(true);
    const arr = result as ParsedInterval[];
    expect(arr).toHaveLength(3);
    expect(arr[0].distance).toBe(200);
    expect(arr[0].avgTime).toBe(38);
    expect(arr[0].detected_by).toBe("description");
    expect(arr[1].distance).toBe(400);
    expect(arr[1].avgTime).toBe(80);
    expect(arr[2].distance).toBe(800);
    expect(arr[2].avgTime).toBe(170);
    // All share same session metadata
    expect(arr.every(i => i.sessionId === 100)).toBe(true);
    expect(arr.every(i => i.sessionDate === "2024-07-01")).toBe(true);
  });

  it("still returns single ParsedInterval for normal same-distance intervals", () => {
    const result = parseIntervalSession(makeActivity());
    expect(result).not.toBeNull();
    expect(Array.isArray(result)).toBe(false);
    expect((result as ParsedInterval).distance).toBe(400);
  });
});
