/**
 * Debug script: fetches recent Strava runs and logs detection results.
 * Usage: npx tsx scripts/debug-detection.ts
 * Or:    STRAVA_REFRESH_TOKEN=xxx npx tsx scripts/debug-detection.ts
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { parseDescriptionForIntervals, parseIntervalSession } from "../src/lib/strava";
import type { DetailedActivity } from "../src/types";

// Load .env files
function loadEnv(file: string) {
  try {
    const content = readFileSync(resolve(__dirname, "..", file), "utf-8");
    for (const line of content.split("\n")) {
      const m = line.match(/^([A-Z_]+)=(.+)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch {}
}
loadEnv(".env.local");
loadEnv(".env");

const CLIENT_ID = process.env.STRAVA_CLIENT_ID;
const CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.STRAVA_REFRESH_TOKEN;

async function getAccessToken(): Promise<string> {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error("Missing STRAVA_CLIENT_ID or STRAVA_CLIENT_SECRET in .env.local");
    process.exit(1);
  }
  if (!REFRESH_TOKEN) {
    console.error(`\nNo STRAVA_REFRESH_TOKEN found.\n`);
    console.error(`To get one:\n1. Open: https://www.strava.com/oauth/authorize?client_id=${CLIENT_ID}&response_type=code&redirect_uri=http://localhost:3000/api/auth/callback/strava&scope=activity:read_all`);
    console.error(`2. Authorize, then copy the "code" param from the redirect URL`);
    console.error(`3. Run:\n   curl -X POST https://www.strava.com/api/v3/oauth/token -d client_id=${CLIENT_ID} -d client_secret=YOUR_SECRET -d code=THE_CODE -d grant_type=authorization_code`);
    console.error(`4. Then: STRAVA_REFRESH_TOKEN=<token> npx tsx scripts/debug-detection.ts`);
    process.exit(1);
  }

  const res = await fetch("https://www.strava.com/api/v3/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    console.error("Token refresh failed:", await res.text());
    process.exit(1);
  }
  return (await res.json()).access_token;
}

async function api(token: string, path: string) {
  const res = await fetch(`https://www.strava.com/api/v3${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${path}`);
  return res.json();
}

async function main() {
  const token = await getAccessToken();
  console.log("🔑 Got access token\n");

  const MONTHS = 3;
  const after = Math.floor(Date.now() / 1000) - MONTHS * 30 * 86400;
  const all: any[] = [];
  let page = 1;
  while (true) {
    const batch: any[] = await api(token, `/athlete/activities?after=${after}&per_page=200&page=${page}`);
    all.push(...batch);
    if (batch.length < 200) break;
    page++;
  }

  const runs = all.filter((a: any) => a.type === "Run" || a.sport_type === "Run");
  console.log(`Fetched ${all.length} activities, ${runs.length} runs (last ${MONTHS} months)\n`);

  // Dashboard pre-filter (replicated)
  const intervalKeywords = /interval|repeat|rep|fartlek|speed\s*work|track/i;
  const intervalPattern = /\d+\s*[x×]\s*\d+\s*(?:m|meter|min|k\b)/i;

  let detected = 0;
  let skippedByPreFilter = 0;

  for (const act of runs) {
    const text = `${act.name || ""} ${act.description || ""}`;
    const passesPreFilter =
      act.workout_type === 3 ||
      intervalKeywords.test(text) ||
      intervalPattern.test(text);

    let detailed: DetailedActivity;
    try {
      detailed = await api(token, `/activities/${act.id}`) as DetailedActivity;
    } catch {
      continue;
    }

    const descResult = parseDescriptionForIntervals(detailed.name, detailed.description);
    const sessionResult = parseIntervalSession(detailed);
    const isDetected = sessionResult !== null;
    if (isDetected) detected++;
    if (isDetected && !passesPreFilter) skippedByPreFilter++;

    const flag = isDetected ? "✅ INTERVAL" : "   skip";
    const preFlag = passesPreFilter ? "" : " ⚠️  MISSED-BY-PREFILTER";
    const wtype = act.workout_type != null ? ` wtype=${act.workout_type}` : "";

    console.log(`${flag} | ${act.start_date_local?.slice(0, 10)} | ${act.name}${wtype}${preFlag}`);

    if (isDetected || descResult) {
      if (descResult) console.log(`         desc → ${JSON.stringify(descResult)}`);
      if (sessionResult) {
        const arr = Array.isArray(sessionResult) ? sessionResult : [sessionResult];
        for (const s of arr)
          console.log(`         result: ${s.distance}m  avgTime=${s.avgTime}s  pace=${s.avgPace}  by=${s.detected_by}`);
      }
    }

    // Show lap data for non-detected runs with 5+ laps (potential missed intervals)
    if (!isDetected && detailed.laps && detailed.laps.length >= 5) {
      const lapSummary = detailed.laps.map(
        (l: any) => `${Math.round(l.distance)}m/${l.elapsed_time}s`
      );
      console.log(`         laps(${detailed.laps.length}): ${lapSummary.join(" | ")}`);
    }
  }

  console.log(`\n════════════════════════════════════════`);
  console.log(`Total runs: ${runs.length}`);
  console.log(`Detected as intervals: ${detected}`);
  console.log(`Detected but SKIPPED by dashboard pre-filter: ${skippedByPreFilter}`);
  console.log(`════════════════════════════════════════\n`);
}

main().catch(console.error);
