import type { CaptionData, SpeechSegment } from "../types/caption";
import type { WhisperXResult } from "./whisperx";

/**
 * Build caption data from WhisperX result.
 * No normalization needed — WhisperX timestamps are already accurate
 * thanks to wav2vec2 forced phoneme alignment.
 */
export function buildCaptionDataFromWhisperX(
  result: WhisperXResult
): CaptionData {
  const segments: SpeechSegment[] = result.segments.map((seg) => ({
    start: seg.start,
    end: seg.end,
    words: (seg.words || []).map((w) => ({
      word: w.word,
      start: w.start,
      end: w.end,
    })),
  }));

  const fullText = result.segments.map((s) => s.text).join(" ");

  return {
    version: 1,
    speechTrack: {
      language: result.detected_language || "en",
      text: fullText,
      segments,
    },
    overlayTrack: [],
  };
}

/**
 * Compute total duration from WhisperX result.
 */
export function getWhisperXDuration(result: WhisperXResult): number {
  if (result.segments.length === 0) return 0;
  const lastSeg = result.segments[result.segments.length - 1];
  if (lastSeg.words && lastSeg.words.length > 0) {
    return lastSeg.words[lastSeg.words.length - 1].end;
  }
  return lastSeg.end;
}
