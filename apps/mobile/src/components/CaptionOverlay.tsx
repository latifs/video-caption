import { View, Text } from 'react-native';
import type { CaptionData, SpeechWord } from 'types';
import {
  findActiveSegment,
  findActiveWordIndex,
  findActiveOverlays,
} from '@/lib/caption-utils';

/** Minimum gap (seconds) between words to treat as a sentence boundary. */
const SENTENCE_GAP_S = 0.3;
/** Cap word duration — WhisperX inflates segment-final words to absorb silence. */
const MAX_WORD_DURATION_S = 0.8;

/**
 * Only return words up through the current "sentence group" within a segment.
 * If the next group's first word hasn't started yet, hide it so future
 * sentences don't appear too early.
 *
 * Uses capped word duration for gap detection (same as CaptionEditor's gapWidths)
 * because WhisperX's raw `end` on segment-final words absorbs silence, hiding
 * the real gap.
 */
function getVisibleWords(
  words: SpeechWord[],
  currentTime: number,
): SpeechWord[] {
  // Find sentence group boundaries (indices where a new group starts)
  const groupStarts = [0];
  for (let i = 1; i < words.length; i++) {
    const prev = words[i - 1];
    const cappedEnd =
      prev.start + Math.min(prev.end - prev.start, MAX_WORD_DURATION_S);
    if (words[i].start - cappedEnd > SENTENCE_GAP_S) {
      groupStarts.push(i);
    }
  }

  // Find the last group whose first word has started
  let activeGroup = 0;
  for (let g = groupStarts.length - 1; g >= 0; g--) {
    if (words[groupStarts[g]].start <= currentTime) {
      activeGroup = g;
      break;
    }
  }

  const start = groupStarts[activeGroup];
  const end =
    activeGroup + 1 < groupStarts.length
      ? groupStarts[activeGroup + 1]
      : words.length;

  return words.slice(start, end);
}

interface CaptionOverlayProps {
  currentTime: number;
  captionData: CaptionData;
}

export function CaptionOverlay({
  currentTime,
  captionData,
}: CaptionOverlayProps) {
  const activeSegment = findActiveSegment(
    captionData.speechTrack.segments,
    currentTime,
  );
  const activeOverlays = findActiveOverlays(
    captionData.overlayTrack,
    currentTime,
  );

  const visibleWords = activeSegment
    ? getVisibleWords(activeSegment.words, currentTime)
    : [];
  const activeWordIndex = activeSegment
    ? findActiveWordIndex(visibleWords, currentTime)
    : -1;

  return (
    <View className="absolute inset-0" pointerEvents="none">
      {/* Speech captions */}
      {activeSegment && visibleWords.length > 0 && (
        <View className="absolute bottom-[10%] left-4 right-4 items-center">
          <View className="rounded bg-overlay px-3 py-1.5">
            <Text className="text-center text-base text-white">
              {visibleWords.map((word, i) => (
                <Text
                  key={`${word.start}-${i}`}
                  style={i === activeWordIndex ? { color: '#FFD700' } : undefined}
                >
                  {i > 0 ? ' ' : ''}
                  {word.word}
                </Text>
              ))}
            </Text>
          </View>
        </View>
      )}

      {/* Overlay text */}
      {activeOverlays.map((overlay) => (
        <View
          key={overlay.id}
          className="absolute left-4 right-4"
          style={{
            top: `${overlay.position.y * 100}%`,
            alignItems:
              overlay.position.x === 'left'
                ? 'flex-start'
                : overlay.position.x === 'right'
                  ? 'flex-end'
                  : 'center',
          }}
        >
          <View
            className="absolute inset-0 rounded"
            style={{
              backgroundColor: overlay.style.backgroundColor,
              opacity: overlay.style.backgroundOpacity,
            }}
          />
          <Text
            className="px-2 py-1 text-center"
            style={{
              fontSize: overlay.style.fontSize,
              color: overlay.style.color,
            }}
          >
            {overlay.text}
          </Text>
        </View>
      ))}
    </View>
  );
}
