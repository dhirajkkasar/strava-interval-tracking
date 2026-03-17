import { DetailedActivity, ParsedInterval, INTERVAL_DISTANCES, isTimeBasedInterval, getIntervalDurationSeconds } from "../types";

/**
 * Parse activity name/description for interval patterns like "5x400m", "3x800m", "5x1min", etc.
 */
type DetectedInterval = { distance: number; count: number };

export function parseDescriptionForIntervals(
  name: string | null,
  description: string | null
): DetectedInterval | DetectedInterval[] | null {
  // Check both name and description
  const texts = [name, description].filter(Boolean) as string[];
  if (texts.length === 0) return null;

  const allTexts = texts.join(" ");
  const isLadderKeyword = /ladder|pyramid/i.test(allTexts);
  const validDistances = Object.values(INTERVAL_DISTANCES);

  for (const text of texts) {
    // Time-based: "5x1min", "5 x 2 min", "5×1min", "5*1min"
    const timePatterns = [
      /(\d+)\s*[x×*]\s*(\d+)\s*min/gi,
    ];

    for (const pattern of timePatterns) {
      pattern.lastIndex = 0;
      const match = pattern.exec(text);
      if (match) {
        const count = parseInt(match[1]);
        const minutes = parseInt(match[2]);
        const intervalValue = -(minutes * 60);
        if (validDistances.includes(intervalValue as typeof validDistances[number])) {
          return { distance: intervalValue, count };
        }
      }
    }

    // Distance-based: "5x400m", "5 x 400m", "5×400m", "5*400m", "400m x 5", "5 repeat of 400m"
    const distPatterns: Array<{ regex: RegExp; reversed: boolean }> = [
      { regex: /(\d+)\s*[x×*]\s*(\d+)\s*(?:m|meter)/gi, reversed: false },  // 5x400m
      { regex: /(\d+)\s*(?:m|meter)\s*[x×*]\s*(\d+)/gi, reversed: true },   // 400m x 5
      { regex: /(\d+)\s*repeat\s*(?:of\s+)?(\d+)\s*m/gi, reversed: false }, // 5 repeat of 400m
    ];

    for (const { regex, reversed } of distPatterns) {
      regex.lastIndex = 0;
      const match = regex.exec(text);
      if (match) {
        const count    = reversed ? parseInt(match[2]) : parseInt(match[1]);
        const distance = reversed ? parseInt(match[1]) : parseInt(match[2]);
        if (validDistances.includes(distance as typeof validDistances[number])) {
          return { distance, count };
        }
      }
    }

    // Ladder: "200-400-800m", "200, 400, 800m", "200/400/800m"
    // Requires "ladder"/"pyramid" keyword OR the sequence itself ends with m
    const ladderMatch = text.match(/(\d+(?:\s*[-,/]\s*\d+)+)\s*m\b/i);
    if (ladderMatch) {
      const nums = ladderMatch[1].split(/\s*[-,/]\s*/).map(Number);
      if (nums.length >= 2) {
        // Every distance must be a valid interval distance
        const allValid = nums.every(d =>
          validDistances.includes(d as typeof validDistances[number])
        );
        // Must be ascending or descending (not all same — that's NxDm territory)
        const isAscending = nums.every((d, i) => i === 0 || d >= nums[i - 1]);
        const isDescending = nums.every((d, i) => i === 0 || d <= nums[i - 1]);
        const allSame = nums.every(d => d === nums[0]);
        if (allValid && !allSame && (isAscending || isDescending || isLadderKeyword)) {
          return nums.map(d => ({ distance: d, count: 1 }));
        }
      }
    }
  }

  // Check if "ladder" keyword present but distances are in the other text field
  if (isLadderKeyword) {
    for (const text of texts) {
      const commaMatch = text.match(/(\d+(?:\s*,\s*\d+)+)\s*m?\b/i);
      if (commaMatch) {
        const nums = commaMatch[1].split(/\s*,\s*/).map(Number);
        if (nums.length >= 2) {
          const allValid = nums.every(d =>
            validDistances.includes(d as typeof validDistances[number])
          );
          const allSame = nums.every(d => d === nums[0]);
          if (allValid && !allSame) {
            return nums.map(d => ({ distance: d, count: 1 }));
          }
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
export function inferDistanceFromLaps(
  rawLaps: any[]
): DetectedInterval | DetectedInterval[] | null {
  if (!rawLaps || rawLaps.length < 3) return null;

  // Filter out micro-laps (<50m) — GPS noise, drills, standing pauses
  const laps = rawLaps.filter((lap: any) => lap.distance >= 50);
  if (laps.length < 3) return null;

  const validValues = Object.values(INTERVAL_DISTANCES);
  const paces = laps.map((lap: any) => lap.elapsed_time / (lap.distance || 1));

  /**
   * Verify interval pattern: work laps must be individually separated by
   * recovery laps (not forming one continuous block like a tempo run).
   */
  function hasIntervalPattern(matchedIndices: Set<number>): boolean {
    if (matchedIndices.size < 3) return false;

    const workIndices = [...matchedIndices].sort((a, b) => a - b);
    const restIndices = laps
      .map((_: any, i: number) => i)
      .filter((i: number) => !matchedIndices.has(i));

    if (restIndices.length === 0) return false;

    // Reject continuous blocks: every consecutive pair of work laps must
    // have at least one non-work lap between them. Count how many do.
    let separatedPairs = 0;
    for (let i = 0; i < workIndices.length - 1; i++) {
      if (workIndices[i + 1] - workIndices[i] > 1) separatedPairs++;
    }
    // At least 75% of consecutive pairs must be separated by recovery.
    // 50% was too permissive — tempo runs with GPS artifact laps could pass.
    if (separatedPairs < (workIndices.length - 1) * 0.75) return false;

    // For pace comparison, use only meaningful rest laps (≥100m).
    // Tiny GPS artifacts (50–99m) have unreliable paces and skew the average.
    const meaningfulRestIndices = restIndices.filter((i: number) => laps[i].distance >= 100);
    const restForPace = meaningfulRestIndices.length > 0 ? meaningfulRestIndices : restIndices;

    // Work laps must be meaningfully faster than rest laps
    const avgWorkPace =
      workIndices.reduce((s: number, i: number) => s + paces[i], 0) / workIndices.length;
    const avgRestPace =
      restForPace.reduce((s: number, i: number) => s + paces[i], 0) / restForPace.length;

    if (avgWorkPace >= avgRestPace * 0.8) return false;

    return true;
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
    // If all matched laps cover a consistent distance (within 20%), this is
    // almost certainly a distance-based interval whose time happens to fall
    // near a time-bucket boundary. Skip it and let distance detection handle it.
    const matchedDists = [...indices].map((i) => laps[i].distance);
    const distMin = Math.min(...matchedDists);
    const distMax = Math.max(...matchedDists);
    if (distMax < distMin * 1.2) continue;

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

  // --- 100m stride detection (operates on rawLaps to preserve recovery gaps) ---
  // Criterion: fast 100m laps separated by very slow or tiny recovery laps.
  // GPS artifact 100m laps in tempo/interval runs are ruled out by requiring
  // that strides outnumber the longer-distance laps in the activity.
  {
    const STRIDE_PACE_THRESHOLD = 0.40; // faster than 6:40/km (0.40 sec/m)
    const fastStrideLaps: number[] = [];
    for (let i = 0; i < rawLaps.length; i++) {
      const lap = rawLaps[i];
      if (Math.abs(lap.distance - 100) <= 100 * 0.15) {
        if (lap.elapsed_time / (lap.distance || 1) < STRIDE_PACE_THRESHOLD) {
          fastStrideLaps.push(i);
        }
      }
    }

    if (fastStrideLaps.length >= 3) {
      // Count laps with distance > 300m in the raw activity.
      // If there are more long laps than strides, the 100m laps are likely
      // GPS transition artifacts in a longer run (tempo/intervals), not real strides.
      const longLapCount = rawLaps.filter((l: any) => l.distance > 300).length;
      if (fastStrideLaps.length >= longLapCount) {
        // Check that consecutive strides are separated by a slow/tiny recovery:
        // either a sub-50m GPS drift lap OR any lap at walking pace (>1.5 sec/m).
        let separatedPairs = 0;
        for (let i = 0; i < fastStrideLaps.length - 1; i++) {
          const a = fastStrideLaps[i], b = fastStrideLaps[i + 1];
          if (b > a + 1) {
            const between = rawLaps.slice(a + 1, b);
            const hasRecovery = between.some((l: any) =>
              l.distance < 50 || l.elapsed_time / (l.distance || 1) > 1.5
            );
            if (hasRecovery) separatedPairs++;
          }
        }
        const required = Math.ceil((fastStrideLaps.length - 1) * 0.5);
        if (separatedPairs >= required) {
          return { distance: 100, count: fastStrideLaps.length };
        }
      }
    }
  }

  // --- Ladder detection ---
  // Identify fast (work) laps by pace, then check if they form an
  // ascending or descending sequence of different valid distances.
  const avgPace = paces.reduce((s, p) => s + p, 0) / paces.length;
  const fastLaps: { index: number; distance: number }[] = [];
  laps.forEach((lap: any, i: number) => {
    if (paces[i] > avgPace) return; // skip slow laps
    const match = validValues.find((d) => d > 0 && Math.abs(d - lap.distance) < d * 0.15);
    if (match) fastLaps.push({ index: i, distance: match });
  });

  if (fastLaps.length >= 3) {
    const uniqueDists = new Set(fastLaps.map(m => m.distance));
    if (uniqueDists.size >= 3) {
      const distances = fastLaps.map(m => m.distance);
      const isAscending = distances.every((d, i) => i === 0 || d >= distances[i - 1]);
      const isDescending = distances.every((d, i) => i === 0 || d <= distances[i - 1]);

      if (isAscending || isDescending) {
        return fastLaps.map(m => ({ distance: m.distance, count: 1 }));
      }
    }
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
): ParsedInterval | ParsedInterval[] | null {
  const { id, name, description, start_date, start_date_local } = activity;

  // Need at least 2 laps for interval detection
  if (!activity.laps || activity.laps.length < 2) return null;

  let detected: DetectedInterval | DetectedInterval[] | null = null;
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

  if (!detected) return null;

  const sessionDate = (start_date_local || start_date).split("T")[0];

  // Ladder: return one ParsedInterval per distance
  if (Array.isArray(detected)) {
    return detected.map(d => {
      // Find the best matching lap for this distance
      const matchingLap = activity.laps!.find(
        lap => Math.abs(lap.distance - d.distance) < d.distance * 0.15
      );
      const time = matchingLap ? matchingLap.elapsed_time : 0;
      return {
        sessionId: id,
        sessionDate,
        activityName: name,
        distance: d.distance,
        avgTime: Math.round(time),
        avgPace: calculatePace(d.distance, time),
        detected_by,
      };
    });
  }

  // Single distance: existing logic
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
