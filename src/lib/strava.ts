import { DetailedActivity, ParsedInterval, INTERVAL_DISTANCES } from "../types";
import { MOCK_ACTIVITIES } from "./mock-data";


const DEMO_MODE = process.env.DEMO_MODE === "true";

/**
 * Parse activity description for interval patterns like "5x400m", "3x800m", etc.
 */
function parseDescriptionForIntervals(
  description: string | null
): { distance: number; count: number } | null {
  if (!description) return null;

  // Look for patterns like "5x400m", "3x800m", etc.
  const patterns = [
    /(\d+)\s*x\s*(\d+)\s*(?:m|meter)/gi, // 5x400m, 3x800m, 5x400 meter
    /(\d+)\s*repeat\s*(?:of\s+)?(\d+)m/gi, // 5 repeat of 400m
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(description);
    if (match) {
      const count = parseInt(match[1]);
      const distance = parseInt(match[2]);

      // Validate distance is within our range
      const validDistances = Object.values(INTERVAL_DISTANCES);
      if (validDistances.includes(distance as typeof validDistances[number])) {
        return { distance, count };
      }
    }
  }

  return null;
}

/**
 * Infer interval distance from lap data
 * Assumes intervals have similar lap distances and shorter than recovery laps
 */
function inferDistanceFromLaps(
  laps: any[]
): { distance: number; count: number } | null {
  if (!laps || laps.length < 2) return null;

  const lapDistances = laps.map((lap) => lap.distance);
  const validDistances = Object.values(INTERVAL_DISTANCES);

  // Bucket each lap into the nearest valid distance (within 15% tolerance)
  const bucketFreq: { [key: number]: number } = {};
  for (const dist of lapDistances) {
    const match = validDistances.find((d) => Math.abs(d - dist) < d * 0.15);
    if (match) {
      bucketFreq[match] = (bucketFreq[match] || 0) + 1;
    }
  }

  // Find the most frequent bucket with at least 2 laps
  const best = Object.entries(bucketFreq)
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])[0];

  if (!best) return null;

  return { distance: Number(best[0]), count: best[1] };
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
  const { id, name, description, start_date } = activity;

  // Check if activity contains "interval" keyword
  const isIntervalActivity =
    (name?.toLowerCase().includes("interval") ||
      description?.toLowerCase().includes("interval")) &&
    activity.laps &&
    activity.laps.length > 1;

  if (!isIntervalActivity) return null;

  let detected: { distance: number; count: number } | null = null;
  let detected_by: "description" | "lap" | "segment" | "unknown" = "unknown";

  // Try to parse from description first
  detected = parseDescriptionForIntervals(description);
  if (detected) {
    detected_by = "description";
  }

  // Fall back to lap data analysis
  if (!detected && activity.laps) {
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

  if (activity.laps) {
    for (const lap of activity.laps) {
      if (Math.abs(lap.distance - detected.distance) < detected.distance * 0.15) {
        totalIntervalTime += lap.elapsed_time;
        intervalCount++;
      }
    }
  }

  if (intervalCount === 0) return null;

  const avgTime = Math.round(totalIntervalTime / intervalCount);
  const avgPace = calculatePace(detected.distance, avgTime);

  return {
    sessionId: id,
    sessionDate: start_date.split("T")[0], // Extract date part
    activityName: name,
    distance: detected.distance,
    avgTime,
    avgPace,
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
