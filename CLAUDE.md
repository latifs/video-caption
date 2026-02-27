# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Dev Commands

```bash
# Install all dependencies (from repo root)
pnpm install

# Development servers
pnpm dev:mobile        # Expo (mobile app)
pnpm dev:api           # Next.js on port 3000
pnpm dev:worker        # Express on port 8080 (via ts-node)

# Building
pnpm build:worker      # tsc → apps/worker/dist/
pnpm --filter api build

# Typecheck individual workspaces
pnpm --filter worker build   # worker uses tsc, so build = typecheck
pnpm --filter api build      # Next.js typechecks during build

# Docker (worker only)
docker build -t video-caption-worker apps/worker/
docker run -p 8080:8080 video-caption-worker
```

No test framework or linter is configured yet.

## Architecture

**pnpm monorepo** with 4 workspaces. `.npmrc` sets `node-linker=hoisted` (required for React Native/Expo compatibility).

### Data flow

```
Mobile (Expo) → API (Next.js) → Worker (Express on Cloud Run)
       ↕              ↕                ↕
              Supabase (auth, storage, database)
```

- **Mobile** uses Supabase anon key (`EXPO_PUBLIC_` env vars)
- **API** uses Supabase service role key, orchestrates processing
- **Worker** uses Supabase service role key, OpenAI, ffmpeg
- API and Worker authenticate with a shared `WORKER_SECRET`

### Workspaces

| Workspace | Name | Path | Module System |
|-----------|------|------|---------------|
| Mobile | `mobile` | `apps/mobile/` | ESM (Metro bundler) |
| API | `api` | `apps/api/` | ESM (Next.js bundler) |
| Worker | `worker` | `apps/worker/` | CommonJS (ES2020 target) |
| Types | `types` | `packages/types/` | Raw .ts source, no build |

### Shared types

`packages/types` exports raw `.ts` files (no compilation step). All consumers use bundlers that handle `.ts` imports directly. Mobile and API depend on it via `"types": "workspace:*"`. Worker does **not** depend on it (kept self-contained for Docker builds).

### Key paths

- **Mobile screens:** `apps/mobile/src/app/` (Expo Router file-based routing)
- **API routes:** `apps/api/src/app/api/` (Next.js App Router handlers)
- **Worker entry:** `apps/worker/src/index.ts` (Express, binds `0.0.0.0:PORT`)
- **Supabase clients:** `apps/mobile/src/lib/supabase.ts`, `apps/api/src/lib/supabase.ts`
- **Path aliases:** `@/*` → `./src/*` in both mobile and API

### Worker / Cloud Run specifics

- Must bind to `0.0.0.0` on `process.env.PORT` (default 8080)
- Dockerfile uses `npm` (not pnpm) — self-contained, no workspace deps
- TypeScript compiled inside container; production runs compiled JS only
- `ts-node` for local dev, `tsc` + `node dist/` for production
