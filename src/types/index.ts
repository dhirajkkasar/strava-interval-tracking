// Strava Activity types
export interface StravaActivity {
  id: number;
  name: string;
  description: string | null;
  distance: number; // meters
  moving_time: number; // seconds
  elapsed_time: number; // seconds
  start_date: string; // ISO 8601 UTC
  start_date_local?: string; // ISO 8601 local timezone
  type: string;
  sport_type: string;
}

export interface DetailedActivity extends StravaActivity {
  laps?: StravaLap[];
  segment_efforts?: SegmentEffort[];
  splits_metric?: Split[];
}

export interface StravaLap {
  id: number;
  name: string;
  elapsed_time: number; // seconds
  distance: number; // meters
  moving_time: number; // seconds
  start_index: number;
  end_index: number;
  lap_index: number;
}

export interface SegmentEffort {
  id: number;
  name: string;
  elapsed_time: number; // seconds
  distance: number; // meters
  moving_time: number; // seconds
}

export interface Split {
  distance: number; // meters
  elapsed_time: number; // seconds
  moving_time: number; // seconds
  split: number;
}

// Parsed interval session
export interface ParsedInterval {
  sessionId: number;
  sessionDate: string;
  activityName: string;
  distance: number; // meters (or negative for time-based interval key)
  avgTime: number; // seconds
  avgPace: string; // min/km
  avgCoveredDistance?: number; // meters - actual distance covered (for time-based intervals)
  detected_by: "description" | "lap" | "segment" | "unknown";
}

// Dashboard data
export interface IntervalDay {
  date: string;
  distance: number; // meters - 200, 400, 800, 1000, 1200, 1600 or negative for time-based
  avgTime: number; // seconds
  avgPace: string; // min/km
  avgDistance?: number; // meters - average distance covered (for time-based intervals)
  sessions: ParsedInterval[];
}

export interface DashboardData {
  distance: number; // meters - filter key
  intervals: ParsedInterval[];
  dailyAverages: IntervalDay[];
}

// Allowed interval distances in meters
export const INTERVAL_DISTANCES = {
  "100m": 100,
  "200m": 200,
  "400m": 400,
  "500m": 500,
  "800m": 800,
  "1k": 1000,
  "1200m": 1200,
  "1600m": 1600,
  "1 min": -60,
  "90 sec": -90,
} as const;

// Helper to check if an interval value is time-based (negative = seconds)
export function isTimeBasedInterval(value: number): boolean {
  return value < 0;
}

// Get the duration in seconds for a time-based interval
export function getIntervalDurationSeconds(value: number): number {
  return Math.abs(value);
}
