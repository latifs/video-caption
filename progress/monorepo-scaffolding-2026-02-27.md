# Progress — 2026-02-27

## 1. Monorepo Scaffolding Complete

Set up the foundational pnpm workspace monorepo with 4 workspaces.

### What was built

**Root configuration**
- `pnpm-workspace.yaml` defining `apps/*` and `packages/*`
- `.npmrc` with `node-linker=hoisted` for React Native compatibility
- Root `package.json` with filter scripts (`dev:mobile`, `dev:api`, `dev:worker`, `build:worker`)
- `.gitignore`, `git init`

**`apps/mobile`** — Expo 55 + Expo Router
- Scaffolded with `create-expo-app`, cleaned out all demo content (tabs, components, constants, demo images)
- Simplified to Stack navigator with two screens: Home (`index.tsx`) and Upload (`upload.tsx`)
- Added Supabase client scaffold and placeholder `processVideo()` in `src/lib/`
- Added `expo-image-picker`, `expo-av`, `@supabase/supabase-js`, `axios`, workspace `types` dep
- Removed demo deps (`expo-blur`, `expo-font`, `expo-haptics`, `expo-symbols`, `expo-web-browser`, etc.)

**`apps/api`** — Next.js 16 App Router
- Scaffolded with `create-next-app`, cleaned out demo page, CSS, fonts, public assets
- Created route handlers: `GET /api/health` → `{ status: "ok" }`, `POST /api/process` → 501
- Supabase client scaffold and placeholder `callWorker()` in `src/lib/`
- Added `@supabase/supabase-js`, `axios`, `zod`, workspace `types` dep

**`apps/worker`** — Express for Google Cloud Run
- Created from scratch (no scaffolding tool)
- Express server bound to `0.0.0.0:PORT` with `POST /process` endpoint
- `tsconfig.json`: CommonJS, ES2020, strict, outDir `dist/`
- Dockerfile: `node:20-slim`, npm install, tsc build, runs compiled JS
- Dependencies: `express`, `openai`, `fluent-ffmpeg`, `ffmpeg-static`, `@supabase/supabase-js`, `dotenv`

**`packages/types`** — Shared TypeScript types
- `ProcessVideoRequest` interface and `VideoStatus` union type
- Raw `.ts` source with no build step (consumers use bundlers)

**Documentation**
- `README.md` with structure, commands, env var reference
- `CLAUDE.md` for Claude Code context

### Verification results

| Check | Result |
|-------|--------|
| `pnpm install` | 822 packages, all 5 workspaces resolved |
| `pnpm --filter worker build` | tsc compiles cleanly |
| `pnpm --filter api build` | Next.js build succeeds, routes registered |
| `pnpm dev:worker` + `curl POST /process` | `{"message":"Cloud Run worker ready"}` |
| `pnpm dev:api` + `curl GET /api/health` | `{"status":"ok"}` |
| `docker build -t video-caption-worker apps/worker/` | Image built successfully |
| `docker run -p 8080:8080` + `curl POST /process` | `{"message":"Cloud Run worker ready"}` |

### Notes
- Expo scaffold uses `src/` directory structure (not root `app/`); tsconfig paths configured accordingly
- Worker is self-contained (no workspace dep on `types`) to keep Docker builds simple
- Fixed `PORT` type error in worker (`Number(process.env.PORT)` needed for strict TS)
- `pnpm.onlyBuiltDependencies` added to root `package.json` for `ffmpeg-static` and `sharp`
