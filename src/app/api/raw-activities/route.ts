import { getServerSession } from "next-auth";
import { authOptions } from "../../../lib/auth";
import { fetchStravaActivities, fetchDetailedActivity } from "../../../lib/strava";
import { NextRequest, NextResponse } from "next/server";

const CONCURRENCY = 3;
const BATCH_DELAY_MS = 300;
const MAX_DAYS = 180;
const DEFAULT_DAYS = 180;

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const accessToken = session.accessToken;

    const { searchParams } = new URL(request.url);
    const daysParam = searchParams.get("days");
    const days = Math.min(
      daysParam ? Math.max(1, parseInt(daysParam, 10)) : DEFAULT_DAYS,
      MAX_DAYS
    );

    const now = Math.floor(Date.now() / 1000);
    const after = now - days * 86400;

    const activities = await fetchStravaActivities(accessToken, now, after);
    const runs = activities.filter(
      (a: any) => a.type === "Run" || a.sport_type === "Run"
    );

    const results: any[] = [];

    for (let i = 0; i < runs.length; i += CONCURRENCY) {
      if (i > 0) await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));

      const batch = runs.slice(i, i + CONCURRENCY);
      const settled = await Promise.allSettled(
        batch.map(async (activity: any) => {
          const detailed = await fetchDetailedActivity(accessToken, activity.id);
          return {
            id: detailed.id,
            name: detailed.name,
            description: detailed.description ?? null,
            workout_type: (detailed as any).workout_type ?? null,
            distance: detailed.distance,
            start_date_local: detailed.start_date_local ?? detailed.start_date,
            laps: (detailed.laps ?? []).map((lap: any) => ({
              lap_index: lap.lap_index,
              distance: lap.distance,
              elapsed_time: lap.elapsed_time,
              moving_time: lap.moving_time,
            })),
          };
        })
      );

      for (const result of settled) {
        if (result.status === "fulfilled") {
          results.push(result.value);
        }
      }
    }

    return NextResponse.json({
      activities: results,
      count: results.length,
      days,
    });
  } catch (error) {
    console.error("Raw activities API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch raw activities" },
      { status: 500 }
    );
  }
}
