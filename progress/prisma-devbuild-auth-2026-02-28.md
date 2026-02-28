# Progress — 2026-02-28

## 1. Prisma Integration + API-Routed Mobile DB Access

Replaced all Supabase query builder (`supabase.from("videos")`) calls with Prisma ORM across API and Worker. Mobile now routes all DB operations through API endpoints instead of querying the database directly.

### What was built

**Prisma Schema & Config**
- `prisma/schema.prisma` — `User` and `Video` models with UUID PKs, foreign key, and composite index
- `prisma.config.ts` — Prisma 7 config using `defineConfig` and `@prisma/adapter-pg` driver adapter
- `prisma/migrations/0001_initial/migration.sql` — Initial migration created via `prisma migrate diff`
- Generated client outputs to `generated/prisma/` (shared across workspaces)

**Prisma Client Singletons**
- `apps/api/src/lib/prisma.ts` — globalThis pattern for Next.js hot reload
- `apps/worker/src/lib/prisma.ts` — eager init for long-running Express process

**New API Endpoints**
- `apps/api/src/lib/auth.ts` — extracted JWT validation helper using Supabase `auth.getUser()`
- `apps/api/src/app/api/videos/route.ts` — `GET /api/videos` (list user's videos)
- `apps/api/src/app/api/videos/[id]/route.ts` — `GET /api/videos/:id` (get video status/URL)

**Modified Files**
- `apps/api/src/app/api/process/route.ts` — uses auth helper + Prisma `video.create()` with P2002 duplicate handling
- `apps/worker/src/index.ts` — Prisma `video.update()` for completed/failed status (replaced Supabase queries)
- `apps/mobile/src/lib/api.ts` — added `listVideos()` and `getVideoStatus()` functions
- `apps/mobile/src/app/index.tsx` — uses API instead of direct Supabase DB access
- `apps/mobile/src/app/upload.tsx` — removed DB insert (API handles record creation server-side)
- `apps/mobile/src/app/status.tsx` — uses API for polling video status

**Build & Deploy Scripts**
- Root `package.json` — added `db:generate`, `db:migrate`, `db:push`, `db:studio`, `db:deploy`, `db:triggers`
- `build:worker` script copies prisma schema into worker before build
- Worker Dockerfile updated with `COPY prisma/` + `RUN npx prisma generate`

### Key Prisma 7 Learnings
- No `url` in schema datasource block — must use `prisma.config.ts` with `defineConfig`
- Generator uses `prisma-client` provider (not `prisma-client-js`)
- Requires `@prisma/adapter-pg` driver adapter in PrismaClient constructor
- `prisma migrate diff` uses `--to-schema` flag (not `--to-schema-datamodel`)
- `@prisma/engines` and `prisma` must be in `pnpm.onlyBuiltDependencies`

---

## 2. Local Supabase Development Environment

Set up full local development using Supabase CLI + Docker.

- Ran `supabase init` and `supabase start` for local Postgres, Auth, Storage
- Applied migrations via `prisma migrate deploy`
- Applied auth triggers and storage policies via `sql/after-prisma.sql`
- Created `videos` storage bucket with RLS policies for authenticated uploads and public reads
- Updated all workspace `.env` files to point at local Supabase (ports 54321/54322)
- Added `supabase:start` and `supabase:stop` convenience scripts

---

## 3. Mobile Auth Flow

- Added email/password auth (alongside magic links) for local development
- `apps/mobile/src/lib/auth.tsx` — `signIn()` tries `signInWithPassword`, falls back to `signUp`
- `apps/mobile/src/app/login.tsx` — email + password fields
- `apps/mobile/src/lib/supabase.ts` — added `AsyncStorage` for session persistence across reloads
- Installed `@react-native-async-storage/async-storage`

---

## 4. Switched to Expo Development Build

Expo Go had native module version mismatches (`expo-video` constructor args, `expo-image-picker` missing symbols). Switched to a development build where native modules compile from actual `node_modules`.

### What was done
- Added `ios.bundleIdentifier` (`com.videocaptionapp.mobile`) and `NSPhotoLibraryUsageDescription` to `app.json`
- Installed `expo-dev-client`
- Updated `expo-image-picker` from `~16.1.4` to `~55.0.10` (fixed `EXFatal`/`EXErrorWithMessage` missing symbols)
- Ran `npx expo prebuild --platform ios --clean` + `npx expo run:ios`
- Restored `expo-video` `VideoView` in `status.tsx` (replaced `Linking.openURL` workaround)

### Mobile Upload Fix
- Replaced `fetch(asset.uri).blob()` with `FormData` approach for Supabase storage upload (React Native `Blob` constructor was failing)
- Replaced `crypto.randomUUID()` with inline UUID generator (not available in React Native)

---

## 5. UI Improvements
- Added "Back to Videos" button on the upload screen
- Video list on home screen fetches from API with status indicators

---

## 6. Documentation
- Updated `README.md` with full local development setup
- Documented dev build commands: `npx expo prebuild --platform ios --clean`, `npx expo run:ios`, `npx expo start --clear`
- Documented all environment variables, database commands, and project structure

---

## Current State

| Component | Status |
|-----------|--------|
| Prisma schema + migrations | Working |
| API endpoints (videos, process) | Working |
| Worker (Prisma updates) | Working |
| Mobile → API routing | Working |
| Local Supabase | Running |
| Dev build (iOS simulator) | Working |
| Auth (email/password + session persistence) | Working |
| Video upload (FormData) | Working |
| Video status polling | Working |
| Video playback (expo-video) | Restored, untested with dev build |

### Still TODO
- End-to-end test of full upload → process → playback flow
- Production environment setup (Vercel for API, Cloud Run for Worker, EAS for mobile)
- CI/CD pipeline expansion (currently only deploys database)
- `.env.production.example` files for documentation
