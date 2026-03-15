# Strava Interval Training Tracker — Deployment Guide

## 1. Prerequisites

- Node.js 18+ with npm
- A Strava account (for real mode)
- Strava API credentials (Client ID and Client Secret)
- A hosting platform (Vercel recommended, or any Node.js host)

---

## 2. Local Development

### 2.1 Install Dependencies

```bash
npm install
```

### 2.2 Configure Environment Variables

Create a `.env.local` file in the project root:

```bash
# Strava OAuth credentials
STRAVA_CLIENT_ID=your_strava_client_id
STRAVA_CLIENT_SECRET=your_strava_client_secret

# NextAuth configuration
NEXTAUTH_SECRET=your_random_secret_here
NEXTAUTH_URL=http://localhost:3000

# Demo mode (set both to true to skip Strava OAuth)
DEMO_MODE=false
NEXT_PUBLIC_DEMO_MODE=false
```

Generate a secure `NEXTAUTH_SECRET`:
```bash
openssl rand -base64 32
```

### 2.3 Strava API Setup

1. Go to https://www.strava.com/settings/api
2. Create a new application:
   - Application Name: `Interval Training Tracker`
   - Website: `http://localhost:3000`
   - Authorization Callback Domain: `localhost`
3. Copy the Client ID and Client Secret into `.env.local`

### 2.4 Run the Dev Server

```bash
npm run dev
```

Open http://localhost:3000.

### 2.5 Demo Mode (No Strava Required)

Set both env vars to `true` in `.env.local`:
```
DEMO_MODE=true
NEXT_PUBLIC_DEMO_MODE=true
```

Restart the dev server. Click "Enter Demo Mode" on the login page — no OAuth needed.

---

## 3. Production Build

### 3.1 Build

```bash
npm run build
```

This produces an optimized production build in the `.next/` directory.

### 3.2 Start Production Server

```bash
npm start
```

The server runs on port 3000 by default. Override with the `PORT` environment variable:
```bash
PORT=8080 npm start
```

### 3.3 Lint Check

```bash
npm run lint
```

---

## 4. Deployment Options

### 4.1 Vercel (Recommended)

Vercel is the native hosting platform for Next.js and provides zero-config deployment.

**Steps:**

1. Push your code to a Git repository (GitHub, GitLab, or Bitbucket).

2. Go to https://vercel.com and import the repository.

3. In the Vercel project settings, add environment variables:

   | Variable                | Value                                  |
   |-------------------------|----------------------------------------|
   | `STRAVA_CLIENT_ID`      | Your Strava Client ID                  |
   | `STRAVA_CLIENT_SECRET`  | Your Strava Client Secret              |
   | `NEXTAUTH_SECRET`       | A strong random string                 |
   | `NEXTAUTH_URL`          | `https://your-app.vercel.app`          |
   | `DEMO_MODE`             | `false`                                |
   | `NEXT_PUBLIC_DEMO_MODE` | `false`                                |

4. Update your Strava API application settings:
   - Authorization Callback Domain: `your-app.vercel.app`

5. Deploy. Vercel auto-detects Next.js and handles the build.

**Custom Domain:**
- Add your domain in Vercel project settings → Domains
- Update `NEXTAUTH_URL` to match the custom domain
- Update Strava callback domain accordingly

### 4.2 AWS Amplify

1. Push code to a Git repository.

2. In the AWS Amplify console, create a new app and connect the repository.

3. Amplify auto-detects Next.js. Add environment variables in the Amplify console (same as the Vercel table above).

4. Update Strava callback domain to your Amplify domain.

5. Deploy.

### 4.3 Docker

Create a `Dockerfile`:

```dockerfile
FROM node:18-alpine AS base

# Install dependencies
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --only=production

# Build
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Production
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000

CMD ["node", "server.js"]
```

To use standalone output, add to `next.config.ts`:
```typescript
const nextConfig: NextConfig = {
  output: "standalone",
  reactCompiler: true,
};
```

Build and run:
```bash
docker build -t interval-tracker .
docker run -p 3000:3000 \
  -e STRAVA_CLIENT_ID=your_id \
  -e STRAVA_CLIENT_SECRET=your_secret \
  -e NEXTAUTH_SECRET=your_secret \
  -e NEXTAUTH_URL=https://your-domain.com \
  interval-tracker
```

### 4.4 Generic Node.js Host (EC2, DigitalOcean, Railway, etc.)

1. Clone the repository on the server.
2. Install dependencies: `npm ci --only=production`
3. Set environment variables (via `.env.local`, systemd, or your platform's config).
4. Build: `npm run build`
5. Start: `npm start`
6. Use a reverse proxy (nginx, Caddy) to handle HTTPS and forward to port 3000.

**Example nginx config:**
```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## 5. Environment Variable Reference

| Variable                  | Required | Default | Description                                      |
|---------------------------|----------|---------|--------------------------------------------------|
| `STRAVA_CLIENT_ID`        | Yes*     | —       | Strava API client ID                             |
| `STRAVA_CLIENT_SECRET`    | Yes*     | —       | Strava API client secret                         |
| `NEXTAUTH_SECRET`         | Yes      | —       | Random string for JWT encryption                 |
| `NEXTAUTH_URL`            | Yes      | —       | Full base URL of the deployed app                |
| `DEMO_MODE`               | No       | `false` | Server-side demo mode toggle                     |
| `NEXT_PUBLIC_DEMO_MODE`   | No       | `false` | Client-side demo mode toggle                     |
| `PORT`                    | No       | `3000`  | Server port (for `npm start`)                    |

*Not required when `DEMO_MODE=true`

---

## 6. Post-Deployment Checklist

- [ ] Environment variables are set correctly on the hosting platform
- [ ] `NEXTAUTH_URL` matches the actual deployed URL (including `https://`)
- [ ] `NEXTAUTH_SECRET` is a strong, unique random value (not `dev-secret-change-in-production`)
- [ ] Strava API callback domain matches the deployed domain
- [ ] HTTPS is enabled (required for secure cookies and OAuth)
- [ ] Demo mode is disabled in production (`DEMO_MODE=false`)
- [ ] Application loads at the root URL and redirects to `/login`
- [ ] Strava OAuth flow completes successfully (login → authorize → dashboard)
- [ ] Dashboard loads data and renders charts
- [ ] Token refresh works (wait for token expiry or test manually)

---

## 7. Troubleshooting

**OAuth redirect fails with "Invalid redirect_uri"**
- Ensure the Strava API callback domain matches your deployed domain exactly (no trailing slash, no protocol prefix)

**"Unauthorized" error on dashboard**
- Session may have expired. Log out and log back in.
- Check that `NEXTAUTH_SECRET` is consistent across deployments (changing it invalidates all sessions).

**"Failed to fetch dashboard data"**
- Check server logs for Strava API errors.
- Verify `STRAVA_CLIENT_ID` and `STRAVA_CLIENT_SECRET` are correct.
- Strava rate limits: 600 requests/15 min, 30,000/day.

**Build fails**
- Ensure Node.js 18+ is installed.
- Run `npm ci` to get a clean install of dependencies.
- Check TypeScript errors: `npx tsc --noEmit`

**Cookies not working in production**
- HTTPS is required for secure cookies. Ensure your reverse proxy or hosting platform terminates TLS.
- `NEXTAUTH_URL` must use `https://`.

---

## 8. Monitoring & Observability

The application logs extensively to `stdout`/`stderr` with emoji-prefixed messages:

- `🔵` — Flow start / info
- `📋` — State inspection
- `✅` — Success
- `❌` — Error
- `⚠️` — Warning
- `🔄` — Token refresh

In production, pipe logs to your preferred log aggregation service (CloudWatch, Datadog, etc.) via your hosting platform's log forwarding.

No persistent database or external state is used — the app is stateless. Health can be monitored by checking the `/login` page returns HTTP 200.
