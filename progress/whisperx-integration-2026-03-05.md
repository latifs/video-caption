# Progress — 2026-03-05

## WhisperX Integration — Accurate Word-Level Timestamps

Replaced OpenAI Whisper with WhisperX (via Replicate) for transcription. Whisper returned zero-duration words (start === end) during fast speech, making word highlighting and seek-to-word unreliable. WhisperX uses wav2vec2 forced phoneme alignment, producing accurate per-word timestamps without needing normalization.

### What changed

**New file: `apps/worker/src/lib/whisperx.ts`**
- `alignWithWhisperX(audioBuffer)` — calls `victor-upmeet/whisperx` on Replicate
- Accepts a `Buffer` (Replicate client auto-uploads it, no public URL needed)
- 120s timeout via `AbortController` for GPU cold starts
- Types: `WhisperXWord`, `WhisperXSegment`, `WhisperXResult`

**Updated: `apps/worker/src/lib/caption-data.ts`**
- Rewritten to only contain WhisperX functions
- `buildCaptionDataFromWhisperX(result)` — maps WhisperX segments/words directly to `CaptionData`
- `getWhisperXDuration(result)` — extracts duration from last word/segment
- Removed: `buildCaptionData()`, `normalizeWordTimings()` (Whisper-specific, no longer needed)

**Updated: `apps/worker/src/index.ts`**
- Simplified `processVideo` pipeline: `extractAudio → WhisperX → save`
- No fallback to Whisper — if WhisperX fails, video is marked `failed` (user can retry)
- Removed Whisper imports and fallback logic

**Deleted: `apps/worker/src/lib/transcribe.ts`**
- OpenAI Whisper transcription module (dead code after WhisperX switch)

**Deleted: `apps/worker/src/__tests__/caption-data.test.ts`**
- Tests for the old `buildCaptionData` function

**Updated: `apps/worker/package.json`**
- Added `replicate` dependency
- Removed `openai` dependency

**Updated: `README.md`**
- Environment variables: `OPENAI_API_KEY` → `REPLICATE_API_TOKEN`
- Tech stack: `OpenAI` → `WhisperX (via Replicate)`

**Updated: `apps/worker/.env.example`**
- Added `REPLICATE_API_TOKEN`

### Why no fallback

WhisperX runs full transcription + alignment in a single call (Whisper large-v3 internally + wav2vec2 alignment). The only failure modes are transient (Replicate outage, cold start timeout) or config issues (bad API token). A failed video the user can retry is preferable to silently saving subpar timestamps.

### Environment variables

| Removed             | Added                  |
| ------------------- | ---------------------- |
| `OPENAI_API_KEY`    | `REPLICATE_API_TOKEN`  |
| `TRANSCRIPTION_MODEL` |                      |

### Cost

~$0.021 per run on Replicate (A100 GPU, ~16s latency).
