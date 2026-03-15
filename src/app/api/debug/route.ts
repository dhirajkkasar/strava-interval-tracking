import { getServerSession } from "next-auth";
import { authOptions } from "../../../lib/auth";
import { fetchStravaActivities, fetchDetailedActivity, parseIntervalSession } from "../../../lib/strava";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get("startDate") || "";
  const endDate = searchParams.get("endDate") || "";

  const before = Math.floor(new Date(endDate).getTime() / 1000);
  const after = Math.floor(new Date(startDate).getTime() / 1000);

  const activities = await fetchStravaActivities(session.accessToken, before, after);

  const summary = activities.map((a: any) => ({
    id: a.id,
    name: a.name,
    date_utc: a.start_date,
    date_local: a.start_date_local,
    type: a.type,
    sport_type: a.sport_type,
    workout_type: a.workout_type,
  }));

  // Pre-filter same as dashboard route
  const intervalKeywords = /interval|repeat|rep|fartlek|speed\s*work|track|hill/i;
  const intervalPattern = /\d+\s*[x×]\s*\d+\s*(?:m|meter|min|k\b)/i;

  const candidates = activities.filter((a: any) => {
    if (a.workout_type === 3) return true;
    const text = `${a.name || ""} ${a.description || ""}`;
    return intervalKeywords.test(text) || intervalPattern.test(text);
  });

  const analysis: any[] = [];
  for (const activity of candidates) {
    try {
      const det = await fetchDetailedActivity(session.accessToken!, activity.id);
      const result = parseIntervalSession(det);
      analysis.push({
        id: activity.id,
        name: activity.name,
        date: activity.start_date?.split("T")[0],
        workout_type: activity.workout_type,
        lap_count: det.laps?.length || 0,
        laps: det.laps?.map((l: any) => ({
          distance: Math.round(l.distance),
          elapsed_time: l.elapsed_time,
        })),
        detected: result ? {
          distance: result.distance,
          avgTime: result.avgTime,
          avgPace: result.avgPace,
          avgCoveredDistance: result.avgCoveredDistance,
          detected_by: result.detected_by,
        } : null,
      });
    } catch (e: any) {
      analysis.push({ id: activity.id, name: activity.name, error: e.message });
    }
  }

  return NextResponse.json({
    total_activities: activities.length,
    all_activities: summary,
    candidates_checked: candidates.length,
    detected_count: analysis.filter((a) => a.detected).length,
    analysis,
  });
}
