import { getServerSession } from "next-auth";
import { authOptions } from "../../../lib/auth";
import { fetchStravaActivities, fetchDetailedActivity, parseDescriptionForIntervals, parseIntervalSession } from "../../../lib/strava";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized — log in first" }, { status: 401 });
  }

  const token = session.accessToken;
  const after = Math.floor(Date.now() / 1000) - 3 * 30 * 86400;
  const activities = await fetchStravaActivities(token, undefined, after);
  const runs = activities.filter((a: any) => a.type === "Run" || a.sport_type === "Run");

  // Dashboard pre-filter (same as route.ts)
  const intervalKeywords = /interval|repeat|rep|fartlek|speed\s*work|track/i;
  const intervalPattern = /\d+\s*[x×]\s*\d+\s*(?:m|meter|min|k\b)/i;

  const results: any[] = [];

  for (const act of runs) {
    const text = `${act.name || ""} ${act.description || ""}`;
    const passesPreFilter =
      act.workout_type === 3 ||
      intervalKeywords.test(text) ||
      intervalPattern.test(text);

    let detailed: any;
    try {
      detailed = await fetchDetailedActivity(token, act.id);
    } catch {
      continue;
    }

    const descResult = parseDescriptionForIntervals(detailed.name, detailed.description);
    const sessionResult = parseIntervalSession(detailed);
    const isDetected = sessionResult !== null;

    const entry: any = {
      id: act.id,
      date: act.start_date_local?.slice(0, 10),
      name: act.name,
      description: act.description || null,
      workout_type: act.workout_type,
      total_distance: Math.round(act.distance),
      passesPreFilter,
      descriptionDetection: descResult,
      detected: isDetected,
      detection: sessionResult,
      lapCount: detailed.laps?.length || 0,
    };

    // Include lap data for non-detected runs with 5+ laps (potential misses)
    // and for all detected runs (to verify correctness)
    if (detailed.laps && (isDetected || detailed.laps.length >= 5)) {
      entry.laps = detailed.laps.map((l: any) => ({
        distance: Math.round(l.distance),
        elapsed_time: l.elapsed_time,
        pace: l.distance > 0 ? +(l.elapsed_time / (l.distance / 1000)).toFixed(1) : 0,
      }));
    }

    results.push(entry);
  }

  const detected = results.filter(r => r.detected);
  const missedByPreFilter = results.filter(r => r.detected && !r.passesPreFilter);
  const potentialMisses = results.filter(r => !r.detected && r.lapCount >= 5);

  return NextResponse.json({
    summary: {
      totalRuns: runs.length,
      detectedIntervals: detected.length,
      missedByPreFilter: missedByPreFilter.length,
      potentialMissedIntervals: potentialMisses.length,
    },
    detected,
    potentialMisses,
    allRuns: results,
  });
}
