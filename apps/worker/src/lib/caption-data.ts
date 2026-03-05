import type { CaptionData, SpeechSegment, SpeechWord } from "../types/caption";
import type { TranscriptionResult } from "./transcribe";

/**
 * Whisper sometimes returns words with zero duration (start === end)
 * or consecutive words sharing the same timestamp. This makes them
 * impossible to highlight during playback. Fix by spreading them
 * evenly across the available time.
 */
function normalizeWordTimings(words: SpeechWord[]): SpeechWord[] {
  if (words.length === 0) return words;
  const result = words.map((w) => ({ ...w }));

  for (let i = 0; i < result.length; i++) {
    if (result[i].start < result[i].end) continue;

    // Found a zero-duration word — find the full run
    let runStart = i;
    let runEnd = i;
    while (
      runEnd + 1 < result.length &&
      result[runEnd + 1].start <= result[runEnd].end
    ) {
      runEnd++;
      // Stop extending if we hit a word with real duration
      if (result[runEnd].end > result[runEnd].start) break;
    }

    // Determine the time span to spread across
    const spanStart = result[runStart].start;
    let spanEnd = result[runEnd].end;
    if (spanEnd <= spanStart) {
      // All zero-duration — borrow time from next word or use fallback
      spanEnd =
        runEnd + 1 < result.length
          ? result[runEnd + 1].start
          : spanStart + 0.3;
    }

    const count = runEnd - runStart + 1;
    const step = (spanEnd - spanStart) / count;
    for (let j = runStart; j <= runEnd; j++) {
      result[j].start = spanStart + (j - runStart) * step;
      result[j].end = spanStart + (j - runStart + 1) * step;
    }

    i = runEnd;
  }

  return result;
}

export function buildCaptionData(result: TranscriptionResult): CaptionData {
  const segments: SpeechSegment[] = [];

  if (result.segments.length === 0) {
    // No segments — put all words in a single segment
    if (result.words.length > 0) {
      segments.push({
        start: result.words[0].start,
        end: result.words[result.words.length - 1].end,
        words: result.words.map((w) => ({
          word: w.word,
          start: w.start,
          end: w.end,
        })),
      });
    }
  } else {
    // Group words into segments by matching word start times to segment boundaries
    let wordIdx = 0;
    for (const seg of result.segments) {
      const segmentWords = [];
      while (wordIdx < result.words.length) {
        const w = result.words[wordIdx];
        // Word belongs to this segment if it starts before the next segment
        // (or if this is the last segment)
        if (w.start >= seg.start && w.start < seg.end + 0.01) {
          segmentWords.push({ word: w.word, start: w.start, end: w.end });
          wordIdx++;
        } else if (w.start < seg.start) {
          // Word is before this segment (shouldn't happen, but advance)
          wordIdx++;
        } else {
          break;
        }
      }

      segments.push({
        start: segmentWords.length > 0 ? segmentWords[0].start : seg.start,
        end:
          segmentWords.length > 0
            ? segmentWords[segmentWords.length - 1].end
            : seg.end,
        words: segmentWords,
      });
    }

    // Any remaining words go in the last segment
    if (wordIdx < result.words.length && segments.length > 0) {
      const lastSeg = segments[segments.length - 1];
      while (wordIdx < result.words.length) {
        const w = result.words[wordIdx];
        lastSeg.words.push({ word: w.word, start: w.start, end: w.end });
        wordIdx++;
      }
      lastSeg.end = lastSeg.words[lastSeg.words.length - 1].end;
    }
  }

  // Normalize word timings to fix zero-duration words from Whisper
  const normalizedSegments = segments.map((seg) => ({
    ...seg,
    words: normalizeWordTimings(seg.words),
  }));

  return {
    version: 1,
    speechTrack: {
      language: result.language,
      text: result.text,
      segments: normalizedSegments,
    },
    overlayTrack: [],
  };
}
