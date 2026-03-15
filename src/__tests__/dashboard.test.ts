import { NextRequest } from "next/server";

// Mock next-auth
jest.mock("next-auth", () => ({
  getServerSession: jest.fn(),
}));

// Mock strava lib
jest.mock("../lib/strava", () => ({
  fetchStravaActivities: jest.fn(),
  fetchDetailedActivity: jest.fn(),
  parseIntervalSession: jest.fn(),
  calculatePace: jest.requireActual("../lib/strava").calculatePace,
}));

// Mock auth config
jest.mock("../lib/auth", () => ({
  authOptions: {},
}));

import { getServerSession } from "next-auth";
import { fetchStravaActivities, fetchDetailedActivity, parseIntervalSession } from "../lib/strava";
import { POST } from "../app/api/dashboard/route";

const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>;
const mockFetchActivities = fetchStravaActivities as jest.MockedFunction<typeof fetchStravaActivities>;
const mockFetchDetailed = fetchDetailedActivity as jest.MockedFunction<typeof fetchDetailedActivity>;
const mockParseInterval = parseIntervalSession as jest.MockedFunction<typeof parseIntervalSession>;

function makeRequest(body: object): NextRequest {
  return new NextRequest("http://localhost:3000/api/dashboard", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => jest.clearAllMocks());

describe("POST /api/dashboard", () => {
  // --- Auth ---
  it("returns 401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await POST(makeRequest({ startDate: "2024-01-01", endDate: "2024-02-01" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 401 when session has no accessToken", async () => {
    mockGetServerSession.mockResolvedValue({ expires: "" } as any);
    const res = await POST(makeRequest({ startDate: "2024-01-01", endDate: "2024-02-01" }));
    expect(res.status).toBe(401);
  });

  // --- Validation ---
  it("returns 400 when startDate missing", async () => {
    mockGetServerSession.mockResolvedValue({ accessToken: "tok" } as any);
    const res = await POST(makeRequest({ endDate: "2024-02-01" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when endDate missing", async () => {
    mockGetServerSession.mockResolvedValue({ accessToken: "tok" } as any);
    const res = await POST(makeRequest({ startDate: "2024-01-01" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid distance", async () => {
    mockGetServerSession.mockResolvedValue({ accessToken: "tok" } as any);
    const res = await POST(makeRequest({ startDate: "2024-01-01", endDate: "2024-02-01", distance: 999 }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid distance" });
  });

  // --- Aggregation ---
  it("returns parsed intervals and daily averages", async () => {
    mockGetServerSession.mockResolvedValue({ accessToken: "tok" } as any);
    mockFetchActivities.mockResolvedValue([
      { id: 1, name: "5x400m intervals", description: "5x400m", workout_type: 3 },
    ]);
    mockFetchDetailed.mockResolvedValue({} as any);
    mockParseInterval.mockReturnValue({
      sessionId: 1,
      sessionDate: "2024-01-15",
      activityName: "5x400m intervals",
      distance: 400,
      avgTime: 90,
      avgPace: "3:45",
      detected_by: "description",
    });

    const res = await POST(makeRequest({ startDate: "2024-01-01", endDate: "2024-02-01", distance: 400 }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.distance).toBe(400);
    expect(data.intervals).toHaveLength(1);
    expect(data.intervals[0].sessionId).toBe(1);
    expect(data.dailyAverages).toHaveLength(1);
    expect(data.dailyAverages[0].date).toBe("2024-01-15");
    expect(data.dailyAverages[0].avgTime).toBe(90);
  });

  it("filters intervals by requested distance", async () => {
    mockGetServerSession.mockResolvedValue({ accessToken: "tok" } as any);
    mockFetchActivities.mockResolvedValue([
      { id: 1, name: "5x400m", workout_type: 3 },
      { id: 2, name: "3x800m", workout_type: 3 },
    ]);
    mockFetchDetailed.mockResolvedValue({} as any);
    mockParseInterval
      .mockReturnValueOnce({ sessionId: 1, sessionDate: "2024-01-15", activityName: "5x400m", distance: 400, avgTime: 90, avgPace: "3:45", detected_by: "description" })
      .mockReturnValueOnce({ sessionId: 2, sessionDate: "2024-01-16", activityName: "3x800m", distance: 800, avgTime: 180, avgPace: "3:45", detected_by: "description" });

    const res = await POST(makeRequest({ startDate: "2024-01-01", endDate: "2024-02-01", distance: 400 }));
    const data = await res.json();

    expect(data.intervals).toHaveLength(1);
    expect(data.intervals[0].distance).toBe(400);
  });

  it("groups multiple sessions on same date into daily averages", async () => {
    mockGetServerSession.mockResolvedValue({ accessToken: "tok" } as any);
    mockFetchActivities.mockResolvedValue([
      { id: 1, name: "5x400m AM", workout_type: 3 },
      { id: 2, name: "5x400m PM", workout_type: 3 },
    ]);
    mockFetchDetailed.mockResolvedValue({} as any);
    mockParseInterval
      .mockReturnValueOnce({ sessionId: 1, sessionDate: "2024-01-15", activityName: "5x400m AM", distance: 400, avgTime: 90, avgPace: "3:45", detected_by: "description" })
      .mockReturnValueOnce({ sessionId: 2, sessionDate: "2024-01-15", activityName: "5x400m PM", distance: 400, avgTime: 100, avgPace: "4:10", detected_by: "description" });

    const res = await POST(makeRequest({ startDate: "2024-01-01", endDate: "2024-02-01", distance: 400 }));
    const data = await res.json();

    expect(data.dailyAverages).toHaveLength(1);
    expect(data.dailyAverages[0].avgTime).toBe(95); // avg of 90 and 100
    expect(data.dailyAverages[0].sessions).toHaveLength(2);
  });

  it("pre-filters activities by interval keywords", async () => {
    mockGetServerSession.mockResolvedValue({ accessToken: "tok" } as any);
    mockFetchActivities.mockResolvedValue([
      { id: 1, name: "Easy jog", description: "Recovery", workout_type: 0 },
      { id: 2, name: "5x400m intervals", description: "", workout_type: 0 },
    ]);
    mockFetchDetailed.mockResolvedValue({} as any);
    mockParseInterval.mockReturnValue(null);

    await POST(makeRequest({ startDate: "2024-01-01", endDate: "2024-02-01" }));

    // Only the interval activity should have fetchDetailedActivity called
    expect(mockFetchDetailed).toHaveBeenCalledTimes(1);
  });

  it("returns empty results when no intervals found", async () => {
    mockGetServerSession.mockResolvedValue({ accessToken: "tok" } as any);
    mockFetchActivities.mockResolvedValue([]);

    const res = await POST(makeRequest({ startDate: "2024-01-01", endDate: "2024-02-01" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.intervals).toHaveLength(0);
    expect(data.dailyAverages).toHaveLength(0);
  });
});
