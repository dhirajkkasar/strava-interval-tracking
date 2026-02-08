# Quick Setup Guide

## Local Development - Two Options

### Option 1: Demo Mode (Recommended for Testing)

Demo Mode allows you to test the entire application with realistic sample data **without needing Strava credentials**.

#### Setup

1. Make sure `.env.local` has:
   ```
   DEMO_MODE=true
   NEXT_PUBLIC_DEMO_MODE=true
   ```

2. Start the dev server:
   ```bash
   npm run dev
   ```

3. Visit http://localhost:3000

4. Click "Enter Demo Mode" button (no OAuth login needed)

5. The dashboard will load with 6 pre-configured interval training sessions:
   - 5x400m intervals
   - 3x800m repeats  
   - 6x200m fast repeats
   - 3x1200m intervals
   - 5x400m with 400m recovery
   - 4x1600m mile repeats

#### Features to Test in Demo Mode

✓ **Distance filtering**: Switch between 200m, 400m, 800m, 1k, 1200m, 1600m
✓ **Date range selection**: All demo data is from the last 7 days
✓ **Trend charts**: Pace and time trends for each distance
✓ **Daily averages**: Aggregated performance metrics
✓ **Data caching**: localStorage caching works normally
✓ **UI interactions**: Sync button, dropdowns, all responsive features

**Demo Mode includes sample data with:**
- Multiple interval distances to filter by
- Varying performance (some sessions faster, some slower)
- Realistic lap data and timing
- Data spread across 7 days

---

### Option 2: Real Strava Data

If you want to use your actual Strava activities:

1. Register your application with Strava

   Visit https://www.strava.com/settings/api and create a new application:
   - **Application name**: "Interval Training Tracker"
   - **Website**: `http://localhost:3000` (for local dev)
   - **Authorization Callback Domain**: `localhost`

2. Get your credentials

   After creation, you'll receive:
   - **Client ID**
   - **Client Secret**

3. Update environment variables

   Edit `.env.local`:
   ```
   STRAVA_CLIENT_ID=<your-client-id>
   STRAVA_CLIENT_SECRET=<your-client-secret>
   NEXTAUTH_SECRET=dev-secret-change-in-production
   NEXTAUTH_URL=http://localhost:3000
   
   # Disable demo mode
   DEMO_MODE=false
   NEXT_PUBLIC_DEMO_MODE=false
   ```

4. Restart the dev server

   ```bash
   npm run dev
   ```

5. Test the OAuth flow

   - Visit http://localhost:3000
   - Click "Sign in with Strava"
   - Authorize the application
   - Dashboard will load with your real Strava interval activities

---

## Features to Test

### Demo Mode
✓ Instant login without OAuth
✓ Pre-loaded sample interval data
✓ All dashboard features work the same
✓ Perfect for UI/UX testing

### Real Strava Mode
✓ OAuth authentication flow
✓ Fetch your actual activities
✓ Test interval detection on real data
✓ Verify date filtering works with your timeline
✓ Check caching behavior with larger datasets

---

## Troubleshooting

### Demo Mode Issues

**Button says "Enter Demo Mode" but clicking does nothing**
- Check browser console for JavaScript errors
- Ensure NEXT_PUBLIC_DEMO_MODE=true in .env.local
- Restart dev server after changing env variables

**No data shown after login**
- Make sure DEMO_MODE=true in .env.local (server-side)
- Refresh the page
- Clear localStorage: Open DevTools > Application > Storage > Clear All

---

### Real Strava Mode Issues

**"No data found" message**
- Ensure your Strava account has activities with "interval" in the name or description
- Verify the date range covers your interval training sessions
- Check browser console for API errors

**OAuth fails with "Unauthorized"**
- Verify Client ID and Secret are correct in .env.local
- Ensure NEXTAUTH_URL matches your domain (http://localhost:3000 for local)
- Check that Strava callback domain includes localhost
- Clear browser cookies and try again

**"Failed to fetch dashboard data" error**
- Your Strava session token may have expired
- Try logging out and logging back in
- Check if your Strava token needs refresh

---

## Switching Between Demo and Real Modes

To switch from Demo to Real mode:

```bash
# 1. Edit .env.local
DEMO_MODE=false
NEXT_PUBLIC_DEMO_MODE=false

# 2. Add Strava credentials
STRAVA_CLIENT_ID=your_id
STRAVA_CLIENT_SECRET=your_secret

# 3. Restart dev server
npm run dev

# 4. Clear browser data (optional but recommended)
# DevTools > Application > Clear Site Data
```

To switch back to Demo:

```bash
# 1. Edit .env.local
DEMO_MODE=true
NEXT_PUBLIC_DEMO_MODE=true

# 2. Restart dev server
npm run dev
```

---

## Production Deployment

### Vercel Deployment

1. Push to GitHub

2. Connect to Vercel

3. Add environment variables in Vercel dashboard:
   ```
   STRAVA_CLIENT_ID=<production-client-id>
   STRAVA_CLIENT_SECRET=<production-secret>
   NEXTAUTH_SECRET=<production-secret>
   NEXTAUTH_URL=https://your-domain.vercel.app
   DEMO_MODE=false
   NEXT_PUBLIC_DEMO_MODE=false
   ```

4. Update Strava API settings:
   - Set callback domain to your Vercel domain

5. Deploy

---

## API Rate Limits

Strava API rate limits (real mode only):
- 600 requests per 15 minutes
- 30,000 requests per day

Demo mode has no rate limits since it uses local mock data.

---

## Support

For issues:
- **Strava API**: https://developers.strava.com/
- **Next.js**: https://nextjs.org/docs
- **NextAuth.js**: https://next-auth.js.org/

