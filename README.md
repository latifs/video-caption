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

| Method   | Path                                  | Description                      |
| -------- | ------------------------------------- | -------------------------------- |
| `GET`    | `/api/health`                         | Health check                     |
| `POST`   | `/api/process`                        | Trigger video processing         |
| `GET`    | `/api/videos`                         | List user's videos               |
| `GET`    | `/api/videos/:id`                     | Get video status & caption data  |
| `POST`   | `/api/videos/:id/callback`            | Worker callback (status updates) |
| `POST`   | `/api/videos/:id/export`              | Trigger subtitle burn & export   |
| `PATCH`  | `/api/videos/:id/speech`              | Edit caption word text           |
| `POST`   | `/api/videos/:id/overlays`            | Add a text overlay               |
| `DELETE` | `/api/videos/:id/overlays/:overlayId` | Remove an overlay                |

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

## Deployment

The app deploys automatically when code is merged to `main`:

- **API** deploys to **Vercel** via its native GitHub integration (no GitHub Action needed)
- **Worker** deploys to **Google Cloud Run** via GitHub Actions
- **Database migrations** run via GitHub Actions before the worker deploys

```
Push/merge to main
        |
        +-- GitHub Actions --> [migrate] --> [deploy-worker]
        |                       run SQL       docker build
        |                       migrations    push to Artifact Registry
        |                                     deploy to Cloud Run
        |
        +-- Vercel (independent) --> pnpm install
                                     prisma generate
                                     next build
                                     deploy to edge
```

### One-Time Setup

#### 1. Google Cloud Platform (GCP)

You need a GCP project with the following configured:

**Enable APIs:**

- Go to `https://console.cloud.google.com/apis/library` and enable:
  - **Cloud Run Admin API**
  - **Artifact Registry API**

**Create an Artifact Registry repository** (stores Docker images):

- Go to `https://console.cloud.google.com/artifacts`
- Click "Create Repository"
- Name: `video-caption-app`
- Format: Docker
- Region: `us-central1` (or your preferred region)

**Create a service account** (used by GitHub Actions to deploy):

- Go to `https://console.cloud.google.com/iam-admin/serviceaccounts`
- Click "Create Service Account"
- Name: `github-deploy`
- Grant these roles:
  - `Cloud Run Admin` — deploy and manage Cloud Run services
  - `Artifact Registry Writer` — push Docker images
  - `Service Account User` — act as the Cloud Run service account
- After creation, click into the service account → **Keys** tab → **Add Key** → **Create new key** → **JSON**
- Download the JSON key file (you'll paste its entire contents as a GitHub secret)

#### 2. Vercel

- Go to `https://vercel.com/new` and import the GitHub repository
- Set **Root Directory** to `apps/api`
- Under **Settings → build and deployment**, enable **"Include source files outside of the Root Directory"** (required because the Prisma schema lives at the repo root)
- Set **Production Branch** to `main`
- Add these environment variables in **Settings → Environment Variables**:

| Variable                    | Value                                                                                  |
| --------------------------- | -------------------------------------------------------------------------------------- |
| `DATABASE_URL`              | Supabase Postgres connection string (use **Session Pooler** — required for serverless) |
| `SUPABASE_URL`              | Supabase project URL (e.g. `https://xxx.supabase.co`)                                  |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key                                                              |
| `WORKER_URL`                | Cloud Run worker URL (available after first worker deploy)                             |
| `WORKER_SECRET`             | Shared secret for API ↔ Worker authentication                                          |

> **Important:** For `DATABASE_URL`, use the **Session Pooler** connection method from Supabase (not Direct Connection). Vercel runs on serverless infrastructure and uses IPv4 — the direct connection won't work. You can find the Session Pooler URL in your Supabase dashboard under **Settings → Database → Connection String → Session Pooler**.

#### 3. GitHub Secrets and Variables

Go to your repository's **Settings → Secrets and variables → Actions**.

**Repository Secrets** (Settings → Secrets → Actions → New repository secret):

| Secret                      | Description                                              |
| --------------------------- | -------------------------------------------------------- |
| `DATABASE_URL`              | Supabase Postgres connection string (Session Pooler)     |
| `POSTGRES_URL`              | Same as `DATABASE_URL` (used by migration script)        |
| `GCP_SA_KEY`                | Entire contents of the GCP service account JSON key file |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key                                |
| `WORKER_SECRET`             | Shared secret for API ↔ Worker authentication            |
| `REPLICATE_API_TOKEN`       | Replicate API token (for WhisperX transcription)         |

**Repository Variables** (Settings → Variables → Actions → New repository variable):

| Variable         | Description                                | Example                       |
| ---------------- | ------------------------------------------ | ----------------------------- |
| `GCP_PROJECT_ID` | Your GCP project ID                        | `video-caption-490419`        |
| `GCP_REGION`     | Region for Cloud Run and Artifact Registry | `us-central1`                 |
| `API_URL`        | Vercel production URL for the API          | `https://your-app.vercel.app` |
| `SUPABASE_URL`   | Supabase project URL                       | `https://xxx.supabase.co`     |

### How It Works

**API (Vercel):**
Vercel detects pushes to `main` automatically. It runs the `vercel-build` script in `apps/api/package.json`, which runs `prisma generate` (from the repo root, where the schema lives) then `next build`. No GitHub Action needed.

**Worker (GitHub Actions):**
The `.github/workflows/deploy.yml` workflow has two jobs:

1. **`migrate`** — Checks out the code, installs dependencies, and runs database migrations via `node sql/run-sql.mjs deploy`
2. **`deploy-worker`** — Runs after `migrate` completes. Authenticates to GCP, builds the worker Docker image, pushes it to Artifact Registry, and deploys it to Cloud Run with all required environment variables

### Verifying a Deployment

After merging to `main`:

1. **GitHub Actions** — Check the Actions tab for the `Deploy` workflow. The `migrate` job should complete first, then `deploy-worker`
2. **Vercel** — Check the Vercel dashboard for a successful deployment
3. **Worker health check** — Hit the Cloud Run worker URL at `/process` — should return 401 (auth is working)
4. **API health check** — Hit the Vercel API URL at `/api/health` — should return 200
5. **End-to-end** — Upload a video from the mobile app and verify transcription + export work through the deployed services

## Tech Stack

- **Mobile:** Expo 55, React Native, Expo Router, Supabase JS
- **API:** Next.js 16, Prisma 7, Supabase JS, Zod
- **Worker:** Express, WhisperX (via Replicate), fluent-ffmpeg, Supabase JS
- **Database:** PostgreSQL (Supabase), Prisma ORM
- **Infra:** pnpm workspaces, Docker, Cloud Run
