# Caption Export Rendering — Canvas-based Pipeline

**Date:** 2026-03-24

## Problem

The exported video captions did not match the in-app preview. Specifically:

- **Background was fully opaque** in the export, even though the preview showed a clearly semi-transparent `rgba(0,0,0,0.5)` background
- **Padding was too tight** around the text in the export
- **Font size was slightly off** between preview and export

All of these were caused by using two fundamentally different rendering engines:

| | Preview | Export (before fix) |
|---|---|---|
| Renderer | React Native layout engine | libass inside ffmpeg |
| Background opacity | `rgba(0,0,0,0.5)` (50%) | Fully opaque (libass ignores `BackColour` alpha for `BorderStyle: 3`) |
| Padding | `px-3 py-1.5` Tailwind | `outline: 2` in ASS (static, unscaled) |
| Font | System font, `text-base` | Arial via libass |

No amount of ASS parameter tuning could reliably fix this — libass silently ignores the alpha channel of `BackColour` when using `BorderStyle: 3` (opaque box mode).

## Solution

Replaced the ASS subtitle pipeline entirely with a **canvas-based PNG frame rendering** approach:

1. For each unique caption state (one per word event), render a transparent PNG using `@napi-rs/canvas` (Skia) with the exact same visual parameters as the mobile `CaptionOverlay` component.
2. Write an ffconcat list file that sequences the PNGs with their display durations.
3. Use ffmpeg's concat demuxer + overlay filter to composite the PNG sequence onto the source video.

### Visual parameters matched exactly to `CaptionOverlay.tsx`

| Parameter | Value |
|---|---|
| Background | `rgba(0,0,0,0.5)` |
| Text color | `#ffffff` |
| Active word color | `#FFD700` (gold) |
| Font weight | normal |
| Padding (horizontal) | `fontSize * 0.75` — matches `px-3 / text-base` ratio |
| Padding (vertical) | `fontSize * 0.375` — matches `py-1.5 / text-base` ratio |
| Border radius | `fontSize * 0.25` — matches Tailwind `rounded` |
| Position | Bottom 10% of video height, horizontally centered |
| Font size | `Math.round(shortEdge * 33 / 720)` — scales with video resolution |

### ffmpeg composite command

```
ffmpeg -i source.mp4
  -f concat -safe 0 -i captions.txt
  -filter_complex "[1:v]format=rgba[cap];[0:v][cap]overlay=eof_action=pass[out]"
  -map [out] -map 0:a?
  -c:v libx264 -c:a copy
  output.mp4
```

- `format=rgba` — preserves PNG transparency for correct alpha compositing
- `overlay=eof_action=pass` — after the last caption frame, the source video passes through unmodified (fixing a bug where the video image froze at the last spoken word)
- `-map 0:a?` — optional audio map (handles videos with no audio track)

### Files changed

| File | Change |
|---|---|
| `apps/worker/src/lib/caption-canvas.ts` | **New file** — canvas rendering, frame generation, ffconcat list writing |
| `apps/worker/src/lib/ffmpeg.ts` | Added `burnCaptionFrames()` using `execFile` with the concat + overlay command |
| `apps/worker/src/index.ts` | Swapped ASS pipeline (`captionDataToAss` + `burnSubtitles`) for canvas pipeline (`generateCaptionFrames` + `burnCaptionFrames`) |
| `apps/worker/package.json` | Added `@napi-rs/canvas` dependency |
| `apps/worker/Dockerfile` | Added `fontconfig` to apt deps (lets Skia resolve `Arial` → Liberation Sans on Linux) |

### Why `@napi-rs/canvas`

Uses a bundled Skia binary — no system library dependencies (unlike the `canvas` package which requires Cairo). Pre-built for `linux-x64` (Cloud Run), `darwin-arm64`, and `darwin-x64` (local dev).

## Additional fixes in this session

- **`eof_action=pass`** instead of `shortest=1` — prevents video from freezing on the last caption frame when the video continues past the last spoken word
- **`textBaseline = 'middle'`** — Skia's `'top'` baseline includes internal font leading that shifts glyphs below the intended position, causing text to appear at the bottom of the background box; `'middle'` centers the glyphs reliably
- **Button text colors** — fixed several buttons with `bg-primary` using `text-foreground` (dark) instead of `text-primary-foreground` (light), making text unreadable on the dark green button background

## Post-merge fixes (Copilot PR review)

### overlayTrack rendering

`generateCaptionFrames()` previously ignored `captionData.overlayTrack`, causing user-created overlays to be missing in exported videos. Fixed by:

- Adding `drawOverlays()` — renders each active `Overlay` onto the canvas at its `position.x`/`position.y`, using its own `style.fontSize`, `style.color`, and `style.backgroundOpacity`
- `renderCaptionFrame()` now accepts `activeOverlays` and calls `drawOverlays` after the speech caption layer
- `renderEmptyFrame()` now accepts `activeOverlays` for overlay-only frames (silence periods where overlays are active but no speech is showing)
- `pushGap()` inner function slices silence intervals at overlay start/end boundaries and caches overlay-only frames by overlay id set to avoid redundant PNG writes

### Between-word no-highlight intervals

Previously, a word's highlighted frame lasted from `word.start` to `next.start`, keeping the active color during any natural pause between words. In the in-app preview, `findActiveWordIndex()` returns `-1` between words. Fixed by:

- Ending the highlighted frame at `min(word.end, next.start)`
- When `next.start > word.end + 0.001`, inserting an additional frame with `activeWordIdx = -1` for that gap (all words render in plain `textColor`, matching the preview)

### `popover` color token restored

`bg-popover` / `text-popover-foreground` are used by modal components (`OverlayModal`, `EditWordModal`, `OverlayList`) but the `popover` entry had been dropped from `tailwind.config.js` during the theme migration. Re-added backed by `var(--color-popover)` / `var(--color-popover-foreground)` CSS variables, with values defined in both `lightThemeVars` and `darkThemeVars` in `theme.ts`.

### `burnCaptionFrames` error message improved

`execFile` errors now include both `err.message` (the Node.js exception description) and `stderr` (ffmpeg diagnostic output), joined with ` | `. Previously only `stderr` was included, which could be empty when the process failed to start.

### Vitest tests added for `generateCaptionFrames`

New test file `apps/worker/src/__tests__/caption-canvas.test.ts` covers:
- Group splitting at the `SENTENCE_GAP_S` boundary
- Between-word no-highlight gap frames
- Frame duration totals and chronological ordering
- Empty input producing at least one valid frame
- `overlayTrack` frames appearing during pre-speech silence
- No overlay frames when `overlayTrack` is empty

`@napi-rs/canvas` and `fs` are fully mocked so tests run without Skia or disk I/O.
