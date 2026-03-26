# UI, Timeline & Overlay Fixes

**Date:** 2026-03-26

---

## 1. Re-export button moved to video overlay

**Problem:** The "Re-export Video" button occupied a full-width pinned bar at the bottom of the screen, taking up significant real estate.

**Fix:** Moved the button to an absolute overlay at `top-[50px] right-3` inside the video, aligned with the existing back button. The pinned bottom bar was removed entirely.

**File:** `apps/mobile/src/app/status.tsx` — `CaptionedVideo` component

---

## 2. Style picker cards no longer stretch vertically

**Problem:** The Classic/Outline style picker cards were stretching to fill the full vertical space of the horizontal `ScrollView`, making them disproportionately tall.

**Fix:** Added explicit `className="h-14 flex-none"` to the `ScrollView` and `alignItems: 'center'` to `contentContainerStyle`. This constrains the ScrollView to a fixed height and lets the `CaptionEditor` below take up the remaining space.

**File:** `apps/mobile/src/app/status.tsx`

---

## 3. VS Code JSX error resolved

**Problem:** VS Code showed "Cannot use JSX unless '--jsx' flag is provided" across all mobile files because it was using the built-in TypeScript instead of the workspace version (5.9.3), which can't parse newer `tsconfig` features (`${configDir}`, `module: "preserve"`).

**Fix:** Created `.vscode/settings.json` pointing VS Code to the workspace TypeScript:

```json
{
  "typescript.tsdk": "node_modules/typescript/lib",
  "typescript.enablePromptUseWorkspaceTsdk": true
}
```

Users must also run "TypeScript: Select TypeScript Version → Use Workspace Version" once in VS Code.

**File:** `.vscode/settings.json` (new file)

---

## 4. Navigation context crash on overlay chip interaction (PanResponder → Pressable)

**Problem:** Clicking or long-pressing overlay chips in `CaptionEditor` triggered a "Couldn't find navigation context" Render Error intermittently. Root cause: React Native 0.83 (Fabric/New Architecture) fires `PanResponder` callbacks synchronously outside React's event batching, causing renders to execute without the navigation context provider. Various workarounds (`setTimeout`, deferred state updates) reduced but did not eliminate the crash.

**Fix:** Replaced the entire `PanResponder`-based overlay chip implementation with `Pressable` (same pattern used by word chips, which never crash). This removed:
- `dragging` state
- `isDraggingChip`, `longPressTimer`, `currentDragDx`, `draggingRef` refs
- `createChipPanResponder` useCallback
- `GestureResponderEvent` / `PanResponderGestureState` type imports
- `scrollEnabled={dragging === null}` from the `ScrollView`
- `PanResponder` import

The drag-to-reposition feature on overlay chips was intentionally removed in favour of reliability. Overlay chips now use `onPress` to seek and `onLongPress` to open the edit modal.

**File:** `apps/mobile/src/components/CaptionEditor.tsx`

---

## 5. Modal → Portal replacement (navigation context safety)

**Problem:** `EditWordModal` and `OverlayModal` used React Native's `Modal`, which in Fabric (New Architecture) can fail to propagate React Navigation context, causing crashes.

**Fix:** Replaced `Modal` with `Portal` from `@rn-primitives/portal` in both components. Portals render through React's portal mechanism (context-safe). Key changes:
- `if (!visible) return null` / `if (state === null) return null` guards replace the `visible` prop
- `StyleSheet.absoluteFill` used for the backdrop view
- `name` prop required by `@rn-primitives/portal` (added as `"edit-word-modal"` and `"overlay-modal"`)

**Files:**
- `apps/mobile/src/components/EditWordModal.tsx`
- `apps/mobile/src/components/OverlayModal.tsx`

---

## 6. Overlay and caption chips share identical styling

**Problem:** Overlay chips in the timeline had a visually distinct style (bordered box, `bg-primary-muted`, `text-xs font-semibold text-primary`) compared to caption word chips.

**Fix:** Overlay chips now use the identical className as word chips: `rounded bg-black/[0.05] dark:bg-white/[0.08] px-1.5 py-1` with `bg-primary` / `text-white` when active, `text-base text-foreground` text.

**File:** `apps/mobile/src/components/CaptionEditor.tsx`

---

## 7. Overlay caption position moved to top of video

**Problem:** Newly created overlays defaulted to `position.y: 0.9` (90% down the video — near the bottom), overlapping with the speech captions.

**Fix:** Changed the default `position.y` from `0.9` to `0.1` so new overlays appear near the top of the video.

**File:** `apps/api/src/app/api/videos/[id]/overlays/route.ts`

---

## 8. Timeline chips stretch proportionally to their duration

**Problem:** Both caption word chips and overlay chips in the `CaptionEditor` timeline only took as much width as their text content. A word spanning 8 seconds looked identical in size to one spanning 0.2 seconds, making the timeline a poor representation of time.

### Caption word chips

Added `minWidth: Math.min(fw.end - fw.start, MAX_WORD_DURATION_S) * PX_PER_SECOND` to each word `Pressable`. The `MAX_WORD_DURATION_S = 0.8` cap matches the existing `gapWidths` computation, so there is no double-counting: the chip spans `[start … cappedEnd]` and the gap view spans `[cappedEnd … nextStart]`.

### Overlay chips

Replaced the nearest-word-snap `getOverlayLeftPos` with direct `timeToX` calls for both position and width:

```typescript
const startX = timeToX(overlay.start) ?? getOverlayLeftPos(overlay);
const endX   = timeToX(overlay.end)   ?? startX;
const chipWidth = Math.max(endX - startX, 0);
```

### Leading spacer

Added a spacer view before the first word (`width = firstWord.start * PX_PER_SECOND`) and a `{ x: 0, time: 0 }` anchor in `anchorPoints()` so that `timeToX(0)` correctly maps to `x=0` rather than clamping to the first word's position. Without this, overlays starting at `t=0` appeared at the same position as the first spoken word.

### TypeScript fix

`submitOverlayModal` was destructuring `overlayId` from the `OverlayModalState` union, which TypeScript correctly flagged since `overlayId` only exists on the `'edit'` variant. Fixed with a narrowing assignment:

```typescript
const { mode, text, startText, endText } = overlayModal;
const overlayId = overlayModal.mode === 'edit' ? overlayModal.overlayId : undefined;
```

**File:** `apps/mobile/src/components/CaptionEditor.tsx`

---

## 9. Tap video to toggle play/pause

**Problem:** Tapping the video only showed/hid the playback controls; it did not control playback.

**Fix:** Added `togglePlay()` to `handleTap` so a single tap toggles play/pause while also showing the controls briefly (auto-hide after 3s).

**File:** `apps/mobile/src/app/status.tsx` — `CaptionedVideo` component

---

## 10. Overlay font size scales with video resolution in export

**Problem:** The exported video showed overlay text dramatically smaller than the preview. `drawOverlays()` in the worker used `overlay.style.fontSize` (default: `24`) directly as canvas pixels, with no scaling to actual video resolution.

At 1080p portrait (height=1920px): `24px / 1920px = 1.25%` of height.
In the mobile preview: `24pt / 554pt container = 4.3%` of height — roughly 3× larger.

A first fix attempted `scaleRef = shortEdge / 720` (giving 36px at 1080p) but was insufficient because it doesn't account for the `33/16` factor that `computeLayout()` uses to convert from React Native `text-base` (16pt) to canvas pixels.

**Final fix:** Scale the overlay fontSize using the same proportional relationship as `computeLayout()`:

```typescript
const captionFontSize = Math.round((Math.min(videoWidth, videoHeight) * 33) / 720);
const fontSize = Math.round(overlay.style.fontSize * captionFontSize / 16);
```

This preserves the visual ratio between overlay and caption sizes across all resolutions:

| Resolution | Caption px | Overlay px (fontSize=24) |
|---|---|---|
| 720p | 33 | 50 |
| 1080p portrait (shortEdge=1080) | 50 | 75 |
| 4K portrait (shortEdge=2160) | 99 | 149 |

All downstream values (`paddingH`, `paddingV`, `borderRadius`, `lineHeight`, `maxTextWidth`) derive from `fontSize` and scale automatically.

**File:** `apps/worker/src/lib/caption-canvas.ts` — `drawOverlays()`
