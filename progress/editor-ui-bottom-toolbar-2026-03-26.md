# Editor UI — Bottom Toolbar & Video Layout Overhaul
**Date:** 2026-03-26

## Overview
Replaced the scattered in-line controls (toggle pill, style picker, export button) with a cohesive bottom toolbar. Each icon opens a bottom sheet, establishing an extensible pattern for future toolbar actions. Simultaneously improved the video container layout to fill the full width at native aspect ratio, and added a smooth "edit mode" that shrinks the video to reveal the caption editor.

---

## New Files

### `apps/mobile/src/components/BottomSheet.tsx`
Reusable bottom sheet component extracted from the `AddVideoSheet` pattern. Uses `react-native-reanimated` (`withTiming`, `interpolate`, `useSharedValue`) to slide up from the bottom with a dimmed backdrop. Props: `visible`, `onClose`, `title`, `children`.

---

## Modified Files

### `apps/mobile/src/lib/icons.ts`
Added and registered the following lucide icons with `cssInterop`:
- `Eye` — Views sheet trigger
- `Palette` — Styles sheet trigger
- `PenLine` — Edit mode toggle
- `Download` — Export sheet trigger

### `apps/mobile/src/components/CaptionOverlay.tsx`
- Added `scale` prop: multiplies all font sizes (speech captions and overlay text) proportionally when the video is in compact mode.
- Added `insetX` / `insetY` props: constrains the overlay root view to the actual displayed video frame, preventing caption text from bleeding into letterbox bars when the compact container aspect ratio doesn't match the video's native aspect ratio.

### `apps/mobile/src/app/status.tsx`

#### `CaptionedVideo` component
- **Dynamic container height**: replaced hardcoded `65% screen height` with `screenWidth × (naturalHeight / naturalWidth)`, populated via the `videoSizeChange` player event. Falls back to `screenWidth × (16/9)` until metadata loads.
- **`contentFit="contain"`**: kept to avoid cropping; container is now exactly sized to the video's aspect ratio so no letterbox bars appear in full mode.
- **Animated height (edit mode)**: container is now `Animated.View` driven by an `Animated.Value`. Smoothly animates between `containerHeight` (full) and `compactHeight` (`screenHeight − topInset − 260`) in 300 ms when `compact` prop changes.
- **`compact` / `onToggleCompact` props**: tapping the video in compact mode calls `onToggleCompact` to restore full size instead of toggling play.
- **`topInset` prop**: passed from `StatusScreen` via `useSafeAreaInsets` so compact height accounts for the Dynamic Island / notch.
- **Letterbox inset calculation**: before rendering `CaptionOverlay`, computes `overlayInsetX`/`overlayInsetY` based on the current container height vs. the video's natural aspect ratio, and passes them as props.
- **Removed** `onExport`, `exporting`, `hasExport` props and the Re-export button from the video overlay.
- **Removed** the fullscreen toggle button from normal view (kept only as an exit button while in fullscreen).
- **Moved** Back and Re-export buttons from `top-[50px]` to `top-3` to sit below the notch.
- **Safe area top padding**: `paddingTop: insets.top` applied to the outer screen `View` so the video starts below the Dynamic Island.

#### `StatusScreen` component
**Removed:**
- Toggle pill (Preview / Exported)
- Horizontal style picker `ScrollView`

**Added state:**
- `isEditMode` — drives compact video + CaptionEditor visibility
- `exportSheetOpen`, `viewsSheetOpen`, `stylesSheetOpen` — control bottom sheets

**Bottom toolbar** (`flex-row`, `paddingVertical: 10`, `border-t`):
| Icon | Action |
|------|--------|
| `Eye` | Opens Views sheet (Preview / Exported) |
| `PenLine` | Toggles edit mode; highlights when active |
| `Palette` | Opens Styles sheet |
| `Download` | Opens Export confirmation sheet |

**Bottom sheets (all use `BottomSheet` component):**
- **Views sheet** — Preview / Exported rows with checkmark; Exported row greyed out until a processed URL exists.
- **Styles sheet** — One row per `CAPTION_STYLES` entry with active-word color swatch + checkmark.
- **Export sheet** — Shows active style swatch + name; confirm button triggers `handleExport` and closes the sheet. Title changes to "Re-export Video" when a processed URL already exists.

**CaptionEditor** now only renders when `isEditMode && !showExported && captionData && session`.

---

## Behaviour Summary

| State | Video | CaptionEditor | Toolbar |
|-------|-------|---------------|---------|
| Default | Full natural height | Hidden | PenLine inactive |
| Edit mode | Shrunk (`screenH − insets.top − 260`) | Visible | PenLine highlighted |
| Tap shrunk video | Animates back to full | Hidden | PenLine inactive |
| Exported view | Full / shrunk (unchanged) | Hidden | Views sheet shows "Exported" checked |
