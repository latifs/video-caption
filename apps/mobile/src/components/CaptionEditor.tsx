import React, {
  useEffect,
  useState,
  useRef,
  useMemo,
  useCallback,
} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  Alert,
  ScrollView,
  useWindowDimensions,
  type LayoutChangeEvent,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { cn } from '@/lib/utils';
import { EditWordModal } from './EditWordModal';
import { OverlayModal, type OverlayModalState } from './OverlayModal';
import {
  updateSpeechText,
  addOverlay,
  updateOverlay,
  deleteOverlay,
} from '@/lib/api';
import type { CaptionData, Overlay } from 'types';

interface FlatWord {
  word: string;
  start: number;
  end: number;
  segmentIndex: number;
  wordIndex: number;
  isSegmentStart: boolean;
  flatIndex: number;
}

const PX_PER_SECOND = 80;
const MIN_GAP_PX = 4;
const MAX_WORD_DURATION_S = 0.8;

interface CaptionEditorProps {
  captionData: CaptionData;
  currentTime: number;
  duration: number;
  videoId: string;
  accessToken: string;
  onCaptionDataChange: (captionData: CaptionData) => void;
  onSeekTo: (time: number) => void;
  onPause: () => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const tenths = Math.floor((seconds % 1) * 10);
  return `${m}:${s.toString().padStart(2, '0')}.${tenths}`;
}

function formatTimePrecise(seconds: number): string {
  return seconds.toFixed(1);
}

export function CaptionEditor({
  captionData,
  currentTime,
  duration,
  videoId,
  accessToken,
  onCaptionDataChange,
  onSeekTo,
  onPause,
}: CaptionEditorProps) {
  const [editModal, setEditModal] = useState<{
    segmentIndex: number;
    wordIndex: number;
    text: string;
  } | null>(null);
  const [overlayModal, setOverlayModal] = useState<OverlayModalState | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  // Snapshot of measured word positions — stored in state so React re-renders overlays
  const [wordPosSnapshot, setWordPosSnapshot] = useState<
    Map<number, { x: number; width: number }>
  >(new Map());

  const scrollViewRef = useRef<ScrollView>(null);
  const wordPositions = useRef<Map<number, { x: number; width: number }>>(
    new Map(),
  );
  const isUserScrolling = useRef(false);
  const lastSeekTime = useRef(0);

  const { width: viewportWidth } = useWindowDimensions();
  const halfWidth = viewportWidth / 2;

  const segments = captionData.speechTrack.segments;

  // Flatten all words into a single horizontal list
  const flatWords = useMemo(() => {
    const words: FlatWord[] = [];
    segments.forEach((seg, sIdx) => {
      seg.words.forEach((w, wIdx) => {
        words.push({
          word: w.word,
          start: w.start,
          end: w.end,
          segmentIndex: sIdx,
          wordIndex: wIdx,
          isSegmentStart: wIdx === 0,
          flatIndex: words.length,
        });
      });
    });
    return words;
  }, [segments]);

  // Compute time-proportional gaps between consecutive words.
  const gapWidths = useMemo(() => {
    const starts = flatWords.map((fw) => fw.start);
    const ends = flatWords.map((fw) => fw.end);

    for (let i = 1; i < starts.length; i++) {
      if (!(starts[i] >= 0) && ends[i - 1] >= 0) {
        starts[i] = ends[i - 1];
      }
    }
    for (let i = ends.length - 2; i >= 0; i--) {
      if (!(ends[i] >= 0) && starts[i + 1] >= 0) {
        ends[i] = starts[i + 1];
      }
    }

    const gaps: number[] = [];
    for (let i = 0; i < flatWords.length - 1; i++) {
      const currStart = starts[i];
      const currEnd = ends[i];
      const nextStart = starts[i + 1];

      if (!(currStart >= 0) || !(currEnd >= 0) || !(nextStart >= 0)) {
        gaps.push(MIN_GAP_PX);
        continue;
      }

      const cappedEnd =
        currStart + Math.min(currEnd - currStart, MAX_WORD_DURATION_S);
      const timeGap = nextStart - cappedEnd;
      gaps.push(Math.max(MIN_GAP_PX, timeGap * PX_PER_SECOND));
    }
    return gaps;
  }, [flatWords]);

  const activeWordIndex = useMemo(() => {
    for (let i = 0; i < flatWords.length; i++) {
      const { start, end } = flatWords[i];
      const cappedEnd = start + Math.min(end - start, MAX_WORD_DURATION_S);
      if (currentTime >= start && currentTime <= cappedEnd) {
        return i;
      }
    }
    return -1;
  }, [flatWords, currentTime]);

  const trailingWidth = useMemo(() => {
    if (flatWords.length === 0 || duration <= 0) return 0;
    let lastStart = -1;
    let lastEnd = -1;
    for (let i = flatWords.length - 1; i >= 0; i--) {
      if (flatWords[i].start >= 0 && flatWords[i].end >= 0) {
        lastStart = flatWords[i].start;
        lastEnd = flatWords[i].end;
        break;
      }
    }
    if (lastStart < 0 || lastEnd < 0) return 0;
    const cappedEnd =
      lastStart + Math.min(lastEnd - lastStart, MAX_WORD_DURATION_S);
    const trailingGap = duration - cappedEnd;
    return Math.max(0, trailingGap * PX_PER_SECOND);
  }, [flatWords, duration]);

  const anchorPoints = useCallback(() => {
    const points: { x: number; time: number }[] = [];
    // Add leading anchor so t=0 maps to x=0 (the leading spacer origin)
    if (flatWords.length > 0 && flatWords[0].start > 0) {
      points.push({ x: 0, time: 0 });
    }
    let lastMeasuredPos: { x: number; width: number } | null = null;
    for (let i = 0; i < flatWords.length; i++) {
      const pos = wordPositions.current.get(i);
      if (!pos) continue;
      lastMeasuredPos = pos;
      const t = flatWords[i].start;
      if (!(t >= 0)) continue;
      points.push({ x: pos.x + pos.width / 2, time: t });
    }
    if (lastMeasuredPos && duration > 0) {
      points.push({
        x: lastMeasuredPos.x + lastMeasuredPos.width + trailingWidth,
        time: duration,
      });
    }
    return points;
  }, [flatWords, duration, trailingWidth]);

  const xToTime = useCallback(
    (scrollX: number) => {
      const points = anchorPoints();
      if (points.length === 0) return null;
      points.sort((a, b) => a.x - b.x);

      if (scrollX <= points[0].x) return points[0].time;
      if (scrollX >= points[points.length - 1].x)
        return points[points.length - 1].time;

      for (let i = 0; i < points.length - 1; i++) {
        if (scrollX >= points[i].x && scrollX <= points[i + 1].x) {
          const t = (scrollX - points[i].x) / (points[i + 1].x - points[i].x);
          return points[i].time + t * (points[i + 1].time - points[i].time);
        }
      }
      return points[points.length - 1].time;
    },
    [anchorPoints],
  );

  const timeToX = useCallback(
    (time: number) => {
      const points = anchorPoints();
      if (points.length === 0) return null;
      points.sort((a, b) => a.time - b.time);

      if (time <= points[0].time) return points[0].x;
      if (time >= points[points.length - 1].time)
        return points[points.length - 1].x;

      for (let i = 0; i < points.length - 1; i++) {
        if (time >= points[i].time && time <= points[i + 1].time) {
          const frac =
            (time - points[i].time) / (points[i + 1].time - points[i].time);
          return points[i].x + frac * (points[i + 1].x - points[i].x);
        }
      }
      return points[points.length - 1].x;
    },
    [anchorPoints],
  );

  // Auto-scroll
  useEffect(() => {
    if (isUserScrolling.current) return;

    if (activeWordIndex >= 0) {
      const pos = wordPositions.current.get(activeWordIndex);
      if (pos) {
        scrollViewRef.current?.scrollTo({
          x: Math.max(0, pos.x + pos.width / 2 - halfWidth),
          animated: true,
        });
        return;
      }
    }

    const targetX = timeToX(currentTime);
    if (targetX != null) {
      scrollViewRef.current?.scrollTo({
        x: Math.max(0, targetX - halfWidth),
        animated: true,
      });
    }
  }, [currentTime, activeWordIndex, timeToX]);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetX = event.nativeEvent.contentOffset.x;
      if (!isUserScrolling.current) return;

      const now = Date.now();
      if (now - lastSeekTime.current < 50) return;
      lastSeekTime.current = now;

      const time = xToTime(offsetX + halfWidth);
      if (time != null) {
        onSeekTo(time);
      }
    },
    [xToTime, onSeekTo],
  );

  const handleScrollBeginDrag = useCallback(() => {
    isUserScrolling.current = true;
    onPause();
  }, [onPause]);

  const handleScrollEnd = useCallback(() => {
    setTimeout(() => {
      isUserScrolling.current = false;
    }, 300);
  }, []);

  const handleWordLayout = useCallback(
    (flatIndex: number, event: LayoutChangeEvent) => {
      const { x, width } = event.nativeEvent.layout;
      wordPositions.current.set(flatIndex, { x, width });
      if (wordPositions.current.size >= flatWords.length) {
        setWordPosSnapshot(new Map(wordPositions.current));
      }
    },
    [flatWords.length],
  );

  const handleWordSeek = (flatWord: FlatWord) => {
    onSeekTo(flatWord.start);
    const pos = wordPositions.current.get(flatWord.flatIndex);
    if (pos) {
      const targetX = pos.x + pos.width / 2;
      scrollViewRef.current?.scrollTo({
        x: Math.max(0, targetX - halfWidth),
        animated: true,
      });
    }
  };

  const handleWordEdit = (flatWord: FlatWord) => {
    setEditModal({
      segmentIndex: flatWord.segmentIndex,
      wordIndex: flatWord.wordIndex,
      text: flatWord.word,
    });
  };

  const submitWordEdit = async (
    segmentIndex: number,
    wordIndex: number,
    newText: string,
  ) => {
    setSaving(true);
    try {
      const result = await updateSpeechText(
        videoId,
        [{ segmentIndex, wordIndex, newText }],
        accessToken,
      );
      onCaptionDataChange(result.captionData);
    } catch {
      Alert.alert('Error', 'Failed to update caption.');
    } finally {
      setSaving(false);
    }
  };

  const handleEditModalSave = () => {
    if (!editModal) return;
    const { segmentIndex, wordIndex, text } = editModal;
    const original = segments[segmentIndex].words[wordIndex].word;
    setEditModal(null);
    if (text !== undefined && text !== original)
      submitWordEdit(segmentIndex, wordIndex, text);
  };

  // --- Overlays ---
  const sortedOverlays = useMemo(
    () => [...captionData.overlayTrack].sort((a, b) => a.start - b.start),
    [captionData.overlayTrack],
  );

  const handleAddOverlay = () => {
    const endTime = currentTime + 2;
    setOverlayModal({
      mode: 'add',
      text: '',
      startText: formatTimePrecise(currentTime),
      endText: formatTimePrecise(endTime),
    });
  };

  const handleEditOverlay = useCallback((overlay: Overlay) => {
    setOverlayModal({
      mode: 'edit',
      overlayId: overlay.id,
      text: overlay.text,
      startText: formatTimePrecise(overlay.start),
      endText: formatTimePrecise(overlay.end),
    });
  }, []);

  const submitOverlayModal = async () => {
    if (!overlayModal) return;
    const { mode, text, startText, endText } = overlayModal;
    const overlayId =
      overlayModal.mode === 'edit' ? overlayModal.overlayId : undefined;

    if (!text.trim()) {
      Alert.alert('Error', 'Text cannot be empty.');
      return;
    }

    const start = parseFloat(startText);
    const end = parseFloat(endText);

    if (isNaN(start) || isNaN(end)) {
      Alert.alert('Error', 'Start and end must be valid numbers.');
      return;
    }
    if (start < 0) {
      Alert.alert('Error', 'Start must be >= 0.');
      return;
    }
    if (end <= start) {
      Alert.alert('Error', 'End must be greater than start.');
      return;
    }

    setSaving(true);
    try {
      if (mode === 'add') {
        const result = await addOverlay(
          videoId,
          { text: text.trim(), start, end },
          accessToken,
        );
        onCaptionDataChange({
          ...captionData,
          overlayTrack: [...captionData.overlayTrack, result.overlay],
        });
      } else {
        const result = await updateOverlay(
          videoId,
          overlayId!,
          { text: text.trim(), start, end },
          accessToken,
        );
        onCaptionDataChange({
          ...captionData,
          overlayTrack: captionData.overlayTrack.map((o) =>
            o.id === overlayId ? result.overlay : o,
          ),
        });
      }
      setOverlayModal(null);
    } catch {
      Alert.alert(
        'Error',
        mode === 'add' ? 'Failed to add overlay.' : 'Failed to update overlay.',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteOverlay = (overlayId: string) => {
    Alert.alert('Delete Overlay', 'Remove this overlay?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteOverlay(videoId, overlayId, accessToken);
            onCaptionDataChange({
              ...captionData,
              overlayTrack: captionData.overlayTrack.filter(
                (o) => o.id !== overlayId,
              ),
            });
            setOverlayModal(null);
          } catch {
            Alert.alert('Error', 'Failed to delete overlay.');
          }
        },
      },
    ]);
  };

  // --- Overlay chip position helpers ---
  const getOverlayLeftPos = useCallback(
    (overlay: Overlay) => {
      let bestIdx = 0;
      let bestDist = Infinity;
      for (let i = 0; i < flatWords.length; i++) {
        const d = Math.abs(flatWords[i].start - overlay.start);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }
      const pos = wordPosSnapshot.get(bestIdx);
      return pos ? pos.x : 0;
    },
    [flatWords, wordPosSnapshot],
  );

  // --- Render ---
  if (flatWords.length === 0) {
    return (
      <View className="flex-1 p-4">
        <Text className="mt-5 text-center text-base text-muted-foreground">
          No captions detected
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 p-2">
      {/* Time label row */}
      <View className="mb-2 flex-row items-center justify-between">
        <Text className="text-sm font-semibold text-muted-foreground">
          {formatTime(currentTime)}
        </Text>
        <Text className="text-xs text-muted-foreground">
          Tap to seek · Hold to edit
        </Text>
      </View>

      {/* Horizontal timeline with playhead */}
      <View className="mb-2 overflow-hidden rounded-xl bg-primary-muted">
        <ScrollView
          ref={scrollViewRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingRight: halfWidth }}
          onScroll={handleScroll}
          onScrollBeginDrag={handleScrollBeginDrag}
          onScrollEndDrag={handleScrollEnd}
          onMomentumScrollEnd={handleScrollEnd}
          scrollEventThrottle={16}
        >
          <View>
            {/* Speech row */}
            <View className="min-h-[40px] flex-row items-center">
              {/* Leading spacer: silence before the first word */}
              {flatWords.length > 0 && flatWords[0].start > 0 && (
                <View
                  style={{
                    width: flatWords[0].start * PX_PER_SECOND,
                    alignSelf: 'stretch',
                  }}
                />
              )}
              {flatWords.map((fw, idx) => (
                <React.Fragment key={fw.flatIndex}>
                  <Pressable
                    onLayout={(e) => handleWordLayout(fw.flatIndex, e)}
                    onPress={() => handleWordSeek(fw)}
                    onLongPress={() => handleWordEdit(fw)}
                    disabled={saving}
                    className={cn(
                      'rounded bg-black/[0.05] dark:bg-white/[0.08] px-1.5 py-1',
                      activeWordIndex === fw.flatIndex && 'bg-primary',
                    )}
                    style={{
                      minWidth:
                        Math.min(fw.end - fw.start, MAX_WORD_DURATION_S) *
                        PX_PER_SECOND,
                    }}
                  >
                    <Text
                      className={cn(
                        'text-base text-foreground',
                        activeWordIndex === fw.flatIndex && 'text-white',
                        saving && 'opacity-50',
                      )}
                    >
                      {fw.word}
                    </Text>
                  </Pressable>
                  {idx < flatWords.length - 1 && (
                    <View
                      style={{ width: gapWidths[idx], alignSelf: 'stretch' }}
                    />
                  )}
                </React.Fragment>
              ))}
              {trailingWidth > 0 && (
                <View style={{ width: trailingWidth, alignSelf: 'stretch' }} />
              )}
            </View>

            {/* Overlay row */}
            {sortedOverlays.length > 0 && wordPosSnapshot.size > 0 && (
              <View className="min-h-[40px] flex-row items-center border-t border-t-border">
                {sortedOverlays.map((overlay) => {
                  const isActive =
                    currentTime >= overlay.start && currentTime <= overlay.end;
                  const startX =
                    timeToX(overlay.start) ?? getOverlayLeftPos(overlay);
                  const endX = timeToX(overlay.end) ?? startX;
                  const chipWidth = Math.max(endX - startX, 0);
                  return (
                    <Pressable
                      key={overlay.id}
                      onPress={() => onSeekTo(overlay.start)}
                      onLongPress={() => handleEditOverlay(overlay)}
                      disabled={saving}
                      hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                      className={cn(
                        'absolute top-0.5 rounded bg-black/[0.05] dark:bg-white/[0.08] px-1.5 py-1',
                        isActive && 'bg-primary',
                      )}
                      style={{ left: startX, width: chipWidth }}
                    >
                      <Text
                        className={cn(
                          'text-base text-foreground',
                          isActive && 'text-white',
                          saving && 'opacity-50',
                        )}
                        numberOfLines={1}
                      >
                        {overlay.text}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        </ScrollView>
      </View>

      {/* Add overlay */}
      <TouchableOpacity
        className="items-center rounded-lg border border-dashed border-input py-2"
        onPress={handleAddOverlay}
      >
        <Text className="text-sm text-muted-foreground">
          + Add overlay at {formatTime(currentTime)}
        </Text>
      </TouchableOpacity>

      <EditWordModal
        visible={editModal !== null}
        value={editModal?.text ?? ''}
        onChangeText={(t) =>
          setEditModal((prev) => (prev ? { ...prev, text: t } : null))
        }
        onCancel={() => setEditModal(null)}
        onSave={handleEditModalSave}
      />

      <OverlayModal
        state={overlayModal}
        saving={saving}
        onChange={setOverlayModal}
        onCancel={() => setOverlayModal(null)}
        onSubmit={submitOverlayModal}
        onDelete={handleDeleteOverlay}
      />
    </View>
  );
}
