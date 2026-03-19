# Strava Interval Training Tracker - AI Coding Guidelines

## Project Overview

A Next.js web app that analyzes interval training sessions from Strava. The architecture is **stateless** (no database) - data flows from Strava API → NextAuth.js session → dashboard API → client-side React component with localStorage caching.

## Core Architecture & Data Flow

### Authentication Layer (`src/lib/auth.ts`)
- **NextAuth.js with two modes**: 
  - **Production**: Strava OAuth 2.0 (`StravaProvider`)
  - **Demo Mode**: Credentials provider for testing (no Strava credentials needed)
- Stores access token in JWT-encrypted session; **always trim environment variables** to prevent whitespace bugs
- Session strategy: `jwt` with 7-day max age

### Data Pipeline
1. **Frontend** (DashboardClient): User selects distance + date range → calls `/api/dashboard` POST
2. **Backend** (dashboard/route.ts): 
   - Validates session + inputs
   - Calls `fetchStravaActivities()` (time-windowed query, filters by "interval" in name/description)
   - For each activity, fetches detailed data with laps via `fetchDetailedActivity()`
   - Calls `parseIntervalSession()` to extract intervals
3. **Strava Library** (`src/lib/strava.ts`):
   - **Multi-stage interval detection**:
     - Stage 1: Parse description for patterns like `5x400m`, `3x800m`
     - Stage 2: Infer from lap data (find most-common lap distance with 15% tolerance)
     - Stage 3: Lap data is prioritized over description when conflicting
   - Returns `ParsedInterval[]` with validated distances
4. **Client Side**: Caches response in `localStorage` under key `"stravaData"`; subsequent distance/date filters use cache

### Key Types & Constants (`src/types/index.ts`)
```typescript
INTERVAL_DISTANCES = { "200m": 200, "400m": 400, "800m": 800, "1k": 1000, "1200m": 1200, "1600m": 1600 }
ParsedInterval = { sessionId, sessionDate, activityName, distance, avgTime, avgPace, detected_by }
IntervalDay = { date, distance, avgTime, avgPace, sessions[] } // daily aggregates
```

## Developer Workflows

### Local Development
```bash
npm run dev        # Start Next.js dev server (http://localhost:3000)
npm run build      # Build for production
npm run lint       # Run ESLint
```

### Testing Without Strava
1. Set `DEMO_MODE=true` and `NEXT_PUBLIC_DEMO_MODE=true` in `.env.local`
2. Visit `/login` → click "Enter Demo Mode" → loads `src/lib/mock-data.ts` with 6 sample interval sessions
3. Full UI testing available: filtering, date ranges, charts, caching all work with demo data

### Environment Setup
```
STRAVA_CLIENT_ID=<from strava.com/settings/api>
STRAVA_CLIENT_SECRET=<from strava.com/settings/api>
NEXTAUTH_SECRET=<generate: openssl rand -base64 32>
NEXTAUTH_URL=http://localhost:3000
DEMO_MODE=false  # set true for testing without Strava credentials
NEXT_PUBLIC_DEMO_MODE=false
```

## Code Patterns & Conventions

### Interval Detection Logic (`strava.ts`)
- **Three regex patterns** in `parseDescriptionForIntervals()`: handles "5x400m", "5x400 meter", "5 repeat of 400m"
- **Lap distance inference**: filters for most-common lap distance; 15% tolerance for rounding/GPS variance
- **Distance validation**: always check against `INTERVAL_DISTANCES` before returning
- **Pace calculation**: `time_seconds / (distance_meters / 1000) = minutes_per_km`

### Session Management Pattern
- Extract `session?.accessToken` from `getServerSession(authOptions)` in server components
- Pass token to Strava API calls (e.g., `fetchStravaActivities(accessToken, before, after)`)
- Demo mode bypasses Strava: returns mock activities directly

### Client-Side State Management (`DashboardClient.tsx`)
- **Local state only**: `selectedDistance`, `startDate`, `endDate`, `data`, `loading`, `error`
- **Two useEffect hooks**:
  1. Initialize dates (today - 90 days default)
  2. Load from localStorage on mount
- **Validation in fetchData()**: date range max 180 days, validate start < end
- **Error handling**: catch response errors + JSON parsing failures; log with emoji prefixes for debugging

### Recharts Visualization Pattern
- Transform `IntervalDay[]` into chart data: `{ date, time, pace: timeStringToSeconds() }`
- Dual-axis chart: left Y-axis for pace (seconds), right Y-axis for time
- **Responsive**: wrap charts in `ResponsiveContainer` with percentage widths

### Logging Conventions
- Use emoji prefixes: 🔵 (start), ✅ (success), ❌ (error), ⚠️ (warning), 🔄 (fetch), 📊 (processing)
- Always log request/response context: session presence, activity counts, validation failures
- Prefix logs with `[Component/Module]` for easy tracing

## Critical Implementation Details

1. **Trim environment variables** in `auth.ts` to prevent OAuth failures
2. **Validate distance against INTERVAL_DISTANCES** before all API returns
3. **Lap data prioritized over description** when both detection methods succeed
4. **localStorage key is `"stravaData"`** - changing breaks caching
5. **Date range validation**: max 180 days, must parse as ISO strings
6. **Demo mode paths**: `if (DEMO_MODE)` branch in `auth.ts` + `fetchStravaActivities()` returns mock data
7. **No database required**: design must remain stateless; all persistence via localStorage or Strava API

## File Structure & Responsibilities
- `src/lib/strava.ts` - Core interval detection + Strava API wrappers
- `src/lib/auth.ts` - NextAuth configuration + OAuth/Demo mode setup
- `src/app/api/dashboard/route.ts` - Main backend orchestration
- `src/components/DashboardClient.tsx` - Client-side UI + data fetching
- `src/types/index.ts` - TypeScript interfaces + constants (source of truth for distance validation)

## Dependencies & Key Versions
- Next.js 16.1.6 - Framework
- NextAuth.js 4.24.13 - Auth/OAuth
- Recharts 3.7.0 - Charting
- Axios 1.13.4 - HTTP client
- Tailwind CSS 4 - Styling
