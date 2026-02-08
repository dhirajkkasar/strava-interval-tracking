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
import { ParsedInterval, IntervalDay, INTERVAL_DISTANCES } from "../types";

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
        setIsSynced(true);
      } catch (e) {
        console.error("Failed to parse cached data:", e);
      }
    }
  }, []);

  const fetchData = async () => {
    if (!startDate || !endDate) {
      setError("Please select both start and end dates");
      return;
    }

    // Validate date range (max 6 months)
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = end.getTime() - start.getTime();
    const diffDays = diffTime / (1000 * 60 * 60 * 24);

    if (diffDays > 180) {
      setError("Date range cannot exceed 6 months");
      return;
    }

    if (diffDays < 0) {
      setError("Start date must be before end date");
      return;
    }

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
          distance: selectedDistance,
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

  const chartData = filteredData?.dailyAverages.map((day) => ({
    date: day.date,
    time: day.avgTime,
    pace: timeStringToSeconds(day.avgPace),
  })) || [];

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
                Distance
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
                disabled={loading}
                className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 font-medium"
              >
                {loading ? "Loading..." : "Sync Data"}
              </button>
            </div>
          </div>

          {error && (
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
                No interval sessions found for {selectedDistance}m in this date range
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
                  <YAxis label={{ value: "Time (seconds)", angle: -90, position: "insideLeft" }} />
                  <Tooltip 
                    formatter={(value: unknown, name?: string): string => {
                      const val = value as number;
                      if (name === "time") return `${val} sec`;
                      return String(value);
                    }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="time"
                    stroke="#3b82f6"
                    name="Avg Time (sec)"
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Daily Averages Table */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-2xl font-bold text-gray-800 mb-6">
                Daily Averages - {selectedDistance}m
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b-2 border-gray-200">
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">
                        Date
                      </th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">
                        Sessions
                      </th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">
                        Avg Time
                      </th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">
                        Avg Pace
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredData.dailyAverages.map((day, idx) => (
                      <tr
                        key={idx}
                        className="border-b border-gray-100 hover:bg-blue-50 transition"
                      >
                        <td className="px-4 py-3 text-gray-800">{day.date}</td>
                        <td className="px-4 py-3 text-gray-800">{day.sessions.length}</td>
                        <td className="px-4 py-3 text-gray-800">{day.avgTime}s</td>
                        <td className="px-4 py-3 text-gray-800">{day.avgPace}</td>
                      </tr>
                    ))}
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

function secondsToTimeString(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
