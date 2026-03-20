# Progress — 2026-03-20

## Caption Style Pipeline — From UI Overlay to Burned Video

This document traces how caption appearance travels from the React Native preview
overlay all the way to the final `.mp4` exported from the worker.

---

### Overview

```
CaptionOverlay (React Native)
        │
        │  same CaptionData (JSON)
        ▼
captionDataToAss() (worker)
        │
        │  subtitles=subtitle.ass:fontsdir=...
        ▼
ffmpeg burnSubtitles (libass renderer)
        │
        ▼
burned pixels in processed/{videoId}_{timestamp}.mp4
```

---

### 1. In-App Preview — `CaptionOverlay.tsx`

**File:** `apps/mobile/src/components/CaptionOverlay.tsx`

The overlay is a React Native `View` with `pointerEvents="none"` pinned
`absolute inset-0` over the video player. It re-renders on every
`timeUpdate` event (~10 fps).

Key styling decisions:

| Property | Value | Notes |
|---|---|---|
| Font size | `text-base` (16pt) | NativeWind Tailwind class |
| Background | `bg-overlay` pill | Semi-transparent dark rounded box via `rounded bg-overlay px-3 py-1.5` |
| Text color | white | All words default |
| Active word | `#FFD700` gold | Applied via inline `style` only to the word whose index matches `activeWordIndex` |
| Position | `bottom-[10%]` centered | 10% from bottom of the video viewport |

The active word index is derived from `findActiveWordIndex()` in
`apps/mobile/src/lib/caption-utils.ts`, which scans the current sentence
group's words for the one whose `[start, end]` window contains
`currentTime`.

---

### 2. Caption Data Format — `CaptionData`

**File:** `packages/types/src/index.ts`

Both the overlay and the ASS generator consume the same `CaptionData` object
stored in the database:

```ts
interface CaptionData {
  speechTrack: {
    segments: Array<{
      words: Array<{ word: string; start: number; end: number }>;
    }>;
  };
  overlayTrack: Array<OverlayEntry>;  // custom text overlays
}
```

Sentence grouping (which words appear together on screen at once) is computed
identically in both the overlay and the ASS generator using the same constants:

```ts
const SENTENCE_GAP_S = 0.3;   // gap > 0.3 s → new group
const MAX_WORD_DURATION_S = 0.8; // cap inflated WhisperX end times
```

---

### 3. ASS Generation — `captionDataToAss()`

**File:** `apps/worker/src/lib/caption-ass.ts`

Converts `CaptionData` into an ASS (Advanced SubStation Alpha) subtitle file
that libass (inside ffmpeg) renders frame-by-frame into the video.

#### Coordinate system

```
PlayResX = actual video width   (e.g. 1080 for portrait)
PlayResY = actual video height  (e.g. 1920 for portrait)
```

All sizes are in actual video pixels — libass applies no scaling.

#### Font size

```ts
const shortEdge = Math.min(videoWidth, videoHeight);
const fontSize = Math.round(shortEdge * (30 / 720));
```

Using the **short edge** prevents portrait videos (tall height) from inflating
the font. At `30/720 ≈ 4.2%` of the short edge the rendered text is
approximately `16pt` on an iPhone screen — matching `text-base` in the overlay.

Example values:

| Video | shortEdge | fontSize |
|---|---|---|
| 1080×1920 portrait | 1080 | 45 px |
| 1920×1080 landscape | 1080 | 45 px |
| 2160×3840 4K portrait | 2160 | 90 px |

#### ASS Style line

```
Style: Speech, Arial, {fontSize},
  PrimaryColour  = &H00FFFFFF  (white  — default text)
  SecondaryColour= &H00FFFFFF  (white)
  OutlineColour  = &H00000000  (black)
  BackColour     = &H40000000  (~75% opaque black box)
  BorderStyle    = 3           (opaque background box, not outline)
  Outline        = 2           (box border; some libass builds need > 0)
  Shadow         = 0
  Alignment      = 2           (bottom-center)
  MarginV        = round(videoHeight × 72/720)   ≈ 10% from bottom
  MarginLR       = round(videoWidth  × 10/1280)  ≈ 0.8% side margins
```

#### Per-word active highlighting

Instead of ASS karaoke tags (which keep already-spoken words highlighted), one
`Dialogue` event is generated **per word** in each sentence group:

```
Dialogue: 0, {word_N.start}, {word_N+1.start}, Speech,,0,0,0,,
  word_0 word_1 ... {\c&H0000D7FF&}word_N{\r} ... word_last
```

- `{\c&H0000D7FF&}` — inline color override to gold (`#FFD700` in BGR)
- `{\r}` — resets back to style PrimaryColour (white)
- Each event spans from `word_N.start` → `word_N+1.start`, so the caption
  is continuously visible with no gaps between words
- Only the active word is gold at any moment — matches the in-app overlay exactly

---

### 4. Video Dimension Probe — `getVideoDimensions()`

**File:** `apps/worker/src/lib/ffmpeg.ts`

Before generating the ASS file the worker probes the actual video dimensions
using the ffmpeg binary (no ffprobe needed):

```ts
execFile(ffmpegBin, ['-i', inputPath], (_err, _stdout, stderr) => {
  const match = stderr.match(/(\d{2,5})x(\d{2,5})/);
  resolve({ width, height });   // fallback: 1280×720
});
```

`ffmpeg -i` always exits with code 1 when given no output file; the resolution
is parsed from the stream info line in stderr.

---

### 5. Burning — `burnSubtitles()`

**File:** `apps/worker/src/lib/ffmpeg.ts`

```ts
ffmpeg(inputPath)
  .videoFilter(`subtitles='${assPath}':fontsdir='${fontsDir}'`)
  .videoCodec("libx264")
  .outputOptions("-c:a", "copy")
  .output(outputPath)
```

**`fontsdir` is critical.** The `ffmpeg-static` npm package is a self-contained
static binary whose libass is compiled without system fontconfig. Without an
explicit `fontsdir`, libass cannot find Arial and falls back to a built-in
bitmap font — ignoring all ASS style settings entirely (size, color, box).

Font directory resolution:

```ts
process.env.FONTS_DIR          // override via env var
  ?? '/Library/Fonts'          // macOS (has Arial.ttf)
  ?? '/usr/share/fonts'        // Linux / Docker (fonts-liberation installed)
```

The Docker image installs `fonts-liberation` (apt) which provides
`LiberationSans-Regular.ttf` — metric-compatible with Arial — so libass finds
it when the ASS specifies `Fontname: Arial`.

---

### 6. Storage & Cache Busting

**File:** `apps/worker/src/index.ts`

Each export writes to a **timestamped filename**:

```ts
const storagePath = `processed/${videoId}_${Date.now()}.mp4`;
```

This guarantees a unique URL for every export. Re-exporting to the same
`processed/{videoId}.mp4` path caused Supabase's CDN to serve the stale cached
file even after the storage object was overwritten with `upsert: true`.

---

### Known Limitations

- **No background box on some libass builds** — `BorderStyle: 3` box rendering
  depends on the libass version. `Outline: 2` is set as a workaround. If the
  box still doesn't render, text is still readable via the font color contrast.
- **Already-spoken words revert to white** — the per-word dialogue approach
  resets all non-active words to white. Standard ASS karaoke (`\kf`) was
  replaced because it progressively fills within each word ("progress bar"
  effect) rather than switching whole words.
- **No rounded corners on the background box** — ASS does not support border
  radius; the box is rectangular.
