# Export Format — Social Media Optimisation
**Date:** 2026-03-29

## Overview
Updated the worker's video export pipeline to output a universal format that works across TikTok, Instagram, YouTube Shorts, and Snapchat. Previously the exported video inherited whatever settings the source file had. Now every export is normalised to a consistent spec regardless of what the user uploads.

---

## Changed Files

- `apps/worker/src/lib/ffmpeg.ts` — `burnCaptionFrames()`

---

## What Changed

### Before
- Resolution: passed through from source
- FPS: passed through from source
- Video codec: `libx264` (no bitrate set — ffmpeg default ~4 Mbps)
- Audio: `copy` (re-muxed as-is, no re-encoding)

### After
| Setting | Value |
|---|---|
| Resolution | 1080 × 1920 (9:16) |
| FPS | 30 |
| Video codec | H.264 (`libx264`) |
| Video bitrate | 10 Mbps |
| Audio codec | AAC |
| Audio sample rate | 44.1 kHz |
| Audio bitrate | 192k |
| Pixel format | yuv420p (4:2:0) |

Non-9:16 source videos are scaled down to fit within 1080×1920 (aspect ratio preserved) and padded with black bars to fill the frame — standard behaviour on all target platforms.

---

## Why These Settings

- **H.264 + AAC** — universally supported decoder on every platform and device
- **1080×1920 / 9:16** — the native resolution for TikTok, Instagram Reels, YouTube Shorts, and Snapchat
- **30 fps** — baseline requirement for all four platforms; 60 fps can be used for action content but 30 is the safe default
- **10 Mbps video bitrate** — sits in the middle of the recommended 8–15 Mbps range; enough quality headroom for platform re-encoding without producing unnecessarily large files
- **AAC 44.1 kHz** — required by Instagram and broadly expected everywhere else; `copy` passthrough risked uploading unsupported audio formats

---

## Implementation Notes

The scale/pad step is appended to the ffmpeg filter complex **after** the caption overlay, so caption frames continue to be rendered at the source video's native dimensions. This keeps `generateCaptionFrames()` unchanged and ensures captions are composited at full quality before the final scale.

Filter chain:
```
[1:v]format=rgba[cap];
[0:v][cap]overlay=eof_action=pass[overlaid];
[overlaid]scale=1080:1920:force_original_aspect_ratio=decrease,
           pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1[out]
```
