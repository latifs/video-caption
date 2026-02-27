# Video Caption App

A monorepo for automatically adding captions to videos. Built with Expo (mobile), Next.js (API), and Express (Cloud Run worker).

## Project Structure

```
video-caption-app/
├── apps/
│   ├── mobile/          # Expo 55 + Expo Router (React Native)
│   ├── api/             # Next.js 16 API (App Router)
│   └── worker/          # Express server for Google Cloud Run
├── packages/
│   └── types/           # Shared TypeScript types
├── pnpm-workspace.yaml
├── .npmrc
└── package.json
```

### `apps/mobile`

Expo React Native app with Expo Router. Screens live in `src/app/`. Uses Supabase for auth/storage and communicates with the API.

### `apps/api`

Next.js API server with route handlers at `src/app/api/`. Orchestrates video processing between the mobile client and the Cloud Run worker.

**Routes:**
- `GET /api/health` — health check
- `POST /api/process` — trigger video processing (not yet implemented)

### `apps/worker`

Express server designed for Google Cloud Run. Handles video processing tasks (captioning via OpenAI, video manipulation via ffmpeg).

**Endpoints:**
- `POST /process` — process a video

### `packages/types`

Shared TypeScript types used across workspaces. Exports raw `.ts` source (no build step needed — all consumers use bundlers).

## Prerequisites

- **Node.js** v20+ (v24.4.0 recommended)
- **pnpm** v10+
- **Docker** (for worker container builds)
- **Expo Go** app on your phone (for mobile development)

## Getting Started

```bash
# Install all dependencies
pnpm install

# Copy environment files
cp apps/mobile/.env.example apps/mobile/.env
cp apps/api/.env.local.example apps/api/.env.local
cp apps/worker/.env.example apps/worker/.env
```

Fill in the environment variables in each `.env` file before running the apps.

## Development

```bash
# Start the mobile app (Expo)
pnpm dev:mobile

# Start the API server (Next.js on port 3000)
pnpm dev:api

# Start the worker (Express on port 8080)
pnpm dev:worker
```

## Building

```bash
# Build the worker (TypeScript → JavaScript)
pnpm build:worker

# Build the API (Next.js production build)
pnpm --filter api build
```

## Docker (Worker)

```bash
# Build the image
docker build -t video-caption-worker apps/worker/

# Run locally
docker run -p 8080:8080 video-caption-worker

# Test
curl -X POST http://localhost:8080/process
```

## Environment Variables

### `apps/mobile/.env`

| Variable | Description |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key |
| `EXPO_PUBLIC_API_URL` | Next.js API base URL |

### `apps/api/.env.local`

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `WORKER_URL` | Cloud Run worker URL |
| `WORKER_SECRET` | Shared secret for worker auth |

### `apps/worker/.env`

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `OPENAI_API_KEY` | OpenAI API key for transcription |
| `WORKER_SECRET` | Shared secret for API auth |

## Tech Stack

- **Mobile:** Expo, React Native, Expo Router, Supabase JS
- **API:** Next.js, Supabase JS, Zod
- **Worker:** Express, OpenAI, fluent-ffmpeg, Supabase JS
- **Shared:** TypeScript, pnpm workspaces
