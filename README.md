# Strava Interval Training Tracker

A lightweight web application for analyzing and tracking interval training sessions from Strava. The app authenticates with Strava, fetches your activities, automatically detects interval training sessions, and displays performance trends across different distances (200m, 400m, 800m, 1k, 1200m, 1600m).

## Features

- **Strava OAuth Authentication**: Securely authenticate using your Strava account
- **Automatic Interval Detection**: Parses activity descriptions and lap data to identify interval sessions and distances
- **Performance Tracking**: View average pace and time per interval distance per day
- **Progress Visualization**: Dual-axis line graphs showing both pace and raw time trends
- **Distance Filtering**: Select specific interval distances to analyze
- **Date Range Selection**: Default 3-month range, customizable up to 6 months
- **Client-side Caching**: localStorage caching prevents redundant API calls during the session
- **Manual Sync**: Refresh data from Strava with a "Sync Data" button

## Prerequisites

- Node.js 18+ with npm
- Strava account
- Strava API credentials (Client ID and Secret)

## Getting Started

### 1. Get Strava API Credentials

1. Visit [Strava API Settings](https://www.strava.com/settings/api)
2. Create a new application
3. Get your **Client ID** and **Client Secret**

### 2. Set Up Environment Variables

Copy `.env.local.example` to `.env.local` and fill in your credentials:

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

```
STRAVA_CLIENT_ID=your_strava_client_id
STRAVA_CLIENT_SECRET=your_strava_client_secret
NEXTAUTH_SECRET=your_nextauth_secret_key
NEXTAUTH_URL=http://localhost:3000
```

Generate a secure `NEXTAUTH_SECRET` using:
```bash
openssl rand -base64 32
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## How It Works

### Interval Detection Algorithm

The app uses a multi-stage approach to detect interval training sessions:

1. **Description Parsing**: Looks for patterns like "5x400m", "3x800m" in activity descriptions
2. **Lap Data Analysis**: Analyzes lap data to identify repeated similar-distance efforts (±15% tolerance)
3. **Distance Validation**: Confirms detected distances match our target intervals

When both methods detect different distances, lap data is prioritized as more reliable.

### Dashboard UI

**Controls:**
- **Distance Dropdown**: Select interval distance to display
- **Date Range Picker**: Choose start and end dates (max 6 months)
- **Sync Data Button**: Manually fetch latest data from Strava

**Visualizations:**
- **Trend Graph**: Dual-axis line chart showing pace (min/km) and raw time in seconds
- **Daily Averages Table**: Shows sessions per day and calculated averages

**Data Caching:**
- Data fetched from Strava is cached in localStorage
- Switching distances or dates uses cached data when available
- Sync button refreshes data from Strava API

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── auth/[...nextauth]/ → NextAuth.js route
│   │   └── dashboard/ → Dashboard data API endpoint
│   ├── dashboard/ → Main dashboard page
│   ├── login/ → Login page
│   └── page.tsx → Root redirect
├── components/
│   └── DashboardClient.tsx → Interactive dashboard component
├── lib/
│   ├── auth.ts → NextAuth configuration
│   └── strava.ts → Strava API integration & interval detection
└── types/
    ├── index.ts → TypeScript interfaces
    └── next-auth.d.ts → NextAuth type definitions
```

## API Endpoints

### POST /api/dashboard

Fetches and aggregates interval training data.

**Request:**
```json
{
  "startDate": "2024-01-01",
  "endDate": "2024-02-01",
  "distance": 400
}
```

**Response:**
```json
{
  "distance": 400,
  "intervals": [
    {
      "sessionId": 12345,
      "sessionDate": "2024-01-15",
      "activityName": "5x400m intervals",
      "distance": 400,
      "avgTime": 105,
      "avgPace": "4:23",
      "detected_by": "lap"
    }
  ],
  "dailyAverages": [
    {
      "date": "2024-01-15",
      "distance": 400,
      "avgTime": 105,
      "avgPace": "4:23",
      "sessions": [...]
    }
  ]
}
```

## Deployment

### Deploy to Vercel

1. Push your code to a GitHub repository
2. Connect the repository to Vercel
3. Add environment variables in Vercel dashboard:
   - `STRAVA_CLIENT_ID`
   - `STRAVA_CLIENT_SECRET`
   - `NEXTAUTH_SECRET` (generate with `openssl rand -base64 32`)
   - `NEXTAUTH_URL` (your Vercel domain)

4. Deploy:
```bash
npm run build
npm start
```

## Development

### Run Tests

Run the full test suite before submitting any changes:

```bash
npm test
```

Watch mode for development:

```bash
npm run test:watch
```

> **Important:** Always run `npm test` before pushing changes to ensure no regressions in interval detection, pace calculation, or dashboard API behavior.

### Build for Production

```bash
npm run build
npm start
```

### Run Linter

```bash
npm run lint
```

## Notes

- The app does not store any data persistently - all data is fetched on-demand from Strava
- Session tokens are encrypted in cookies for security
- Strava API has rate limits (600 requests per 15 minutes)
- Maximum date range is 6 months to avoid excessive API calls

## Technologies Used

- **Next.js 16** - React framework with API routes
- **NextAuth.js 5** - Authentication with Strava OAuth
- **Recharts** - Data visualization library
- **TypeScript** - Type-safe development
- **Tailwind CSS** - Styling

## License

MIT

