import { getServerSession } from "next-auth";
import { authOptions } from "../../../lib/auth";
import { fetchStravaActivities, fetchDetailedActivity, parseIntervalSession, calculatePace } from "../../../lib/strava";
import { ParsedInterval, IntervalDay, INTERVAL_DISTANCES, isTimeBasedInterval } from "../../../types";
import { NextRequest, NextResponse } from "next/server";

function averagePaceStrings(paces: string[]): string {
  const totalSeconds = paces.reduce((sum, p) => {
    const [m, s] = p.split(":").map(Number);
    return sum + m * 60 + s;
  }, 0);
  const avg = totalSeconds / paces.length;
  const mins = Math.floor(avg / 60);
  const secs = Math.round(avg % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const accessToken = session.accessToken;

    const body = await request.json();
    const { startDate, endDate, distance } = body;

    // Validate inputs
    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: "startDate and endDate are required" },
        { status: 400 }
      );
    }

    if (distance && !Object.values(INTERVAL_DISTANCES).includes(distance)) {
      return NextResponse.json(
        { error: "Invalid distance" },
        { status: 400 }
      );
    }

    // Convert dates to Unix timestamps
    const before = Math.floor(new Date(endDate).getTime() / 1000);
    const after = Math.floor(new Date(startDate).getTime() / 1000);

    const activities = await fetchStravaActivities(
      accessToken,
      before,
      after
    );
    console.log("✅ [Dashboard API] Fetched", activities.length, "activities");

    // Pre-filter: only fetch details for activities likely to be intervals
    // - workout_type 3 = "Workout" in Strava (includes intervals)
    // - name/description contains interval patterns (5x400m, 5x1min, etc.)
    // - name/description contains common interval keywords
    const intervalKeywords = /interval|repeat|rep|fartlek|speed\s*work|track/i;
    const intervalPattern = /\d+\s*[x×]\s*\d+\s*(?:m|meter|min|k\b)/i;

    const candidates = activities.filter((activity: any) => {
      if (activity.workout_type === 3) return true;
      const text = `${activity.name || ""} ${activity.description || ""}`;
      return intervalKeywords.test(text) || intervalPattern.test(text);
    });
    console.log("🎯 [Dashboard API] Filtered to", candidates.length, "candidates from", activities.length, "activities");

    // Parse intervals from activities - fetch details in parallel (5 at a time)
    const CONCURRENCY = 5;
    const parsedIntervals: ParsedInterval[] = [];

    for (let i = 0; i < candidates.length; i += CONCURRENCY) {
      const batch = candidates.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map(async (activity: any) => {
          const detailed = await fetchDetailedActivity(accessToken, activity.id);
          return parseIntervalSession(detailed);
        })
      );

      for (const result of results) {
        if (result.status === "fulfilled" && result.value) {
          if (!distance || result.value.distance === distance) {
            parsedIntervals.push(result.value);
          }
        }
      }
    }
    console.log("📈 [Dashboard API] Total parsed intervals:", parsedIntervals.length);

    // Group by date and calculate daily averages
    const dailyMap: { [key: string]: ParsedInterval[] } = {};

    for (const interval of parsedIntervals) {
      if (!dailyMap[interval.sessionDate]) {
        dailyMap[interval.sessionDate] = [];
      }
      dailyMap[interval.sessionDate].push(interval);
    }

    const dailyAverages: IntervalDay[] = Object.entries(dailyMap).map(([date, intervals]) => {
      const avgTime = Math.round(intervals.reduce((sum, i) => sum + i.avgTime, 0) / intervals.length);
      const distanceVal = intervals[0].distance;
      // For time-based intervals, average the per-session paces since distance varies
      const avgPace = isTimeBasedInterval(distanceVal)
        ? averagePaceStrings(intervals.map((i) => i.avgPace))
        : calculatePace(distanceVal, avgTime);

      return {
        date,
        distance: distanceVal,
        avgTime,
        avgPace,
        ...(isTimeBasedInterval(distanceVal) && {
          avgDistance: Math.round(
            intervals.reduce((s, i) => s + (i.avgCoveredDistance || 0), 0) / intervals.length
          ),
        }),
        sessions: intervals,
      };
    });

    // Sort by date
    dailyAverages.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return NextResponse.json({
      distance: distance || null,
      intervals: parsedIntervals.sort(
        (a, b) => new Date(b.sessionDate).getTime() - new Date(a.sessionDate).getTime()
      ),
      dailyAverages,
    });
  } catch (error) {
    console.error("Dashboard API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard data" },
      { status: 500 }
    );
  }
}
