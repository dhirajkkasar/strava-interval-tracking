import { DetailedActivity, ParsedInterval, INTERVAL_DISTANCES, isTimeBasedInterval, getIntervalDurationSeconds } from "../types";
import { MOCK_ACTIVITIES } from "./mock-data";


const DEMO_MODE = process.env.DEMO_MODE === "true";

/**
 * Parse activity name/description for interval patterns like "5x400m", "3x800m", "5x1min", etc.
 */
function parseDescriptionForIntervals(
  name: string | null,
  description: string | null
): { distance: number; count: number } | null {
  // Check both name and description
  const texts = [name, description].filter(Boolean) as string[];
  if (texts.length === 0) return null;

  for (const text of texts) {
    // Time-based: "5x1min", "5 x 2 min", "5×1min"
    const timePatterns = [
      /(\d+)\s*[x×]\s*(\d+)\s*min/gi,
    ];

    for (const pattern of timePatterns) {
      pattern.lastIndex = 0;
      const match = pattern.exec(text);
      if (match) {
        const count = parseInt(match[1]);
        const minutes = parseInt(match[2]);
        const intervalValue = -(minutes * 60);
        const validValues = Object.values(INTERVAL_DISTANCES);
        if (validValues.includes(intervalValue as typeof validValues[number])) {
          return { distance: intervalValue, count };
        }
      }
    }

    // Distance-based: "5x400m", "5 x 400m", "5×400m", "400m x 5", "5 repeat of 400m"
    const distPatterns = [
      /(\d+)\s*[x×]\s*(\d+)\s*(?:m|meter)/gi,
      /(\d+)\s*(?:m|meter)\s*[x×]\s*(\d+)/gi,       // 400m x 5 (reversed)
      /(\d+)\s*repeat\s*(?:of\s+)?(\d+)\s*m/gi,
    ];

    for (const pattern of distPatterns) {
      pattern.lastIndex = 0;
      const match = pattern.exec(text);
      if (match) {
        let count: number, distance: number;
        // For reversed pattern "400m x 5", match[1] is distance, match[2] is count
        if (pattern.source.includes("meter\\s")) {
          distance = parseInt(match[1]);
          count = parseInt(match[2]);
        } else {
          count = parseInt(match[1]);
          distance = parseInt(match[2]);
        }

        const validDistances = Object.values(INTERVAL_DISTANCES);
        if (validDistances.includes(distance as typeof validDistances[number])) {
          return { distance, count };
        }
      }
    }
  }

  return null;
}

/**
 * Infer interval distance from lap data.
 * Intervals are distinguished from steady/tempo runs by requiring recovery laps
 * interspersed between work laps — the hallmark of interval training.
 */
function inferDistanceFromLaps(
  laps: any[]
): { distance: number; count: number } | null {
  if (!laps || laps.length < 3) return null;

  const validValues = Object.values(INTERVAL_DISTANCES);
  const paces = laps.map((lap: any) => lap.elapsed_time / (lap.distance || 1));

  /**
   * Verify interval pattern: work laps must have recovery gaps between them
   * and be faster than the non-work laps.
   */
  function hasIntervalPattern(matchedIndices: Set<number>): boolean {
    if (matchedIndices.size < 2) return false;

    const workIndices = [...matchedIndices].sort((a, b) => a - b);
    const restIndices = laps
      .map((_: any, i: number) => i)
      .filter((i: number) => !matchedIndices.has(i));

    if (restIndices.length === 0) return false;

    // Check that gaps between work laps contain slower recovery laps
    let recoveryGaps = 0;
    let totalGaps = 0;
    const avgWorkPace =
      workIndices.reduce((s: number, i: number) => s + paces[i], 0) / workIndices.length;

    for (let i = 0; i < workIndices.length - 1; i++) {
      const from = workIndices[i];
      const to = workIndices[i + 1];
      if (to - from <= 1) continue;
      totalGaps++;
      const gapLaps = laps.slice(from + 1, to);
      // At least one lap in the gap must be slower than work pace
      const hasSlower = gapLaps.some(
        (lap: any) => lap.elapsed_time / (lap.distance || 1) > avgWorkPace
      );
      if (hasSlower) recoveryGaps++;
    }

    // Need at least half of gaps to be recovery, and at least 1 gap
    if (totalGaps === 0 || recoveryGaps < totalGaps * 0.5) return false;

    // Work laps must be ≥20% faster pace than rest laps
    const avgRestPace =
      restIndices.reduce((s: number, i: number) => s + paces[i], 0) / restIndices.length;

    return avgWorkPace < avgRestPace * 0.8;
  }

  // --- Time-based matching ---
  // Special case: when all laps have similar elapsed_time (e.g., all 60s),
  // use distance variance to split work vs rest
  const timeBuckets: { [key: number]: Set<number> } = {};
  laps.forEach((lap: any, i: number) => {
    const match = validValues.find(
      (v) => v < 0 && Math.abs(Math.abs(v) - lap.elapsed_time) < Math.abs(v) * 0.15
    );
    if (match) {
      if (!timeBuckets[match]) timeBuckets[match] = new Set();
      timeBuckets[match].add(i);
    }
  });

  for (const [val, indices] of Object.entries(timeBuckets)) {
    // If most laps match this time bucket, split by distance
    if (indices.size > laps.length * 0.6) {
      const matchedLaps = [...indices].map((i) => ({ i, dist: laps[i].distance }));
      const medianDist = matchedLaps
        .map((l) => l.dist)
        .sort((a: number, b: number) => a - b)[Math.floor(matchedLaps.length / 2)];
      // Work laps are the ones covering more distance (faster running)
      const workIndices = new Set(
        matchedLaps.filter((l) => l.dist > medianDist * 0.6).map((l) => l.i)
      );
      if (workIndices.size >= 2 && workIndices.size < indices.size) {
        return { distance: Number(val), count: workIndices.size };
      }
    }
    // Normal case: check for interval pattern
    if (hasIntervalPattern(indices)) {
      return { distance: Number(val), count: indices.size };
    }
  }

  // --- Distance-based matching ---
  const distBuckets: { [key: number]: Set<number> } = {};
  laps.forEach((lap: any, i: number) => {
    const match = validValues.find((d) => d > 0 && Math.abs(d - lap.distance) < d * 0.15);
    if (match) {
      if (!distBuckets[match]) distBuckets[match] = new Set();
      distBuckets[match].add(i);
    }
  });

  // Filter to buckets that pass interval pattern, then prefer LARGER distance
  // (work laps are typically longer distances, recovery jogs are shorter)
  const validDistBuckets = Object.entries(distBuckets)
    .filter(([, indices]) => hasIntervalPattern(indices))
    .sort((a, b) => Number(b[0]) - Number(a[0])); // prefer larger distance

  if (validDistBuckets.length > 0) {
    const [dist, indices] = validDistBuckets[0];
    return { distance: Number(dist), count: indices.size };
  }

  return null;
}

/**
 * Calculate average pace in min/km
 */
export function calculatePace(distance: number, timeSeconds: number): string {
  if (distance === 0) return "N/A";
  const kmDistance = distance / 1000;
  const totalMinutes = timeSeconds / 60;
  const paceMinutes = totalMinutes / kmDistance;

  const minutes = Math.floor(paceMinutes);
  const seconds = Math.round((paceMinutes - minutes) * 60);

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Parse interval session from activity
 * Returns array of intervals found in the activity
 */
export function parseIntervalSession(
  activity: DetailedActivity
): ParsedInterval | null {
  const { id, name, description, start_date, start_date_local } = activity;

  // Need at least 2 laps for interval detection
  if (!activity.laps || activity.laps.length < 2) return null;

  let detected: { distance: number; count: number } | null = null;
  let detected_by: "description" | "lap" | "segment" | "unknown" = "unknown";

  // Try to parse from name/description first
  detected = parseDescriptionForIntervals(name, description);
  if (detected) {
    detected_by = "description";
  }

  // Fall back to lap data analysis
  if (!detected) {
    detected = inferDistanceFromLaps(activity.laps);
    if (detected) {
      detected_by = "lap";
    }
  }

  // If no detection, return null
  if (!detected) return null;

  // Calculate average time for the interval distance
  let totalIntervalTime = 0;
  let intervalCount = 0;
  let totalIntervalDistance = 0;

  if (activity.laps) {
    if (isTimeBasedInterval(detected.distance)) {
      // Time-based: match laps by elapsed_time
      const targetSeconds = getIntervalDurationSeconds(detected.distance);
      for (const lap of activity.laps) {
        if (Math.abs(lap.elapsed_time - targetSeconds) < targetSeconds * 0.15) {
          totalIntervalTime += lap.elapsed_time;
          totalIntervalDistance += lap.distance;
          intervalCount++;
        }
      }
    } else {
      // Distance-based: match laps by distance
      for (const lap of activity.laps) {
        if (Math.abs(lap.distance - detected.distance) < detected.distance * 0.15) {
          totalIntervalTime += lap.elapsed_time;
          intervalCount++;
        }
      }
    }
  }

  if (intervalCount === 0) return null;

  const avgTime = Math.round(totalIntervalTime / intervalCount);
  // For time-based intervals, calculate pace from average distance covered
  const avgPace = isTimeBasedInterval(detected.distance)
    ? calculatePace(totalIntervalDistance / intervalCount, avgTime)
    : calculatePace(detected.distance, avgTime);

  return {
    sessionId: id,
    sessionDate: (start_date_local || start_date).split("T")[0],
    activityName: name,
    distance: detected.distance,
    avgTime,
    avgPace,
    ...(isTimeBasedInterval(detected.distance) && {
      avgCoveredDistance: Math.round(totalIntervalDistance / intervalCount),
    }),
    detected_by,
  };
}

/**
 * Fetch and filter activities from Strava API
 */
export async function fetchStravaActivities(
  accessToken: string,
  before?: number,
  after?: number
): Promise<any[]> {
  // Use mock data in demo mode
  if (DEMO_MODE) {
    return MOCK_ACTIVITIES.filter((activity) => {
      const activityTime = new Date(activity.start_date).getTime() / 1000;
      const passBeforeFilter = !before || activityTime < before;
      const passAfterFilter = !after || activityTime > after;
      return passBeforeFilter && passAfterFilter;
    });
  }

  const params = new URLSearchParams();
  if (before) params.append("before", before.toString());
  if (after) params.append("after", after.toString());
  params.append("per_page", "200");

  const allActivities: any[] = [];
  let page = 1;

  while (true) {
    params.set("page", page.toString());
    const response = await fetch(
      `https://www.strava.com/api/v3/athlete/activities?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Strava API error: ${response.statusText}`);
    }

    const batch: any[] = await response.json();
    allActivities.push(...batch);

    if (batch.length < 200) break;
    page++;
  }

  return allActivities;
}

/**
 * Fetch detailed activity with laps and segments
 */
export async function fetchDetailedActivity(
  accessToken: string,
  activityId: number
): Promise<DetailedActivity> {
  // Use mock data in demo mode
  if (DEMO_MODE) {
    const mockActivity = MOCK_ACTIVITIES.find((a) => a.id === activityId);
    if (!mockActivity) {
      throw new Error(`Activity ${activityId} not found in demo data`);
    }
    return mockActivity;
  }

  const response = await fetch(
    `https://www.strava.com/api/v3/activities/${activityId}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch activity ${activityId}`);
  }

  return response.json();
}
