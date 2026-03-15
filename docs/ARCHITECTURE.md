# Strava Interval Training Tracker — Architecture Document

## 1. Overview

A Next.js web application that integrates with the Strava API to fetch running activities, automatically detect interval training sessions, and visualize performance trends across six standard interval distances (200m, 400m, 800m, 1000m, 1200m, 1600m).

The app provides OAuth-based authentication with Strava, a dashboard with interactive charts and tables, client-side caching, and a demo mode for testing without real Strava credentials.

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Browser (Client)                        │
│                                                                 │
│  ┌──────────────┐   ┌──────────────────────┐   ┌────────────┐  │
│  │  Login Page   │   │  Dashboard Client     │   │ localStorage│  │
│  │  (React CSR)  │──▶│  (React CSR)          │◀─▶│  (Cache)    │  │
│  └──────┬───────┘   └──────────┬───────────┘   └────────────┘  │
│         │                      │                                │
└─────────┼──────────────────────┼────────────────────────────────┘
          │ OAuth / Demo         │ POST /api/dashboard
          ▼                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Next.js Server (Node.js)                    │
│                                                                 │
│  ┌──────────────────┐   ┌──────────────────────────────────┐   │
│  │ NextAuth.js       │   │ Dashboard API Route               │   │
│  │ /api/auth/[...]   │   │ POST /api/dashboard               │   │
│  │                   │   │                                    │   │
│  │ • Strava OAuth    │   │ • Session validation               │   │
│  │ • JWT management  │   │ • Fetch activities (Strava/Mock)   │   │
│  │ • Token refresh   │   │ • Interval detection & parsing     │   │
│  │ • Demo credentials│   │ • Daily aggregation                │   │
│  └────────┬──────────┘   └──────────┬─────────────────────────┘   │
│           │                         │                             │
└───────────┼─────────────────────────┼─────────────────────────────┘
            │                         │
            ▼                         ▼
┌──────────────────────────────────────────────┐
│              Strava API (External)           │
│                                              │
│  GET /api/v3/athlete/activities              │
│  GET /api/v3/activities/:id                  │
│  POST /api/v3/oauth/token (refresh)          │
└──────────────────────────────────────────────┘
```

---

## 3. Technology Stack

| Layer          | Technology                  | Version   |
|----------------|-----------------------------|-----------|
| Framework      | Next.js (App Router)        | 16.1.6    |
| UI Library     | React                       | 19.2.3    |
| Language       | TypeScript (strict)         | 5.x       |
| Authentication | NextAuth.js                 | 4.24.13   |
| HTTP Client    | Axios / Fetch API           | 1.13.4    |
| Charts         | Recharts                    | 3.7.0     |
| Styling        | Tailwind CSS                | 4.x       |
| Build Tool     | PostCSS + Tailwind plugin   | —         |
| Linting        | ESLint + next config        | 9.x       |
| Optimization   | React Compiler (babel)      | 1.0.0     |

---

## 4. Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── auth/[...nextauth]/route.ts   ← NextAuth dynamic route handler
│   │   └── dashboard/route.ts            ← Dashboard data API (POST)
│   ├── dashboard/page.tsx                ← Protected dashboard page (SSR)
│   ├── login/page.tsx                    ← Login page (CSR)
│   ├── page.tsx                          ← Root redirect (SSR)
│   ├── layout.tsx                        ← Root layout with fonts/globals
│   ├── globals.css                       ← Tailwind + CSS variables
│   └── favicon.ico
├── components/
│   └── DashboardClient.tsx               ← Main interactive dashboard (CSR)
├── lib/
│   ├── auth.ts                           ← NextAuth config + JWT callbacks
│   ├── strava.ts                         ← Strava API client + interval parser
│   └── mock-data.ts                      ← 30 mock activities for demo mode
└── types/
    ├── index.ts                          ← All TypeScript interfaces + constants
    └── next-auth.d.ts                    ← NextAuth session/JWT type augmentation
```

---

## 5. Component Details

### 5.1 Authentication Layer (`src/lib/auth.ts`)

Handles two authentication modes controlled by the `DEMO_MODE` environment variable:

**Strava OAuth Mode** (`DEMO_MODE=false`):
- Uses `StravaProvider` from NextAuth with `activity:read_all` scope
- JWT strategy stores `access_token`, `refresh_token`, and `expires_at`
- Automatic token refresh when expired via Strava's `/api/v3/oauth/token`
- Session callback exposes `accessToken` to the client session

**Demo Mode** (`DEMO_MODE=true`):
- Uses `CredentialsProvider` with a hardcoded demo user
- Generates a fake `demo-token` with 7-day expiry
- No external API calls required

**Auth Flow:**
```
User visits /
  ├── Has session? → redirect /dashboard
  └── No session?  → redirect /login
                        ├── Demo mode?  → CredentialsProvider → JWT → /dashboard
                        └── Real mode?  → Strava OAuth → JWT → /dashboard
```

### 5.2 Dashboard API (`src/app/api/dashboard/route.ts`)

A single `POST` endpoint that orchestrates data fetching and processing.

**Request:** `{ startDate: string, endDate: string, distance?: number }`

**Processing Pipeline:**
1. Validate session and access token
2. Convert date strings to Unix timestamps
3. Fetch activities from Strava (or mock data in demo mode)
4. Filter for activities containing "interval" in name or description
5. For each interval activity, fetch detailed data (laps)
6. Run interval detection algorithm on each activity
7. Filter by requested distance (if provided)
8. Group parsed intervals by date
9. Calculate daily averages (avgTime, avgPace)
10. Return sorted results

**Response:** `{ distance, intervals: ParsedInterval[], dailyAverages: IntervalDay[] }`

### 5.3 Strava API Client (`src/lib/strava.ts`)

Two main API functions with demo mode fallback:

- `fetchStravaActivities(accessToken, before?, after?)` — Lists activities within a date range (max 200 per page)
- `fetchDetailedActivity(accessToken, activityId)` — Fetches a single activity with lap data

**Interval Detection Algorithm:**

```
Activity → parseIntervalSession()
  │
  ├── 1. Parse description for regex patterns (e.g., "5x400m")
  │      → If match found and distance is valid → detected_by: "description"
  │
  ├── 2. Analyze lap data for repeated similar distances (±15% tolerance)
  │      → Find most common lap distance
  │      → Match to nearest valid interval distance
  │      → detected_by: "lap"
  │
  └── 3. Calculate avgTime and avgPace from matching laps
         → Return ParsedInterval or null
```

Valid interval distances: 200m, 400m, 800m, 1000m, 1200m, 1600m

### 5.4 Dashboard Client (`src/components/DashboardClient.tsx`)

Client-side React component with the following state:

| State            | Type              | Purpose                              |
|------------------|-------------------|--------------------------------------|
| selectedDistance  | number            | Active distance filter (default 400) |
| startDate        | string            | Date range start (default -90 days)  |
| endDate          | string            | Date range end (default today)       |
| loading          | boolean           | API request in progress              |
| error            | string            | Error message display                |
| data             | DashboardData     | Fetched interval data                |
| isSynced         | boolean           | Whether data has been loaded          |

**UI Sections:**
1. Header with title
2. Controls bar: distance dropdown, date pickers, sync button
3. Line chart (Recharts) showing average time trend over dates
4. Daily averages table with date, session count, avg time, avg pace

**Caching:** Data is stored in `localStorage` under key `stravaData` and loaded on mount.

### 5.5 Login Page (`src/app/login/page.tsx`)

Client-rendered page that:
- Detects demo mode via `NEXT_PUBLIC_DEMO_MODE` env var
- Shows "Enter Demo Mode" or "Sign in with Strava" button accordingly
- Handles OAuth redirect via `signIn()` from `next-auth/react`
- Displays error messages from URL query params

### 5.6 Root Page (`src/app/page.tsx`)

Server-rendered redirect logic:
- Checks for existing session via `getServerSession()`
- Redirects to `/dashboard` if authenticated
- Redirects to `/login` if not

---

## 6. Data Model

### Core Types (`src/types/index.ts`)

```typescript
StravaActivity          // Base activity from Strava API
  └── DetailedActivity  // Extended with laps, segments, splits

StravaLap               // Individual lap within an activity
SegmentEffort           // Segment effort data
Split                   // Metric split data

ParsedInterval          // Processed interval session result
IntervalDay             // Daily aggregation of intervals
DashboardData           // Full API response structure

INTERVAL_DISTANCES      // Constant: { "200m": 200, "400m": 400, ... }
```

### Session Types (`src/types/next-auth.d.ts`)

Augments NextAuth types to include:
- `Session.accessToken: string` — Strava access token on session object
- `JWT.access_token`, `JWT.refresh_token`, `JWT.expires_at`, `JWT.error` — Token storage in JWT

---

## 7. Data Flow Diagram

```
User clicks "Sync Data"
        │
        ▼
DashboardClient.fetchData()
        │
        ├── Validates date range (max 6 months)
        │
        ▼
POST /api/dashboard { startDate, endDate, distance }
        │
        ├── getServerSession() → validates JWT
        │
        ├── fetchStravaActivities(token, before, after)
        │       │
        │       ├── DEMO_MODE? → return MOCK_ACTIVITIES (filtered)
        │       └── REAL MODE? → GET /api/v3/athlete/activities
        │
        ├── Filter activities with "interval" keyword
        │
        ├── For each interval activity:
        │       │
        │       ├── fetchDetailedActivity(token, id)
        │       │       ├── DEMO_MODE? → return from MOCK_ACTIVITIES
        │       │       └── REAL MODE? → GET /api/v3/activities/:id
        │       │
        │       └── parseIntervalSession(detailedActivity)
        │               ├── Parse description regex
        │               ├── Analyze lap distances
        │               └── Calculate avgTime, avgPace
        │
        ├── Group by date → calculate daily averages
        │
        └── Return { distance, intervals[], dailyAverages[] }
                │
                ▼
DashboardClient receives response
        │
        ├── setData(result)
        ├── localStorage.setItem("stravaData", JSON.stringify(result))
        │
        └── Render chart + table (filtered by selectedDistance)
```

---

## 8. Security Considerations

- OAuth tokens stored in encrypted JWT cookies (not exposed to client JS)
- `accessToken` passed to session only for server-side API calls
- No persistent database — no stored user data
- Strava API credentials stored in environment variables only
- `NEXTAUTH_SECRET` required for JWT encryption
- Session max age: 7 days (604800 seconds)
- Token refresh handled server-side

---

## 9. API Rate Limits

Strava API enforces:
- 600 requests per 15 minutes
- 30,000 requests per day

Mitigations:
- Max 200 activities fetched per request
- 6-month date range cap reduces activity volume
- Client-side caching avoids redundant fetches
- Demo mode bypasses API entirely

---

## 10. Environment Variables

| Variable                  | Required | Description                                |
|---------------------------|----------|--------------------------------------------|
| `STRAVA_CLIENT_ID`        | Yes*     | Strava API application client ID           |
| `STRAVA_CLIENT_SECRET`    | Yes*     | Strava API application client secret       |
| `NEXTAUTH_SECRET`         | Yes      | Secret for JWT encryption                  |
| `NEXTAUTH_URL`            | Yes      | Application base URL                       |
| `DEMO_MODE`               | No       | Enable demo mode (`true`/`false`)          |
| `NEXT_PUBLIC_DEMO_MODE`   | No       | Client-side demo mode flag                 |

*Not required when `DEMO_MODE=true`
