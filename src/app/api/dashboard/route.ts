import { getServerSession } from "next-auth";
import { authOptions } from "../../../lib/auth";
import { fetchStravaActivities, fetchDetailedActivity, parseIntervalSession } from "../../../lib/strava";
import { ParsedInterval, IntervalDay, INTERVAL_DISTANCES } from "../../../types";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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

    // Fetch activities
    const activities = await fetchStravaActivities(
      session.accessToken,
      before,
      after
    );

    // Filter for interval activities
    const intervalActivities = activities.filter((activity: any) => {
      const name = activity.name?.toLowerCase() || "";
      const description = activity.description?.toLowerCase() || "";
      return name.includes("interval") || description.includes("interval");
    });

    // Parse intervals from activities
    const parsedIntervals: ParsedInterval[] = [];

    for (const activity of intervalActivities) {
      try {
        // Fetch detailed activity with laps
        const detailed = await fetchDetailedActivity(session.accessToken, activity.id);
        const parsed = parseIntervalSession(detailed);

        if (parsed && (!distance || parsed.distance === distance)) {
          parsedIntervals.push(parsed);
        }
      } catch (error) {
        console.error(`Failed to parse activity ${activity.id}:`, error);
        continue;
      }
    }

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

function calculatePace(distance: number, timeSeconds: number): string {
  if (distance === 0) return "N/A";
  const kmDistance = distance / 1000;
  const totalMinutes = timeSeconds / 60;
  const paceMinutes = totalMinutes / kmDistance;

  const minutes = Math.floor(paceMinutes);
  const seconds = Math.round((paceMinutes - minutes) * 60);

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
