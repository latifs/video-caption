# Video Caption App

Upload short videos and get AI-generated captions burned in automatically.

## How It Works

Upload a short video from your phone, get AI-generated captions with accurate word-level timestamps, edit the text inline, then export a final video with subtitles burned in.

```
┌─────────────┐       ┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│   Mobile    │──────▶│     API     │──────▶│   Worker    │──────▶│  Replicate  │
│   (Expo)    │       │  (Next.js)  │       │  (Express)  │       │ (WhisperX)  │
└─────────────┘       └─────────────┘       └─────────────┘       └─────────────┘
       │                     │                     │
       │                     │              callback POST
       ▼                     ▼                     │
┌──────────────────────┐     │                     │
│      Supabase        │     │              ┌──────┘
│   Auth · Storage     │     ▼              ▼
│                      │  ┌─────────────────────┐
│                      │  │     PostgreSQL       │
│                      │  │   (via Prisma)       │
└──────────────────────┘  └─────────────────────┘
```

- **Mobile (Expo)** — Upload videos, browse/edit captions, trigger export
- **API (Next.js)** — Authentication, orchestration, all database writes via Prisma. Worker reports results back via a callback endpoint.
- **Worker (Express / Cloud Run)** — Heavy processing: audio extraction (ffmpeg), transcription (WhisperX via Replicate), subtitle burning (ffmpeg). No direct DB access — calls API callback to persist results.
- **Replicate** — Runs the WhisperX model (Whisper large-v3 + wav2vec2 forced alignment) on GPU for accurate per-word timestamps
- **Supabase** — Auth (JWT), Storage (raw + processed videos), PostgreSQL (video records, caption data)

### Transcription Pipeline

1. Mobile uploads video → Supabase Storage
2. Mobile calls `POST /api/process` → API creates DB record, calls Worker
3. Worker downloads video, extracts audio with ffmpeg
4. Worker sends audio to WhisperX on Replicate → returns word-level timestamps
5. Worker calls API callback with caption data → API saves to DB → status: `transcribed`
6. Mobile polls `GET /api/videos/:id`, displays editable captions
7. User edits captions (`PATCH /api/videos/:id/speech`)
8. User triggers export (`POST /api/videos/:id/export`) → API sends captionData + rawUrl to Worker
9. Worker burns subtitles into video with ffmpeg → uploads to Supabase Storage → calls API callback → status: `completed`

## Prerequisites

- Node.js 20+
- [pnpm](https://pnpm.io/) 10+
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (for local Supabase)
- [Supabase CLI](https://supabase.com/docs/guides/cli/getting-started)
- Xcode 16+ with an iOS simulator runtime (for mobile development)

## Setup

```bash
# Install dependencies
pnpm install

# Start local Supabase (requires Docker)
pnpm supabase:start

# Generate Prisma client
pnpm db:generate

# Run database migrations
pnpm db:deploy

# Apply auth triggers + storage policies
pnpm db:triggers
```

Copy environment files and fill in any missing values:

```bash
cp apps/mobile/.env.example apps/mobile/.env
cp apps/api/.env.local.example apps/api/.env.local
cp apps/worker/.env.example apps/worker/.env
```

Local defaults are pre-configured to work with `supabase start`.

## Running Locally

> **Before starting:** Make sure Docker Desktop is running. The local Supabase instance runs in Docker containers. If you haven't already, run `pnpm supabase:start` first (see Setup above).

You need three terminals — one for each service:

### 1. API (Next.js)

```bash
pnpm dev:api
```

Runs on http://localhost:3000

### 2. Worker (Express)

```bash
pnpm dev:worker
```

Runs on http://localhost:8080

### 3. Mobile (Expo — iOS Simulator)

The mobile app uses a **development build** (not Expo Go) so that all native modules work correctly.

**First time setup:**

```bash
cd apps/mobile
npx expo prebuild --platform ios --clean
npx expo run:ios
```

This generates the native iOS project and builds the app on the simulator. The first build takes a few minutes.

**Subsequent runs:**

```bash
cd apps/mobile
npx expo run:ios
```

If the app is already built and you just need to start the Metro bundler (e.g. after a restart):

```bash
cd apps/mobile
npx expo start --clear
```

Then press `i` to open on the iOS simulator.

Code changes hot-reload instantly. You only need to re-run `npx expo prebuild --platform ios --clean` when you:

- Add or remove a package with native code
- Change plugin config in `app.json`

## Project Structure

```
apps/
  mobile/     Expo React Native app
  api/        Next.js API (route handlers)
  worker/     Express service for video processing (Cloud Run)
packages/
  types/      Shared TypeScript types
prisma/       Database schema and migrations
sql/          Auth triggers and storage policies
```

## API Routes

| Method   | Path                              | Description                     |
| -------- | --------------------------------- | ------------------------------- |
| `GET`    | `/api/health`                     | Health check                    |
| `POST`   | `/api/process`                    | Trigger video processing        |
| `GET`    | `/api/videos`                     | List user's videos              |
| `GET`    | `/api/videos/:id`                 | Get video status & caption data |
| `POST`   | `/api/videos/:id/callback`        | Worker callback (status updates)|
| `POST`   | `/api/videos/:id/export`          | Trigger subtitle burn & export  |
| `PATCH`  | `/api/videos/:id/speech`          | Edit caption word text          |
| `POST`   | `/api/videos/:id/overlays`        | Add a text overlay              |
| `DELETE`  | `/api/videos/:id/overlays/:overlayId` | Remove an overlay          |

## Database

```bash
pnpm db:migrate    # Create a new migration (dev)
pnpm db:deploy     # Apply pending migrations
pnpm db:triggers   # Apply auth triggers + storage policies
pnpm db:studio     # Open Prisma Studio GUI
pnpm db:generate   # Regenerate Prisma client
```

## Environment Variables

### `apps/mobile/.env`

| Variable                        | Description            |
| ------------------------------- | ---------------------- |
| `EXPO_PUBLIC_SUPABASE_URL`      | Supabase project URL   |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key |
| `EXPO_PUBLIC_API_URL`           | Next.js API base URL   |

### `apps/api/.env.local`

| Variable                    | Description                   |
| --------------------------- | ----------------------------- |
| `DATABASE_URL`              | Postgres connection string    |
| `SUPABASE_URL`              | Supabase project URL          |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key     |
| `WORKER_URL`                | Cloud Run worker URL          |
| `WORKER_SECRET`             | Shared secret for worker auth |

### `apps/worker/.env`

| Variable                    | Description                      |
| --------------------------- | -------------------------------- |
| `API_URL`                   | Next.js API base URL             |
| `SUPABASE_URL`              | Supabase project URL             |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key        |
| `REPLICATE_API_TOKEN`       | Replicate API token for WhisperX |
| `WORKER_SECRET`             | Shared secret for API auth       |

## Docker (Worker)

```bash
docker build -t video-caption-worker apps/worker/
docker run -p 8080:8080 video-caption-worker
```

## Tech Stack

- **Mobile:** Expo 55, React Native, Expo Router, Supabase JS
- **API:** Next.js 16, Prisma 7, Supabase JS, Zod
- **Worker:** Express, WhisperX (via Replicate), fluent-ffmpeg, Supabase JS
- **Database:** PostgreSQL (Supabase), Prisma ORM
- **Infra:** pnpm workspaces, Docker, Cloud Run
