import { DetailedActivity, ParsedInterval, INTERVAL_DISTANCES, isTimeBasedInterval, getIntervalDurationSeconds } from "../types";

type DetectedInterval = { distance: number; count: number };

/**
 * Extract candidate interval distances from activity name/description.
 * Returns a flat list of valid distances found (e.g. [100, 400] or [-60]).
 * This is used as a hint to guide lap inference — laps always validate.
 */
export function extractDescriptionHints(
  name: string | null,
  description: string | null
): number[] {
  const texts = [name, description].filter(Boolean) as string[];
  if (texts.length === 0) return [];

  const allTexts = texts.join(" ");
  const isLadderKeyword = /ladder|pyramid/i.test(allTexts);
  const validDistances = Object.values(INTERVAL_DISTANCES);
  const hints = new Set<number>();

  for (const text of texts) {
    // Time-based: "5x1min", "5 x 2 min", "5×1min", "5*1min", "13 * (1min"
    const timePattern = /(\d+)\s*[x×*]\s*\(?\s*(\d+)\s*min/gi;
    timePattern.lastIndex = 0;
    let match;
    while ((match = timePattern.exec(text)) !== null) {
      const intervalValue = -(parseInt(match[2]) * 60);
      if (validDistances.includes(intervalValue as typeof validDistances[number])) {
        hints.add(intervalValue);
      }
    }

    // Distance-based: "5x400m", "5 x 400m", "5×400m", "5*400m", "400m x 5",
    // "5 repeat of 400m", and grouped sets like "12 *(400m fast + 200m recovery)"
    const distPatterns: Array<{ regex: RegExp; reversed: boolean }> = [
      { regex: /(\d+)\s*[x×*]\s*\(?\s*(\d+)\s*(?:m|meter)/gi, reversed: false },
      { regex: /(\d+)\s*(?:m|meter)\s*[x×*]\s*(\d+)/gi, reversed: true },
      { regex: /(\d+)\s*repeat\s*(?:of\s+)?(\d+)\s*m/gi, reversed: false },
    ];
    for (const { regex, reversed } of distPatterns) {
      regex.lastIndex = 0;
      while ((match = regex.exec(text)) !== null) {
        const distance = reversed ? parseInt(match[1]) : parseInt(match[2]);
        if (validDistances.includes(distance as typeof validDistances[number])) {
          hints.add(distance);
        }
      }
    }

    // "1k" shorthand: "2*1k", "5 x 1k", "5*(1k..."
    const kPattern = /\d+\s*[x×*]\s*\(?\s*1k\b/gi;
    kPattern.lastIndex = 0;
    while (kPattern.exec(text) !== null) {
      hints.add(1000);
    }

    // Ladder: "200-400-800m", "200, 400, 800m", "200/400/800m"
    const ladderMatch = text.match(/(\d+(?:\s*[-,/]\s*\d+)+)\s*m\b/i);
    if (ladderMatch) {
      const nums = ladderMatch[1].split(/\s*[-,/]\s*/).map(Number);
      if (nums.length >= 2) {
        const allValid = nums.every(d => validDistances.includes(d as typeof validDistances[number]));
        const isAscending = nums.every((d, i) => i === 0 || d >= nums[i - 1]);
        const isDescending = nums.every((d, i) => i === 0 || d <= nums[i - 1]);
        const allSame = nums.every(d => d === nums[0]);
        if (allValid && !allSame && (isAscending || isDescending || isLadderKeyword)) {
          nums.forEach(d => hints.add(d));
        }
      }
    }
  }

  // Ladder keyword with comma-separated distances in a separate field
  if (isLadderKeyword) {
    for (const text of texts) {
      const commaMatch = text.match(/(\d+(?:\s*,\s*\d+)+)\s*m?\b/i);
      if (commaMatch) {
        const nums = commaMatch[1].split(/\s*,\s*/).map(Number);
        if (nums.length >= 2) {
          const allValid = nums.every(d => validDistances.includes(d as typeof validDistances[number]));
          const allSame = nums.every(d => d === nums[0]);
          if (allValid && !allSame) {
            nums.forEach(d => hints.add(d));
          }
        }
      }
    }
  }

  return [...hints];
}

/**
 * Extract a distance→count map from description/name.
 * Used to pick exactly the right number of laps for hinted distances.
 * e.g. "2*1k + 2*800m" → Map { 1000 → 2, 800 → 2 }
 */
export function extractDescriptionHintCounts(
  name: string | null,
  description: string | null
): Map<number, number> {
  const texts = [name, description].filter(Boolean) as string[];
  const counts = new Map<number, number>();
  if (texts.length === 0) return counts;

  const validValues = Object.values(INTERVAL_DISTANCES);
  const setMax = (dist: number, count: number) => {
    if (!counts.has(dist) || counts.get(dist)! < count) counts.set(dist, count);
  };

  for (const text of texts) {
    // Time-based: "13 * (1min", "5x2min"
    const timePattern = /(\d+)\s*[x×*]\s*\(?\s*(\d+)\s*min/gi;
    let match;
    while ((match = timePattern.exec(text)) !== null) {
      const dist = -(parseInt(match[2]) * 60);
      if (validValues.includes(dist as typeof validValues[number])) setMax(dist, parseInt(match[1]));
    }

    // Distance-based: "5x400m", "2*800m", "12 *(400m..."
    const distPatterns = [
      { regex: /(\d+)\s*[x×*]\s*\(?\s*(\d+)\s*(?:m|meter)/gi, reversed: false },
      { regex: /(\d+)\s*(?:m|meter)\s*[x×*]\s*(\d+)/gi, reversed: true },
      { regex: /(\d+)\s*repeat\s*(?:of\s+)?(\d+)\s*m/gi, reversed: false },
    ];
    for (const { regex, reversed } of distPatterns) {
      regex.lastIndex = 0;
      while ((match = regex.exec(text)) !== null) {
        const count = parseInt(reversed ? match[2] : match[1]);
        const dist = parseInt(reversed ? match[1] : match[2]);
        if (validValues.includes(dist as typeof validValues[number])) setMax(dist, count);
      }
    }

    // "1k" shorthand: "2*1k", "5 × 1k", "5*(1k..."
    const kPattern = /(\d+)\s*[x×*]\s*\(?\s*1k\b/gi;
    kPattern.lastIndex = 0;
    while ((match = kPattern.exec(text)) !== null) {
      setMax(1000, parseInt(match[1]));
    }
  }

  return counts;
}

/**
 * Infer interval distances from lap data. Laps are the authoritative source.
 * Accepts optional description hints to guide the search (hinted distances
 * are validated first; un-hinted patterns are also scanned).
 * Always returns an array — empty if no interval pattern is found.
 */
export function inferDistanceFromLaps(
  rawLaps: any[],
  hints?: number[],
  hintCounts?: Map<number, number>
): DetectedInterval[] {
  if (!rawLaps || rawLaps.length < 3) return [];

  // Filter out micro-laps (<50m) — GPS noise, drills, standing pauses
  const laps = rawLaps.filter((lap: any) => lap.distance >= 50);
  if (laps.length < 3) return [];

  const validValues = Object.values(INTERVAL_DISTANCES);
  const paces = laps.map((lap: any) => lap.elapsed_time / (lap.distance || 1));
  const results: DetectedInterval[] = [];
  const seen = new Set<number>();

  /**
   * Verify interval pattern: work laps must be individually separated by
   * recovery laps (not forming one continuous block like a tempo run).
   */
  function hasIntervalPattern(matchedIndices: Set<number>, skipSeparation = false): boolean {
    if (matchedIndices.size < 3) return false;

    const workIndices = [...matchedIndices].sort((a, b) => a - b);
    const restIndices = laps
      .map((_: any, i: number) => i)
      .filter((i: number) => !matchedIndices.has(i));

    if (restIndices.length === 0) return false;

    // Reject continuous blocks: every consecutive pair of work laps must
    // have at least one non-work lap between them. Count how many do.
    // Skip this check for hinted distances — the description is the authority.
    if (!skipSeparation) {
      let separatedPairs = 0;
      for (let i = 0; i < workIndices.length - 1; i++) {
        if (workIndices[i + 1] - workIndices[i] > 1) separatedPairs++;
      }
      if (separatedPairs < (workIndices.length - 1) * 0.75) return false;
    }

    // For pace comparison, use only meaningful rest laps (≥100m).
    const meaningfulRestIndices = restIndices.filter((i: number) => laps[i].distance >= 100);
    const restForPace = meaningfulRestIndices.length > 0 ? meaningfulRestIndices : restIndices;

    // Work laps must be meaningfully faster than rest laps
    const avgWorkPace =
      workIndices.reduce((s: number, i: number) => s + paces[i], 0) / workIndices.length;
    const avgRestPace =
      restForPace.reduce((s: number, i: number) => s + paces[i], 0) / restForPace.length;

    return avgWorkPace < avgRestPace * 0.8;
  }

  // --- Time-based matching ---
  const timeBuckets: { [key: number]: Set<number> } = {};
  laps.forEach((lap: any, i: number) => {
    const match = validValues.find(
      (v) => v < 0 && Math.abs(Math.abs(v) - lap.elapsed_time) < Math.abs(v) * 0.15
    );
    // Don't classify as time-based if the lap is clearly a distance-based interval
    // (e.g. a 100m stride with elapsed=67s falls within 15% of 60s but it's a stride).
    // Exception: when the time value is hinted AND the matched standard distance is NOT
    // itself hinted — i.e., the lap covers an untracked distance (e.g. 1min uphill ~200m
    // where 200m is not in hints), so the description's time hint should take precedence.
    const matchingStandardDist = match
      ? validValues.find((d) => d > 0 && Math.abs(d - lap.distance) < d * 0.08)
      : undefined;
    const timeHinted = match && hints?.includes(match);
    const distanceAlsoHinted = matchingStandardDist && hints?.includes(matchingStandardDist);
    if (match && (!matchingStandardDist || (timeHinted && !distanceAlsoHinted))) {
      if (!timeBuckets[match]) timeBuckets[match] = new Set();
      timeBuckets[match].add(i);
    }
  });

  for (const [val, indices] of Object.entries(timeBuckets)) {
    const numVal = Number(val);
    if (seen.has(numVal)) continue;

    // If most laps match this time bucket, split by distance (work vs rest)
    if (indices.size > laps.length * 0.6) {
      const matchedLaps = [...indices].map((i) => ({ i, dist: laps[i].distance }));
      const medianDist = matchedLaps
        .map((l) => l.dist)
        .sort((a: number, b: number) => a - b)[Math.floor(matchedLaps.length / 2)];
      const workIndices = new Set(
        matchedLaps.filter((l) => l.dist > medianDist * 0.6).map((l) => l.i)
      );
      if (workIndices.size >= 2 && workIndices.size < indices.size) {
        results.push({ distance: numVal, count: workIndices.size });
        seen.add(numVal);
        continue;
      }
    }

    // Skip if laps cluster tightly around a standard distance — it's a
    // distance-based interval whose time incidentally falls near this bucket.
    // Exception: if this time value is explicitly hinted, trust the description.
    const matchedDists = [...indices].map((i) => laps[i].distance);
    const medianDist = [...matchedDists].sort((a, b) => a - b)[Math.floor(matchedDists.length / 2)];
    const coversStandardDist = validValues.some(d => d > 0 && Math.abs(d - medianDist) < d * 0.08);
    if (coversStandardDist && !hints?.includes(numVal)) continue;

    if (hasIntervalPattern(indices)) {
      results.push({ distance: numVal, count: indices.size });
      seen.add(numVal);
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

  // For hinted distances with a known count from the description, trust the count
  // directly and take the N fastest matching laps — no pattern check needed.
  if (hintCounts && hintCounts.size > 0) {
    const sortedByDist = Object.entries(distBuckets).sort((a, b) => Number(b[0]) - Number(a[0]));
    for (const [d, indices] of sortedByDist) {
      const numDist = Number(d);
      if (seen.has(numDist)) continue;
      if (!hints?.includes(numDist)) continue;
      const hintCount = hintCounts.get(numDist);
      if (!hintCount || indices.size < hintCount) continue;
      results.push({ distance: numDist, count: hintCount });
      seen.add(numDist);
    }
  }

  // For hinted distances the description explicitly names them as intervals,
  // so skip the strict separation check — rely on the pace check alone.
  const validDistBuckets = Object.entries(distBuckets)
    .filter(([d, indices]) => hasIntervalPattern(indices) ||
      (hints?.includes(Number(d)) && hasIntervalPattern(indices, true)));

  // Check hinted distances first, then remaining valid buckets.
  // Larger distances still win when two buckets compete for the same laps
  // (sort by descending distance within each group).
  const hintedBuckets = hints && hints.length > 0
    ? validDistBuckets
        .filter(([d]) => hints.includes(Number(d)))
        .sort((a, b) => Number(b[0]) - Number(a[0]))
    : [];
  const otherBuckets = validDistBuckets
    .filter(([d]) => !hintedBuckets.some(([hd]) => hd === d))
    .sort((a, b) => Number(b[0]) - Number(a[0]));

  for (const [dist, indices] of [...hintedBuckets, ...otherBuckets]) {
    const numDist = Number(dist);
    if (!seen.has(numDist)) {
      results.push({ distance: numDist, count: indices.size });
      seen.add(numDist);
    }
  }

  // --- 100m stride detection (operates on rawLaps to preserve recovery gaps) ---
  // When hints include 100, bypass the longLapCount guard — the description
  // explicitly names strides so they can coexist with many interval laps.
  {
    const STRIDE_PACE_THRESHOLD = 0.40; // faster than 6:40/km
    const fastStrideLaps: number[] = [];
    for (let i = 0; i < rawLaps.length; i++) {
      const lap = rawLaps[i];
      if (Math.abs(lap.distance - 100) <= 100 * 0.15) {
        if ((lap.moving_time ?? lap.elapsed_time) / (lap.distance || 1) < STRIDE_PACE_THRESHOLD) {
          fastStrideLaps.push(i);
        }
      }
    }

    if (fastStrideLaps.length >= 3 && !seen.has(100)) {
      const longLapCount = rawLaps.filter((l: any) => l.distance > 300).length;
      const strideHinted = hints?.includes(100) ?? false;

      if (fastStrideLaps.length >= longLapCount || strideHinted) {
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
          results.push({ distance: 100, count: fastStrideLaps.length });
          seen.add(100);
        }
      }
    }
  }

  // --- Ladder detection ---
  // Identify fast (work) laps by pace forming an ascending or descending
  // sequence of distinct valid distances.
  const avgPace = paces.reduce((s, p) => s + p, 0) / paces.length;
  const fastLaps: { index: number; distance: number }[] = [];
  laps.forEach((lap: any, i: number) => {
    if (paces[i] > avgPace) return;
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
        for (const m of fastLaps) {
          if (!seen.has(m.distance)) {
            results.push({ distance: m.distance, count: 1 });
            seen.add(m.distance);
          }
        }
      }
    }
  }

  return results;
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
 * Parse interval session from activity.
 * Laps are always the authoritative source. Description provides hints for
 * which distances to look for, but every detected distance is lap-validated.
 * Always returns an array — empty if no intervals are found.
 */
export function parseIntervalSession(
  activity: DetailedActivity
): ParsedInterval[] {
  const { id, name, description, start_date, start_date_local } = activity;

  if (!activity.laps || activity.laps.length < 2) return [];

  // Extract candidate distances from description as hints
  const hints = extractDescriptionHints(name, description);
  const hintCounts = extractDescriptionHintCounts(name, description);

  // Lap inference is the truth — always run, hints guide the search
  let detected = inferDistanceFromLaps(activity.laps, hints, hintCounts);

  // For tempo runs, only keep:
  //   • 100m strides (always valid)
  //   • Distances explicitly mentioned in the description (e.g. "Tempo + 5x400m")
  // This prevents tempo-paced km laps from being reported as intervals
  // while still honouring intentional interval sets within a tempo run.
  if (/tempo/i.test(name ?? "")) {
    detected = detected.filter(d => d.distance === 100 || hints.includes(d.distance));
  }

  if (detected.length === 0) return [];

  const sessionDate = (start_date_local || start_date).split("T")[0];
  const output: ParsedInterval[] = [];

  for (const d of detected) {
    let totalIntervalTime = 0;
    let intervalCount = 0;
    let totalIntervalDistance = 0;
    let workLaps: typeof activity.laps = [];

    if (isTimeBasedInterval(d.distance)) {
      // Time-based: match laps by elapsed_time.
      // Sort by distance descending (most distance = harder effort = work lap)
      // and take only the top d.count laps to exclude recovery laps.
      const targetSeconds = getIntervalDurationSeconds(d.distance);
      const matchingLaps = activity.laps!
        .filter(lap => Math.abs(lap.elapsed_time - targetSeconds) < targetSeconds * 0.15)
        .sort((a, b) => b.distance - a.distance)
        .slice(0, d.count);
      workLaps = matchingLaps;
      for (const lap of matchingLaps) {
        totalIntervalTime += lap.elapsed_time;
        totalIntervalDistance += lap.distance;
        intervalCount++;
      }
    } else {
      // Distance-based: match laps by distance.
      // Sort by pace ascending (fastest = work lap) and take only d.count laps.
      // This excludes same-distance recovery laps (e.g. 200m jogs in a ladder).
      const matchingLaps = activity.laps!
        .filter(lap => Math.abs(lap.distance - d.distance) < d.distance * 0.15)
        .sort((a, b) => (a.moving_time / (a.distance || 1)) - (b.moving_time / (b.distance || 1)))
        .slice(0, d.count);
      workLaps = matchingLaps;
      for (const lap of matchingLaps) {
        totalIntervalTime += lap.moving_time;
        intervalCount++;
      }
    }

    if (intervalCount === 0) continue;

    const avgTime = Math.round(totalIntervalTime / intervalCount);
    const avgPace = isTimeBasedInterval(d.distance)
      ? calculatePace(totalIntervalDistance / intervalCount, avgTime)
      : calculatePace(d.distance, avgTime);

    // Best/worst individual rep from the matched work laps
    let bestLap, worstLap;
    if (workLaps && workLaps.length > 0) {
      if (isTimeBasedInterval(d.distance)) {
        // Time-based: best = most distance covered in the fixed duration
        const byDist = [...workLaps].sort((a, b) => b.distance - a.distance);
        const mkStat = (lap: typeof workLaps[0]) => ({
          time: lap.elapsed_time,
          pace: calculatePace(lap.distance, lap.elapsed_time),
          distance: Math.round(lap.distance),
        });
        bestLap = mkStat(byDist[0]);
        worstLap = mkStat(byDist[byDist.length - 1]);
      } else {
        // Distance-based: best = fastest (lowest moving_time)
        const byTime = [...workLaps].sort((a, b) => a.moving_time - b.moving_time);
        const mkStat = (lap: typeof workLaps[0]) => ({
          time: lap.moving_time,
          pace: calculatePace(d.distance, lap.moving_time),
          distance: Math.round(lap.distance),
        });
        bestLap = mkStat(byTime[0]);
        worstLap = mkStat(byTime[byTime.length - 1]);
      }
    }

    output.push({
      sessionId: id,
      sessionDate,
      activityName: name,
      distance: d.distance,
      count: intervalCount,
      avgTime,
      avgPace,
      ...(isTimeBasedInterval(d.distance) && {
        avgCoveredDistance: Math.round(totalIntervalDistance / intervalCount),
      }),
      bestLap,
      worstLap,
      detected_by: "lap",
    });
  }

  return output;
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

  if (response.status === 429) {
    throw new Error("RATE_LIMITED");
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch activity ${activityId}`);
  }

  return response.json();
}

/**
 * Quick pre-filter on summary activity data to decide if fetching
 * full lap details is worth the API call.
 *
 * Returns true when the activity is plausibly an interval session.
 * Strava marks explicit workouts with workout_type === 3; anything
 * else is caught by name keywords or an explicit NxDm pattern.
 */
export function looksLikeIntervalActivity(activity: {
  name?: string;
  workout_type?: number;
}): boolean {
  if (activity.workout_type === 3) return true;
  const name = activity.name ?? "";
  const keywords = /interval|repeat|rep|fartlek|speed\s*work|track|stride|tempo/i;
  const pattern  = /\d+\s*[x×*]\s*\d+\s*(?:m|meter|min|k\b)/i;
  return keywords.test(name) || pattern.test(name);
}
