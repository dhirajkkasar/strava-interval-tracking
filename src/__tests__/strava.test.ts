import {
  extractDescriptionHints,
  inferDistanceFromLaps,
  calculatePace,
  parseIntervalSession,
} from "../lib/strava";
import { DetailedActivity, ParsedInterval } from "../types";

// --- extractDescriptionHints ---

describe("extractDescriptionHints", () => {
  it("extracts distance from 'NxDISTm' in name", () => {
    expect(extractDescriptionHints("5x400m intervals", null)).toEqual([400]);
  });

  it("extracts from description when name has no pattern", () => {
    expect(extractDescriptionHints("Morning run", "3x800m repeats")).toEqual([800]);
  });

  it("extracts × (multiplication sign)", () => {
    expect(extractDescriptionHints("4×1600m", null)).toEqual([1600]);
  });

  it("extracts with spaces around x", () => {
    expect(extractDescriptionHints("6 x 200m", null)).toEqual([200]);
  });

  it("extracts time-based intervals like 5x1min", () => {
    expect(extractDescriptionHints("5x1min intervals", null)).toEqual([-60]);
  });

  it("returns [] for non-interval descriptions", () => {
    expect(extractDescriptionHints("Easy 10k run", "Recovery jog")).toEqual([]);
  });

  it("returns [] for unsupported distances", () => {
    expect(extractDescriptionHints("3x300m", null)).toEqual([]);
  });

  it("returns [] for null/empty inputs", () => {
    expect(extractDescriptionHints(null, null)).toEqual([]);
  });

  it("returns ALL distances when name and description both have patterns", () => {
    // Both distances are valid hints — no preference, both returned
    expect(extractDescriptionHints("5x400m", "3x800m")).toEqual(
      expect.arrayContaining([400, 800])
    );
  });

  it("extracts 600m intervals", () => {
    expect(extractDescriptionHints("5x600m", null)).toEqual([600]);
  });

  it("extracts asterisk separator", () => {
    expect(extractDescriptionHints("5*400m", null)).toEqual([400]);
  });

  it("extracts ALL distances from compound description like '4*100m strides + 12*(400m)'", () => {
    const desc = "2k warmup + 4 * 100m strides + 12 *(400m fast + 200m recovery) + 0.5k cooldown";
    const hints = extractDescriptionHints("Intervals", desc);
    expect(hints).toEqual(expect.arrayContaining([100, 400]));
    expect(hints).toHaveLength(2);
  });

  it("returns both distances when description has multiple NxDm patterns", () => {
    const desc = "4 * 100m strides + 12 * 400m";
    const hints = extractDescriptionHints("Workout", desc);
    expect(hints).toEqual(expect.arrayContaining([100, 400]));
    expect(hints).toHaveLength(2);
  });
});

// --- inferDistanceFromLaps ---

describe("inferDistanceFromLaps", () => {
  it("returns [] with fewer than 3 laps", () => {
    expect(inferDistanceFromLaps([
      { distance: 400, elapsed_time: 90 },
      { distance: 400, elapsed_time: 90 },
    ])).toEqual([]);
  });

  it("detects 400m intervals with recovery laps", () => {
    const laps = [
      { distance: 400, elapsed_time: 85 },
      { distance: 200, elapsed_time: 120 },
      { distance: 400, elapsed_time: 87 },
      { distance: 200, elapsed_time: 115 },
      { distance: 400, elapsed_time: 84 },
    ];
    expect(inferDistanceFromLaps(laps)).toEqual([{ distance: 400, count: 3 }]);
  });

  it("detects 600m intervals with recovery", () => {
    const laps = [
      { distance: 600, elapsed_time: 130 },
      { distance: 200, elapsed_time: 90 },
      { distance: 600, elapsed_time: 133 },
      { distance: 200, elapsed_time: 88 },
      { distance: 600, elapsed_time: 131 },
    ];
    expect(inferDistanceFromLaps(laps)).toEqual([{ distance: 600, count: 3 }]);
  });

  it("detects 800m intervals with recovery", () => {
    const laps = [
      { distance: 800, elapsed_time: 180 },
      { distance: 400, elapsed_time: 300 },
      { distance: 800, elapsed_time: 185 },
      { distance: 400, elapsed_time: 290 },
      { distance: 800, elapsed_time: 182 },
    ];
    expect(inferDistanceFromLaps(laps)).toEqual([{ distance: 800, count: 3 }]);
  });

  it("returns [] for steady-pace laps (no interval pattern)", () => {
    const laps = [
      { distance: 1000, elapsed_time: 300 },
      { distance: 1000, elapsed_time: 305 },
      { distance: 1000, elapsed_time: 298 },
      { distance: 1000, elapsed_time: 302 },
    ];
    expect(inferDistanceFromLaps(laps)).toEqual([]);
  });

  it("returns [] for empty laps", () => {
    expect(inferDistanceFromLaps([])).toEqual([]);
  });
});

// --- calculatePace ---

describe("calculatePace", () => {
  it("calculates pace for 400m in 90s", () => {
    expect(calculatePace(400, 90)).toBe("3:45");
  });

  it("calculates pace for 1000m in 240s", () => {
    expect(calculatePace(1000, 240)).toBe("4:00");
  });

  it("calculates pace for 1600m in 360s", () => {
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
  it("detects 400m intervals and computes avg time/pace", () => {
    const result = parseIntervalSession(makeActivity());
    expect(result).toHaveLength(1);
    expect(result[0].distance).toBe(400);
    expect(result[0].detected_by).toBe("lap");
    expect(result[0].sessionDate).toBe("2024-06-15");
    expect(result[0].avgTime).toBe(85); // avg moving_time of 85, 87, 83
    expect(result[0].avgPace).toBe(calculatePace(400, 85));
  });

  it("detects intervals even when description has no pattern (lap inference)", () => {
    const result = parseIntervalSession(makeActivity({ name: "Track workout", description: null }));
    expect(result).toHaveLength(1);
    expect(result[0].detected_by).toBe("lap");
    expect(result[0].distance).toBe(400);
  });

  it("returns [] with no laps", () => {
    expect(parseIntervalSession(makeActivity({ laps: undefined }))).toEqual([]);
  });

  it("returns [] with only 1 lap", () => {
    expect(parseIntervalSession(makeActivity({
      laps: [{ id: 1, name: "Lap 1", elapsed_time: 88, distance: 400, moving_time: 85, start_index: 0, end_index: 1, lap_index: 1 }],
    }))).toEqual([]);
  });

  it("uses start_date_local for sessionDate when available", () => {
    const result = parseIntervalSession(makeActivity({ start_date_local: "2024-06-15T15:30:00" }));
    expect(result[0].sessionDate).toBe("2024-06-15");
  });

  it("returns [] for non-interval activity", () => {
    const result = parseIntervalSession(makeActivity({
      name: "Easy jog",
      description: null,
      laps: [
        { id: 1, name: "Lap 1", elapsed_time: 300, distance: 1000, moving_time: 295, start_index: 0, end_index: 1, lap_index: 1 },
        { id: 2, name: "Lap 2", elapsed_time: 305, distance: 1000, moving_time: 300, start_index: 1, end_index: 2, lap_index: 2 },
        { id: 3, name: "Lap 3", elapsed_time: 298, distance: 1000, moving_time: 293, start_index: 2, end_index: 3, lap_index: 3 },
      ],
    }));
    expect(result).toEqual([]);
  });
});

// --- extractDescriptionHints - ladder patterns ---

describe("extractDescriptionHints - ladder patterns", () => {
  it("extracts '200-400-800m' ascending ladder", () => {
    const result = extractDescriptionHints("200-400-800m ladder", null);
    expect(result).toEqual(expect.arrayContaining([200, 400, 800]));
    expect(result).toHaveLength(3);
  });

  it("extracts '800-400-200m' descending ladder", () => {
    const result = extractDescriptionHints("800-400-200m", null);
    expect(result).toEqual(expect.arrayContaining([800, 400, 200]));
    expect(result).toHaveLength(3);
  });

  it("extracts ladder from description when name has no pattern", () => {
    const result = extractDescriptionHints("Track session", "200-400-800-400-200m pyramid");
    // Set deduplicates: [200, 400, 800]
    expect(result).toEqual(expect.arrayContaining([200, 400, 800]));
    expect(result).toHaveLength(3);
  });

  it("extracts ladder when 'ladder' keyword is in name", () => {
    const result = extractDescriptionHints("Ladder workout", "200, 400, 800, 1200m");
    expect(result).toEqual(expect.arrayContaining([200, 400, 800, 1200]));
    expect(result).toHaveLength(4);
  });

  it("returns [] for ladder-like sequences with unsupported distances", () => {
    expect(extractDescriptionHints("300-600-900m", null)).toEqual([]);
  });

  it("extracts single distance from '5x400m' (not a ladder)", () => {
    expect(extractDescriptionHints("5x400m intervals", null)).toEqual([400]);
  });
});

// --- extractDescriptionHints - asterisk and reversed patterns ---

describe("extractDescriptionHints - asterisk and reversed patterns", () => {
  it("extracts '4*100m strides' (asterisk separator)", () => {
    expect(extractDescriptionHints("Warmup + 4*100m strides", null)).toEqual([100]);
  });

  it("extracts '400m x 5' (reversed pattern)", () => {
    expect(extractDescriptionHints("400m x 5", null)).toEqual([400]);
  });

  it("extracts '800m * 3' (reversed with asterisk)", () => {
    expect(extractDescriptionHints("800m * 3", null)).toEqual([800]);
  });

  it("extracts '5*400m' (normal with asterisk)", () => {
    expect(extractDescriptionHints("5*400m", null)).toEqual([400]);
  });
});

// --- Tempo run filtering ---

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
    const laps = Array.from({ length: 10 }, () => ({ distance: 1000, elapsed_time: 340 }));
    expect(parseIntervalSession(makeTempoActivity("Tempo Run", laps))).toEqual([]);
  });

  it("DOES detect 100m strides embedded in a tempo run", () => {
    const laps = [
      { distance: 1000, elapsed_time: 420 },
      { distance: 100,  elapsed_time: 26 },
      { distance: 20,   elapsed_time: 29 },
      { distance: 100,  elapsed_time: 25 },
      { distance: 20,   elapsed_time: 29 },
      { distance: 100,  elapsed_time: 26 },
    ];
    const result = parseIntervalSession(makeTempoActivity("Tempo Run with strides", laps));
    expect(result).toHaveLength(1);
    expect(result[0].distance).toBe(100);
  });

  it("detects description-hinted intervals on a tempo run (e.g. Tempo + 5x400m)", () => {
    // The description hints 400m → the tempo guard keeps it even though it's lap-inferred
    const activity: DetailedActivity = {
      ...makeTempoActivity("Tempo + 5x400m", [
        { distance: 400, elapsed_time: 88 },
        { distance: 200, elapsed_time: 120 },
        { distance: 400, elapsed_time: 90 },
        { distance: 200, elapsed_time: 115 },
        { distance: 400, elapsed_time: 86 },
      ]),
      description: null,
    };
    const result = parseIntervalSession(activity);
    expect(result).toHaveLength(1);
    expect(result[0].distance).toBe(400);
    expect(result[0].detected_by).toBe("lap");
  });
});

// --- 100m stride detection ---

describe("inferDistanceFromLaps - 100m strides", () => {
  function makeStrideLaps(strideCount: number, warmupLaps: Array<{ distance: number; elapsed_time: number }> = []) {
    const laps: Array<{ distance: number; elapsed_time: number }> = [...warmupLaps];
    for (let i = 0; i < strideCount; i++) {
      laps.push({ distance: 100, elapsed_time: 26 });
      if (i < strideCount - 1) {
        laps.push({ distance: 20, elapsed_time: 29 });
      }
    }
    return laps;
  }

  it("detects 4x100m strides after a warmup lap", () => {
    const laps = makeStrideLaps(4, [{ distance: 1000, elapsed_time: 430 }]);
    expect(inferDistanceFromLaps(laps)).toEqual([{ distance: 100, count: 4 }]);
  });

  it("detects 3x100m strides with no warmup", () => {
    expect(inferDistanceFromLaps(makeStrideLaps(3))).toEqual([{ distance: 100, count: 3 }]);
  });

  it("does NOT detect strides when long laps heavily outnumber 100m laps (tempo run GPS artifacts)", () => {
    const laps: Array<{ distance: number; elapsed_time: number }> = [];
    for (let i = 0; i < 3; i++) laps.push({ distance: 1000, elapsed_time: 420 });
    laps.push({ distance: 100, elapsed_time: 71 });
    laps.push({ distance: 20, elapsed_time: 29 });
    laps.push({ distance: 100, elapsed_time: 27 });
    laps.push({ distance: 20, elapsed_time: 29 });
    laps.push({ distance: 100, elapsed_time: 26 });
    laps.push({ distance: 20, elapsed_time: 29 });
    laps.push({ distance: 100, elapsed_time: 25 });
    for (let i = 0; i < 7; i++) laps.push({ distance: 1000, elapsed_time: 335 });
    laps.push({ distance: 1000, elapsed_time: 450 });
    expect(inferDistanceFromLaps(laps)).toEqual([]);
  });

  it("detects strides alongside interval work when description hints 100m", () => {
    // 3x400m intervals + 4x100m strides; the hint for 100 bypasses the longLapCount guard
    const laps: Array<{ distance: number; elapsed_time: number }> = [
      { distance: 400, elapsed_time: 85 }, { distance: 200, elapsed_time: 120 },
      { distance: 400, elapsed_time: 87 }, { distance: 200, elapsed_time: 118 },
      { distance: 400, elapsed_time: 84 }, { distance: 200, elapsed_time: 122 },
      { distance: 100, elapsed_time: 26 }, { distance: 20, elapsed_time: 29 },
      { distance: 100, elapsed_time: 25 }, { distance: 20, elapsed_time: 29 },
      { distance: 100, elapsed_time: 26 }, { distance: 20, elapsed_time: 29 },
      { distance: 100, elapsed_time: 27 },
    ];
    const result = inferDistanceFromLaps(laps, [100, 400]);
    const distances = result.map(r => r.distance).sort((a, b) => a - b);
    expect(distances).toEqual([100, 400]);
  });
});

// --- Ladder detection ---

describe("inferDistanceFromLaps - ladder patterns", () => {
  it("detects ascending ladder 200-400-800 with recovery laps", () => {
    const laps = [
      { distance: 200, elapsed_time: 38 },
      { distance: 200, elapsed_time: 120 },
      { distance: 400, elapsed_time: 80 },
      { distance: 200, elapsed_time: 120 },
      { distance: 800, elapsed_time: 170 },
    ];
    expect(inferDistanceFromLaps(laps)).toEqual([
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
    expect(inferDistanceFromLaps(laps)).toEqual([
      { distance: 800, count: 1 },
      { distance: 400, count: 1 },
      { distance: 200, count: 1 },
    ]);
  });

  it("returns [] for steady tempo laps", () => {
    const laps = [
      { distance: 1000, elapsed_time: 270 },
      { distance: 1000, elapsed_time: 265 },
      { distance: 1000, elapsed_time: 260 },
      { distance: 1000, elapsed_time: 255 },
    ];
    expect(inferDistanceFromLaps(laps)).toEqual([]);
  });

  it("still detects normal same-distance intervals (not ladder)", () => {
    const laps = [
      { distance: 400, elapsed_time: 85 },
      { distance: 200, elapsed_time: 120 },
      { distance: 400, elapsed_time: 87 },
      { distance: 200, elapsed_time: 115 },
      { distance: 400, elapsed_time: 84 },
    ];
    expect(inferDistanceFromLaps(laps)).toEqual([{ distance: 400, count: 3 }]);
  });
});

// --- Ladder workouts end-to-end ---

describe("parseIntervalSession - ladder workouts", () => {
  it("returns array of ParsedIntervals for a 200-400-800m ladder", () => {
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
        { id: 1, name: "Lap 1", elapsed_time: 38,  distance: 200, moving_time: 36,  start_index: 0, end_index: 1, lap_index: 1 },
        { id: 2, name: "Lap 2", elapsed_time: 120, distance: 200, moving_time: 115, start_index: 1, end_index: 2, lap_index: 2 },
        { id: 3, name: "Lap 3", elapsed_time: 80,  distance: 400, moving_time: 78,  start_index: 2, end_index: 3, lap_index: 3 },
        { id: 4, name: "Lap 4", elapsed_time: 120, distance: 200, moving_time: 115, start_index: 3, end_index: 4, lap_index: 4 },
        { id: 5, name: "Lap 5", elapsed_time: 170, distance: 800, moving_time: 165, start_index: 4, end_index: 5, lap_index: 5 },
      ],
    };
    const result = parseIntervalSession(activity);
    expect(result).toHaveLength(3);
    // Each distance uses the fastest matching lap (count:1)
    const r200 = result.find(r => r.distance === 200)!;
    const r400 = result.find(r => r.distance === 400)!;
    const r800 = result.find(r => r.distance === 800)!;
    expect(r200.avgTime).toBe(36);   // fastest 200m lap by moving_time
    expect(r400.avgTime).toBe(78);
    expect(r800.avgTime).toBe(165);
    expect(result.every(i => i.sessionId === 100)).toBe(true);
    expect(result.every(i => i.sessionDate === "2024-07-01")).toBe(true);
    expect(result.every(i => i.detected_by === "lap")).toBe(true);
  });

  it("returns single-element array for normal same-distance intervals", () => {
    const result = parseIntervalSession(makeActivity());
    expect(result).toHaveLength(1);
    expect(result[0].distance).toBe(400);
  });
});

// --- Real-data fixtures from docs/filtered.json ---

// eslint-disable-next-line @typescript-eslint/no-var-requires
const filteredActivities = require("../../docs/filtered.json") as Array<{
  id: number;
  name: string;
  description: string;
  start_date_local: string;
  valid: string[] | false;
  laps: Array<{ lap_index: number; distance: number; elapsed_time: number; moving_time: number }>;
}>;

function makeRealActivity(
  id: number,
  name: string,
  description: string | null,
  startDateLocal: string,
  laps: Array<{ lap_index: number; distance: number; elapsed_time: number; moving_time: number }>
): DetailedActivity {
  return {
    id, name, description,
    distance: laps.reduce((s, l) => s + l.distance, 0),
    moving_time: laps.reduce((s, l) => s + l.moving_time, 0),
    elapsed_time: laps.reduce((s, l) => s + l.elapsed_time, 0),
    start_date: startDateLocal,
    start_date_local: startDateLocal,
    type: "Run", sport_type: "Run",
    laps: laps.map((l, i) => ({
      id: i, name: `Lap ${l.lap_index}`,
      elapsed_time: l.elapsed_time, distance: l.distance, moving_time: l.moving_time,
      start_index: i, end_index: i + 1, lap_index: l.lap_index,
    })),
  };
}

describe("real-data NEGATIVE: should return []", () => {
  const negatives = filteredActivities.filter(a => a.valid === false);

  it.each(negatives.map(a => [a.name, a] as [string, (typeof negatives)[0]]))(
    "%s (id: %s)",
    (_, a) => {
      const result = parseIntervalSession(
        makeRealActivity(a.id, a.name, a.description || null, a.start_date_local, a.laps)
      );
      expect(result).toEqual([]);
    }
  );
});

// Parse a valid label like "4 laps of 100m with 30 sec rest" or
// "10 intervals of 90sec run + 90sec rest" or "14 intervals of 1min run + 75sec rest"
// Also handles "2 laps of 1k ..." and "13 laps of 1 min ..."
function parseValidLabel(label: string): { distance: number; count: number } | null {
  let m = label.match(/^(\d+) laps of (\d+)m/);
  if (m) return { count: parseInt(m[1]), distance: parseInt(m[2]) };

  m = label.match(/^(\d+) laps of 1k/);
  if (m) return { count: parseInt(m[1]), distance: 1000 };

  m = label.match(/^(\d+) laps of (\d+) min/);
  if (m) return { count: parseInt(m[1]), distance: -parseInt(m[2]) * 60 };

  m = label.match(/^(\d+) intervals of (\d+)sec/);
  if (m) return { count: parseInt(m[1]), distance: -parseInt(m[2]) };

  m = label.match(/^(\d+) intervals of (\d+)min/);
  if (m) return { count: parseInt(m[1]), distance: -parseInt(m[2]) * 60 };

  return null;
}

describe("real-data POSITIVE: should detect intervals", () => {
  const positives = filteredActivities.filter(a => Array.isArray(a.valid));

  it.each(positives.map(a => [a.name, a] as [string, (typeof positives)[0]]))(
    "%s (id: %s)",
    (_, a) => {
      const result = parseIntervalSession(
        makeRealActivity(a.id, a.name, a.description || null, a.start_date_local, a.laps)
      );
      expect(result.length).toBeGreaterThan(0);

      for (const label of a.valid as string[]) {
        const expected = parseValidLabel(label);
        if (!expected) continue;

        const match = result.find(r => r.distance === expected.distance);
        expect({ label, detectedDistances: result.map(r => r.distance), match }).toMatchObject({
          match: expect.objectContaining({ distance: expected.distance, count: expected.count }),
        });
      }
    }
  );
});

// --- Additional real-data fixtures from docs/additionalActivities.json ---

// eslint-disable-next-line @typescript-eslint/no-var-requires
const additionalActivities = require("../../docs/additionalActivities.json") as Array<{
  id: number;
  name: string;
  description: string;
  start_date_local: string;
  valid: string[] | false;
  laps: Array<{ lap_index: number; distance: number; elapsed_time: number; moving_time: number }>;
}>;

describe("additional real-data POSITIVE: should detect intervals", () => {
  const positives = additionalActivities.filter(a => Array.isArray(a.valid));

  it.each(positives.map(a => [a.name, a] as [string, (typeof positives)[0]]))(
    "%s (id: %s)",
    (_, a) => {
      const result = parseIntervalSession(
        makeRealActivity(a.id, a.name, a.description || null, a.start_date_local, a.laps)
      );
      expect(result.length).toBeGreaterThan(0);

      for (const label of a.valid as string[]) {
        const expected = parseValidLabel(label);
        if (!expected) continue;

        const match = result.find(r => r.distance === expected.distance);
        expect({ label, detectedDistances: result.map(r => r.distance), match }).toMatchObject({
          match: expect.objectContaining({ distance: expected.distance, count: expected.count }),
        });
      }
    }
  );
});

// --- Multi-distance activity ---

describe("parseIntervalSession - multi-distance activity", () => {
  it("returns both 100m strides and 400m intervals from same activity", () => {
    // 3x400m with 200m recovery + 4x100m strides with 20m GPS pauses
    const activity: DetailedActivity = {
      id: 200,
      name: "Intervals",
      description: "4 * 100m strides + 3 * 400m",
      distance: 5000,
      moving_time: 1200,
      elapsed_time: 1500,
      start_date: "2026-01-06T07:00:00Z",
      type: "Run",
      sport_type: "Run",
      laps: [
        // 3x400m intervals with 200m recovery
        { id: 1,  name: "Lap 1",  elapsed_time: 85,  distance: 400, moving_time: 83,  start_index: 0,  end_index: 1,  lap_index: 1 },
        { id: 2,  name: "Lap 2",  elapsed_time: 120, distance: 200, moving_time: 118, start_index: 1,  end_index: 2,  lap_index: 2 },
        { id: 3,  name: "Lap 3",  elapsed_time: 87,  distance: 400, moving_time: 85,  start_index: 2,  end_index: 3,  lap_index: 3 },
        { id: 4,  name: "Lap 4",  elapsed_time: 118, distance: 200, moving_time: 116, start_index: 3,  end_index: 4,  lap_index: 4 },
        { id: 5,  name: "Lap 5",  elapsed_time: 84,  distance: 400, moving_time: 82,  start_index: 4,  end_index: 5,  lap_index: 5 },
        { id: 6,  name: "Lap 6",  elapsed_time: 122, distance: 200, moving_time: 120, start_index: 5,  end_index: 6,  lap_index: 6 },
        // 4x100m strides with 20m GPS pauses between them
        { id: 7,  name: "Lap 7",  elapsed_time: 26,  distance: 100, moving_time: 25,  start_index: 6,  end_index: 7,  lap_index: 7 },
        { id: 8,  name: "Lap 8",  elapsed_time: 29,  distance: 20,  moving_time: 28,  start_index: 7,  end_index: 8,  lap_index: 8 },
        { id: 9,  name: "Lap 9",  elapsed_time: 25,  distance: 100, moving_time: 24,  start_index: 8,  end_index: 9,  lap_index: 9 },
        { id: 10, name: "Lap 10", elapsed_time: 29,  distance: 20,  moving_time: 28,  start_index: 9,  end_index: 10, lap_index: 10 },
        { id: 11, name: "Lap 11", elapsed_time: 26,  distance: 100, moving_time: 25,  start_index: 10, end_index: 11, lap_index: 11 },
        { id: 12, name: "Lap 12", elapsed_time: 29,  distance: 20,  moving_time: 28,  start_index: 11, end_index: 12, lap_index: 12 },
        { id: 13, name: "Lap 13", elapsed_time: 27,  distance: 100, moving_time: 26,  start_index: 12, end_index: 13, lap_index: 13 },
      ],
    };

    const result = parseIntervalSession(activity);
    expect(result).toHaveLength(2);

    const distances = result.map(r => r.distance).sort((a, b) => a - b);
    expect(distances).toEqual([100, 400]);

    const r400 = result.find(r => r.distance === 400)!;
    const r100 = result.find(r => r.distance === 100)!;

    expect(r400.avgTime).toBe(83); // avg moving_time of 83, 85, 82 = 83.3 → 83
    expect(r100.avgTime).toBe(25); // avg moving_time of 25, 24, 25, 26 = 25
    expect(result.every(r => r.detected_by === "lap")).toBe(true);
    expect(result.every(r => r.sessionDate === "2026-01-06")).toBe(true);
  });
});
