import { getServerSession } from "next-auth";
import { authOptions } from "../../../lib/auth";
import { fetchStravaActivities, fetchDetailedActivity, parseIntervalSession, calculatePace } from "../../../lib/strava";
import { ParsedInterval, IntervalDay, INTERVAL_DISTANCES } from "../../../types";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    console.log("🔵 [Dashboard API] Request started");
    
    const session = await getServerSession(authOptions);
    console.log("📋 [Dashboard API] Session:", {
      hasSession: !!session,
      hasAccessToken: !!session?.accessToken,
    });

    if (!session?.accessToken) {
      console.error("❌ [Dashboard API] Unauthorized - no access token");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { startDate, endDate, distance } = body;
    console.log("📥 [Dashboard API] Request body:", { startDate, endDate, distance });

    // Validate inputs
    if (!startDate || !endDate) {
      console.error("❌ [Dashboard API] Missing dates");
      return NextResponse.json(
        { error: "startDate and endDate are required" },
        { status: 400 }
      );
    }

    if (distance && !Object.values(INTERVAL_DISTANCES).includes(distance)) {
      console.error("❌ [Dashboard API] Invalid distance:", distance);
      return NextResponse.json(
        { error: "Invalid distance" },
        { status: 400 }
      );
    }

    // Convert dates to Unix timestamps
    const before = Math.floor(new Date(endDate).getTime() / 1000);
    const after = Math.floor(new Date(startDate).getTime() / 1000);
    console.log("⏰ [Dashboard API] Date range:", { before, after });

    // Fetch activities
    console.log("🔄 [Dashboard API] Fetching activities from Strava...");
    const activities = await fetchStravaActivities(
      session.accessToken,
      before,
      after
    );
    console.log("✅ [Dashboard API] Fetched", activities.length, "activities");

    // Filter for interval activities
    const intervalActivities = activities.filter((activity: any) => {
      const name = activity.name?.toLowerCase() || "";
      const description = activity.description?.toLowerCase() || "";
      return name.includes("interval") || description.includes("interval");
    });
    console.log("🎯 [Dashboard API] Found", intervalActivities.length, "interval activities");

    // Parse intervals from activities - fetch details in parallel (5 at a time)
    const CONCURRENCY = 5;
    const parsedIntervals: ParsedInterval[] = [];

    for (let i = 0; i < intervalActivities.length; i += CONCURRENCY) {
      const batch = intervalActivities.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map(async (activity: any) => {
          const detailed = await fetchDetailedActivity(session.accessToken, activity.id);
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
      const avgPace = calculatePace(distanceVal, avgTime);

      return {
        date,
        distance: distanceVal,
        avgTime,
        avgPace,
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
