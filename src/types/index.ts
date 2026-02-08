// Strava Activity types
export interface StravaActivity {
  id: number;
  name: string;
  description: string | null;
  distance: number; // meters
  moving_time: number; // seconds
  elapsed_time: number; // seconds
  start_date: string; // ISO 8601
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
  distance: number; // meters
  avgTime: number; // seconds
  avgPace: string; // min/km
  detected_by: "description" | "lap" | "segment" | "unknown";
}

// Dashboard data
export interface IntervalDay {
  date: string;
  distance: number; // meters - 200, 400, 800, 1000, 1200, 1600
  avgTime: number; // seconds
  avgPace: string; // min/km
  sessions: ParsedInterval[];
}

export interface DashboardData {
  distance: number; // meters - filter key
  intervals: ParsedInterval[];
  dailyAverages: IntervalDay[];
}

// Allowed interval distances in meters
export const INTERVAL_DISTANCES = {
  "200m": 200,
  "400m": 400,
  "800m": 800,
  "1k": 1000,
  "1200m": 1200,
  "1600m": 1600,
} as const;
