# App Store / Play Store Submission - Issues to Fix

## CRITICAL (Will cause rejection)

### 1. Hardcoded localhost URLs in `.env`

**Location:** `apps/mobile/.env`

The `.env` file points to local dev servers:

- `EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`
- `EXPO_PUBLIC_API_URL=http://localhost:3000`

The app will crash with "connection refused" for any user who installs it from a store. Need production URLs and a proper env management strategy per build profile (dev, staging, production).

---

### 2. Unused permissions declared in Info.plist

**Location:** `apps/mobile/ios/videocaptionapp/Info.plist` (lines 58-62)

`NSCameraUsageDescription` and `NSMicrophoneUsageDescription` are declared but the app never uses the camera or microphone — it only picks videos from the photo library via `expo-image-picker` (`launchImageLibraryAsync`). Apple explicitly rejects apps that request permissions they don't use.

**Fix:** Remove both `NSCameraUsageDescription` and `NSMicrophoneUsageDescription` from Info.plist.

---

## HIGH (Required before submission)

### 3. No account deletion feature

**Requirement:** Apple App Store Review Guidelines 5.1.1

The app has sign-out functionality but no account deletion option anywhere. Apple requires apps with account creation to offer account deletion. Need to implement:

- Account deletion UI (button in settings or profile)
- API endpoint to handle account deletion
- Confirmation dialog before deletion
- Data cleanup (videos, storage, database records)

---

### 4. No privacy policy URL

**Requirement:** Both App Store and Play Store

Both stores require a publicly accessible privacy policy URL. Nothing is configured in `app.json` and no link exists in the app UI.

**Fix:**

- Write and host a privacy policy document
- Add `privacyPolicy` URL to `app.json` under `ios` and `android` config
- Add a link to the privacy policy in the app UI (e.g., login screen or settings)

---

### 5. Missing EAS build configuration

**Location:** No `eas.json` file exists in the project

Cannot produce App Store / Play Store builds without EAS configuration. Need to create `eas.json` with:

- `development` profile (for dev client builds)
- `preview` profile (for internal testing)
- `production` profile with iOS archive and Android release build types
- `submit` configuration with App Store Connect and Play Store credentials

---

### 6. Incomplete app metadata in `app.json`

**Location:** `apps/mobile/app.json`

Missing fields:

- `description` — required for store listings
- `android.versionCode` — required by Play Store, must increment with each upload
- iOS `buildNumber` — required for multiple builds of the same version
- Privacy policy URL
- Support/feedback URL or email
- App name is too technical (`"video-caption-app"`) — needs a user-friendly name

---

### 7. No Android adaptive icon

**Location:** `apps/mobile/app.json`

Only a single `icon.png` is referenced. Android 8+ requires adaptive icons with separate foreground and background layers. Google Play will flag this.

**Fix:** Add `android.adaptiveIcon` config to `app.json` with:

- `foregroundImage` — icon foreground layer (PNG with transparency)
- `backgroundColor` — background color or `backgroundImage`

---

## MEDIUM (Should fix before submission)

### 8. `expo-dev-client` in production dependencies

**Location:** `apps/mobile/package.json` (line 20)

`expo-dev-client` is listed in `dependencies` instead of `devDependencies`. This adds ~2MB of unnecessary dev-only code to store builds.

**Fix:** Move `expo-dev-client` to `devDependencies`.

---

### 9. Placeholder permission descriptions

**Location:** `apps/mobile/ios/videocaptionapp/Info.plist`

Camera and microphone permission descriptions use `$(PRODUCT_NAME)` macro which may not expand properly in all build scenarios, potentially showing raw text like `"Allow $(PRODUCT_NAME) to access your camera"` to users.

**Note:** This becomes moot if issue #2 is fixed (removing these unused permissions entirely).

---

### 10. `NSAllowsLocalNetworking: true` in Info.plist

**Location:** `apps/mobile/ios/videocaptionapp/Info.plist`

This App Transport Security exception is for dev client use only. Apple may flag it in a production build as it weakens network security. Should be removed or made conditional per build profile.

---

### 11. No error boundary or crash reporting

**Locations:**

- `apps/mobile/src/app/status.tsx:48` — silent `console.error`
- `apps/mobile/src/app/index.tsx:25` — unhandled error logging to console only

No crash reporting service (Sentry, Bugsnag, etc.) is integrated. Errors fail silently with no user feedback. In production, you won't know when the app crashes or encounters errors.

**Fix:**

- Add a React error boundary component
- Integrate a crash reporting service
- Replace `console.error` calls with user-facing error notifications

---

## LOW (Recommended improvements)

### 12. Generic bundle identifier

**Location:** `app.json` and Info.plist

Current bundle ID is `com.videocaptionapp.mobile` which is generic. Should use your company's reverse domain notation (e.g., `com.yourcompany.videocaption`).

---

### 13. Console statements in production code

**Locations:**

- `apps/mobile/src/app/status.tsx:48` — `console.error("Failed to poll status:", error)`
- `apps/mobile/src/app/index.tsx:25` — `.catch(console.error)`

Console statements should be removed or replaced with proper logging for production builds.

---

### 14. No terms of service

Neither a terms of service document nor a link to one exists in the app. While not strictly required by all store categories, it is strongly recommended and may be required depending on your app's functionality (e.g., user-generated content).

---

### 15. Test file inlines production logic instead of importing it

**Location:** `apps/mobile/src/__tests__/caption-utils.test.ts`

The test file copy-pastes `findActiveSegment`, `findActiveWordIndex`, and `findActiveOverlays` instead of importing them from `src/lib/caption-utils.ts`. This means the test suite can pass even if the production code regresses.

The workaround exists because Vitest can't resolve React Native / `types` package transitive dependencies during test runs.

**Fix:** Configure Vitest path aliases to handle `types` module resolution, then replace the inlined functions with direct imports from `@/lib/caption-utils`.
