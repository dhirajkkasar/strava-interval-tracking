"use client";

import { useState, useEffect } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { ParsedInterval, IntervalDay, INTERVAL_DISTANCES, isTimeBasedInterval } from "../types";

interface DashboardData {
  distance: number | null;
  intervals: ParsedInterval[];
  dailyAverages: IntervalDay[];
}

export default function DashboardClient() {
  const [selectedDistance, setSelectedDistance] = useState<number>(400);
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [data, setData] = useState<DashboardData | null>(null);
  const [isSynced, setIsSynced] = useState(false);

  // Initialize dates on mount
  useEffect(() => {
    const today = new Date();
    const threeMonthsAgo = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);

    setEndDate(today.toISOString().split("T")[0]);
    setStartDate(threeMonthsAgo.toISOString().split("T")[0]);
  }, []);

  // Load cached data from localStorage
  useEffect(() => {
    const cached = localStorage.getItem("stravaData");
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        setData(parsed);
      } catch (e) {
        console.error("Failed to parse cached data:", e);
      }
    }
  }, []);

  const dateError = (() => {
    if (!startDate || !endDate) return "Please select both start and end dates";
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return "Invalid date selected";
    const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays < 0) return "Start date must be before end date";
    if (diffDays > 180) return "Date range cannot exceed 6 months";
    return null;
  })();

  const fetchData = async () => {
    if (dateError) return;

    setLoading(true);
    setError("");

    try {
      console.log("📤 [DashboardClient] Fetching data:", {
        startDate,
        endDate,
        selectedDistance,
      });

      const response = await fetch("/api/dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate,
          endDate,
        }),
      });

      console.log("📥 [DashboardClient] Response status:", response.status);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("❌ [DashboardClient] API error response:", {
          status: response.status,
          statusText: response.statusText,
          error: errorData.error,
        });
        throw new Error(
          errorData.error || `Failed to fetch data (HTTP ${response.status})`
        );
      }

      const result = await response.json();
      console.log("✅ [DashboardClient] Data received:", {
        intervals: result.intervals?.length || 0,
        dailyAverages: result.dailyAverages?.length || 0,
      });
      setData(result);
      setIsSynced(true);

      // Cache data
      localStorage.setItem("stravaData", JSON.stringify(result));
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Unknown error occurred";
      console.error("❌ [DashboardClient] Fetch error:", errorMessage);
      setError(errorMessage);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  // Get display label for selected interval
  const selectedLabel = Object.entries(INTERVAL_DISTANCES).find(
    ([, v]) => v === selectedDistance
  )?.[0] ?? `${selectedDistance}m`;

  // Filter data based on selected distance
  const filteredData = data
    ? {
        ...data,
        dailyAverages: data.dailyAverages.filter(
          (day) => day.distance === selectedDistance
        ),
        intervals: data.intervals.filter((i) => i.distance === selectedDistance),
      }
    : null;

  const chartData = filteredData?.dailyAverages.map((day) => {
    const sessions = day.sessions ?? [];
    const allBestPaces = sessions.map(s => s.bestLap?.pace).filter(Boolean).map(p => timeStringToSeconds(p!));
    const allWorstPaces = sessions.map(s => s.worstLap?.pace).filter(Boolean).map(p => timeStringToSeconds(p!));
    return {
      date: day.date,
      avgPace: timeStringToSeconds(day.avgPace),
      bestPace: allBestPaces.length ? Math.min(...allBestPaces) : undefined,
      worstPace: allWorstPaces.length ? Math.max(...allWorstPaces) : undefined,
    };
  }) || [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">
            Interval Training Tracker
          </h1>
          <p className="text-gray-600">Track your interval training progress</p>
        </div>

        {/* Controls */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            {/* Distance Selector */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Distance or Time
              </label>
              <select
                value={selectedDistance}
                onChange={(e) => setSelectedDistance(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
              >
                {Object.entries(INTERVAL_DISTANCES).map(([label, value]) => (
                  <option key={value} value={value} className="text-gray-900">
                    {label}
                  </option>
                ))}
              </select>
            </div>

            {/* Start Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
              />
            </div>

            {/* End Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
              />
            </div>

            {/* Buttons */}
            <div className="flex items-end gap-2">
              <button
                onClick={fetchData}
                disabled={loading || !!dateError}
                className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 font-medium"
              >
                {loading ? "Loading..." : "Load Intervals"}
              </button>
            </div>
          </div>

          {dateError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              {dateError}
            </div>
          )}

          {!dateError && error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          {isSynced && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
              ✓ Data synced
            </div>
          )}
        </div>

        {/* No Data Message */}
        {!filteredData || filteredData.dailyAverages.length === 0 ? (
          <div className="bg-white rounded-lg shadow-lg p-12 text-center">
            <p className="text-gray-600 text-lg">No data found</p>
            {isSynced && (
              <p className="text-gray-500 text-sm mt-2">
                No interval sessions found for {selectedLabel} in this date range
              </p>
            )}
          </div>
        ) : (
          <>
            {/* Chart */}
            <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
              <h2 className="text-2xl font-bold text-gray-800 mb-6">
                Progress Trend
              </h2>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis
                    domain={[180, 420]}
                    ticks={[180, 210, 240, 270, 300, 330, 360, 390, 420]}
                    tickFormatter={(v: number) => {
                      const m = Math.floor(v / 60);
                      const s = v % 60;
                      return `${m}:${s.toString().padStart(2, "0")}`;
                    }}
                    label={{ value: "Pace (min/km)", angle: -90, position: "insideLeft", offset: 10 }}
                    reversed
                  />
                  <Tooltip
                    formatter={(value: unknown): string => {
                      const val = value as number;
                      const m = Math.floor(val / 60);
                      const s = Math.round(val % 60);
                      return `${m}:${s.toString().padStart(2, "0")} /km`;
                    }}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="bestPace"  stroke="#22c55e" name="Best Pace"  dot={false} connectNulls />
                  <Line type="monotone" dataKey="avgPace"   stroke="#3b82f6" name="Avg Pace"   dot={false} connectNulls />
                  <Line type="monotone" dataKey="worstPace" stroke="#ef4444" name="Worst Pace" dot={false} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Interval History Table */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-2xl font-bold text-gray-800 mb-6">
                {selectedLabel} Interval History
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b-2 border-gray-200">
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">
                        Date
                      </th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">
                        Avg
                      </th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">
                        Best Lap
                      </th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">
                        Worst Lap
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredData.dailyAverages.map((day, idx) => {
                      const isTimeBased = isTimeBasedInterval(selectedDistance);
                      const sessions = day.sessions ?? [];
                      // Collect individual best/worst laps from all sessions that day
                      const allBest = sessions.map(s => s.bestLap).filter(Boolean);
                      const allWorst = sessions.map(s => s.worstLap).filter(Boolean);
                      const dayBest = isTimeBased
                        ? allBest.reduce<typeof allBest[0]>((a, b) => (b!.distance > (a?.distance ?? -Infinity) ? b : a), allBest[0])
                        : allBest.reduce<typeof allBest[0]>((a, b) => (b!.time < (a?.time ?? Infinity) ? b : a), allBest[0]);
                      const dayWorst = isTimeBased
                        ? allWorst.reduce<typeof allWorst[0]>((a, b) => (b!.distance < (a?.distance ?? Infinity) ? b : a), allWorst[0])
                        : allWorst.reduce<typeof allWorst[0]>((a, b) => (b!.time > (a?.time ?? -Infinity) ? b : a), allWorst[0]);
                      const fmtAvg = isTimeBased
                        ? `${day.avgDistance ?? "?"}m / ${day.avgPace}`
                        : `${day.avgTime}s / ${day.avgPace}`;
                      const fmtBest = dayBest
                        ? isTimeBased
                          ? `${dayBest.distance}m / ${dayBest.pace}`
                          : `${dayBest.time}s / ${dayBest.pace}`
                        : "—";
                      const fmtWorst = dayWorst
                        ? isTimeBased
                          ? `${dayWorst.distance}m / ${dayWorst.pace}`
                          : `${dayWorst.time}s / ${dayWorst.pace}`
                        : "—";
                      return (
                        <tr
                          key={idx}
                          className="border-b border-gray-100 hover:bg-blue-50 transition"
                        >
                          <td className="px-4 py-3 text-gray-800">{day.date}</td>
                          <td className="px-4 py-3 text-gray-800">{fmtAvg}</td>
                          <td className="px-4 py-3 text-green-700 font-medium">{fmtBest}</td>
                          <td className="px-4 py-3 text-red-600 font-medium">{fmtWorst}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Helper functions
function timeStringToSeconds(timeStr: string): number {
  const parts = timeStr.split(":").map(Number);
  return parts[0] * 60 + parts[1];
}
