import type { CaptionData, SpeechSegment, SpeechWord, Overlay } from "types";

/**
 * Fix zero-duration words from Whisper transcription.
 * Words like "est-" and "ce" can have start === end, making them
 * impossible to match during playback. This spreads consecutive
 * zero/shared-boundary words evenly across the available time span.
 */
export function normalizeCaptionTimings(data: CaptionData): CaptionData {
  return {
    ...data,
    speechTrack: {
      ...data.speechTrack,
      segments: data.speechTrack.segments.map((seg) => ({
        ...seg,
        words: normalizeWords(seg.words),
      })),
    },
  };
}

function normalizeWords(words: SpeechWord[]): SpeechWord[] {
  if (words.length === 0) return words;

  const result: SpeechWord[] = words.map((w) => ({ ...w }));

  // Find runs of words that share the same start time or have zero duration
  let i = 0;
  while (i < result.length) {
    // Find a run of words where each word's duration is effectively zero
    // or they share boundaries with the next word
    let runStart = i;
    let runEnd = i;

    // Extend run while next word starts at or before current word's end
    while (
      runEnd + 1 < result.length &&
      result[runEnd + 1].start <= result[runEnd].end &&
      result[runEnd].start === result[runEnd].end
    ) {
      runEnd++;
    }

    // Also include the last word in the run if it has zero duration
    // but only process if we actually have zero-duration words
    const hasZeroDuration = result
      .slice(runStart, runEnd + 1)
      .some((w) => w.start === w.end);

    if (hasZeroDuration && runEnd > runStart) {
      // Spread these words evenly from first word's start to last word's end
      const spanStart = result[runStart].start;
      // Find the end: use the end of the last non-zero word, or the next word's start
      let spanEnd = result[runEnd].end;
      if (spanEnd <= spanStart) {
        // All zero-duration — use next word's start or segment boundary
        spanEnd =
          runEnd + 1 < result.length
            ? result[runEnd + 1].start
            : spanStart + 0.5; // fallback: 500ms
      }

      const count = runEnd - runStart + 1;
      const step = (spanEnd - spanStart) / count;

      for (let j = runStart; j <= runEnd; j++) {
        result[j].start = spanStart + (j - runStart) * step;
        result[j].end = spanStart + (j - runStart + 1) * step;
      }
    }

    i = runEnd + 1;
  }

  return result;
}

export function findActiveSegment(
  segments: SpeechSegment[],
  currentTime: number
): SpeechSegment | null {
  for (const seg of segments) {
    if (currentTime >= seg.start && currentTime <= seg.end) {
      return seg;
    }
  }
  return null;
}

export function findActiveWordIndex(
  words: SpeechWord[],
  currentTime: number
): number {
  for (let i = 0; i < words.length; i++) {
    if (currentTime >= words[i].start && currentTime <= words[i].end) {
      return i;
    }
  }
  return -1;
}

export function findActiveOverlays(
  overlays: Overlay[],
  currentTime: number
): Overlay[] {
  return overlays.filter(
    (o) => currentTime >= o.start && currentTime <= o.end
  );
}
