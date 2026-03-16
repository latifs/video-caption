import type { CaptionData, SpeechSegment, SpeechWord } from "../types/caption";
import type { WhisperXResult, WhisperXWord } from "./whisperx";

/**
 * Merge words without timestamps into the preceding word.
 * WhisperX's wav2vec2 alignment can fail for punctuation tokens AND
 * regular words, leaving them with null start/end. Append their text
 * to the previous word so we don't end up with undefined timestamps.
 */
function mergeUntimedWords(words: WhisperXWord[]): SpeechWord[] {
  return words.reduce<SpeechWord[]>((acc, w) => {
    const hasTimestamps = w.start != null && w.end != null;
    if (!hasTimestamps && acc.length > 0) {
      // Punctuation merges directly, regular words get a space separator
      const isPunctuation = /^[?.!,;:]+$/.test(w.word);
      acc[acc.length - 1].word += isPunctuation ? w.word : ` ${w.word}`;
    } else if (hasTimestamps) {
      acc.push({ word: w.word, start: w.start!, end: w.end! });
    }
    return acc;
  }, []);
}

/**
 * Build caption data from WhisperX result.
 * Merges standalone punctuation into preceding words, then passes through
 * the already-accurate wav2vec2 aligned timestamps.
 */
export function buildCaptionDataFromWhisperX(
  result: WhisperXResult
): CaptionData {
  const segments: SpeechSegment[] = result.segments.map((seg) => ({
    start: seg.start,
    end: seg.end,
    words: mergeUntimedWords(seg.words || []),
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
    // Walk backwards to find the last word with a timestamp (skip punctuation tokens)
    for (let i = lastSeg.words.length - 1; i >= 0; i--) {
      if (lastSeg.words[i].end != null) return lastSeg.words[i].end!;
    }
  }
  return lastSeg.end;
}
