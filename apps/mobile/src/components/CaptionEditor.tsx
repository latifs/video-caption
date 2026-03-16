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
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Alert,
  Platform,
  TextInput,
  Modal,
  ScrollView,
  PanResponder,
  useWindowDimensions,
  type LayoutChangeEvent,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
  type GestureResponderEvent,
  type PanResponderGestureState,
} from 'react-native';
import { updateSpeechText, addOverlay, updateOverlay, deleteOverlay } from '@/lib/api';
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
  const [overlayModal, setOverlayModal] = useState<{
    mode: 'add' | 'edit';
    overlayId?: string;
    text: string;
    startText: string;
    endText: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  // Snapshot of measured word positions — stored in state so React re-renders overlays
  const [wordPosSnapshot, setWordPosSnapshot] = useState<
    Map<number, { x: number; width: number }>
  >(new Map());
  // Drag state for overlay chips
  const [dragging, setDragging] = useState<{
    overlayId: string;
    startX: number;
    dx: number;
  } | null>(null);

  const scrollViewRef = useRef<ScrollView>(null);
  const wordPositions = useRef<Map<number, { x: number; width: number }>>(
    new Map(),
  );
  const isUserScrolling = useRef(false);
  const isDraggingChip = useRef(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSeekTime = useRef(0);
  // Refs for drag handler access to latest state
  const draggingRef = useRef(dragging);
  draggingRef.current = dragging;
  const captionDataRef = useRef(captionData);
  captionDataRef.current = captionData;

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
  // WhisperX quirks handled:
  //  - Punctuation tokens ("?") have undefined start/end → interpolate from neighbors
  //  - Segment-final words absorb silence (huge duration) → cap at MAX_WORD_DURATION_S
  const gapWidths = useMemo(() => {
    // Build effective timestamps with missing values filled in
    const starts = flatWords.map((fw) => fw.start);
    const ends = flatWords.map((fw) => fw.end);

    // Forward pass: fill missing start from previous end
    for (let i = 1; i < starts.length; i++) {
      if (!(starts[i] >= 0) && ends[i - 1] >= 0) {
        starts[i] = ends[i - 1];
      }
    }
    // Backward pass: fill missing end from next start
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

      // Still missing after interpolation → minimal gap
      if (!(currStart >= 0) || !(currEnd >= 0) || !(nextStart >= 0)) {
        gaps.push(MIN_GAP_PX);
        continue;
      }

      // Cap word duration so absorbed silence becomes a visible gap
      const cappedEnd =
        currStart + Math.min(currEnd - currStart, MAX_WORD_DURATION_S);
      const timeGap = nextStart - cappedEnd;
      gaps.push(Math.max(MIN_GAP_PX, timeGap * PX_PER_SECOND));
    }
    return gaps;
  }, [flatWords]);

  // Word positions persist across reference changes — onLayout overwrites stale
  // entries when content actually changes, and stale entries beyond flatWords.length
  // are never read. Clearing here would break auto-scroll because React Native
  // does not re-fire onLayout when layout dimensions haven't changed.

  // Find the active word by current playback time.
  // Cap effective end at MAX_WORD_DURATION_S so segment-final words that absorb
  // silence (WhisperX quirk) don't keep activeWordIndex stuck — the fallback
  // timeToX interpolation handles the visual gap smoothly.
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

  // Trailing gap from the last word to the end of video, using the same
  // capping rules as inter-word gaps so the timeline stays proportional.
  // Walks backwards to skip punctuation tokens that have no timestamps.
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

  // Build a sorted list of { x, time } anchor points from measured word positions.
  // Shared by both xToTime and timeToX. Filters out punctuation with undefined timestamps.
  // Includes a trailing anchor at the end of the video computed from the last word position.
  const anchorPoints = useCallback(() => {
    const points: { x: number; time: number }[] = [];
    let lastMeasuredPos: { x: number; width: number } | null = null;
    for (let i = 0; i < flatWords.length; i++) {
      const pos = wordPositions.current.get(i);
      if (!pos) continue;
      lastMeasuredPos = pos;
      const t = flatWords[i].start;
      if (!(t >= 0)) continue; // skip punctuation with undefined timestamps
      points.push({ x: pos.x + pos.width / 2, time: t });
    }
    // End-of-video anchor: last word right edge + trailing gap width
    if (lastMeasuredPos && trailingWidth > 0 && duration > 0) {
      points.push({
        x: lastMeasuredPos.x + lastMeasuredPos.width + trailingWidth,
        time: duration,
      });
    }
    return points;
  }, [flatWords, duration, trailingWidth]);

  // Convert a scroll x position to an interpolated time using word positions
  const xToTime = useCallback(
    (scrollX: number) => {
      const points = anchorPoints();
      if (points.length === 0) return null;
      points.sort((a, b) => a.x - b.x);

      if (scrollX <= points[0].x) return points[0].time;
      if (scrollX >= points[points.length - 1].x) return points[points.length - 1].time;

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

  // Convert a time to a scroll x position (inverse of xToTime)
  const timeToX = useCallback(
    (time: number) => {
      const points = anchorPoints();
      if (points.length === 0) return null;
      points.sort((a, b) => a.time - b.time);

      if (time <= points[0].time) return points[0].x;
      if (time >= points[points.length - 1].time) return points[points.length - 1].x;

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

  // Auto-scroll: center the active word, fall back to interpolation for silence gaps
  useEffect(() => {
    if (isUserScrolling.current) return;

    // Primary: direct position lookup for the active word
    if (activeWordIndex >= 0) {
      const pos = wordPositions.current.get(activeWordIndex);
      if (pos) {
        scrollViewRef.current?.scrollTo({
          x: Math.max(0, pos.x + pos.width / 2),
          animated: true,
        });
        return;
      }
    }

    // Fallback: interpolate for silence gaps between words
    const targetX = timeToX(currentTime);
    if (targetX != null) {
      scrollViewRef.current?.scrollTo({
        x: Math.max(0, targetX),
        animated: true,
      });
    }
  }, [currentTime, activeWordIndex, timeToX]);

  // --- ScrollView handlers for user-initiated scrubbing ---
  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetX = event.nativeEvent.contentOffset.x;
      if (!isUserScrolling.current) return;

      // Throttle seek calls to max 1 per 50ms for smooth time updates
      const now = Date.now();
      if (now - lastSeekTime.current < 50) return;
      lastSeekTime.current = now;

      const time = xToTime(offsetX);
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

  // Measure each word's position for playhead hit-testing + overlay positioning
  const handleWordLayout = useCallback(
    (flatIndex: number, event: LayoutChangeEvent) => {
      const { x, width } = event.nativeEvent.layout;
      wordPositions.current.set(flatIndex, { x, width });
      // Snapshot to state once all words are measured (triggers overlay render)
      if (wordPositions.current.size >= flatWords.length) {
        setWordPosSnapshot(new Map(wordPositions.current));
      }
    },
    [flatWords.length],
  );

  // --- Word interactions ---
  const handleWordSeek = (flatWord: FlatWord) => {
    onSeekTo(flatWord.start);
    const pos = wordPositions.current.get(flatWord.flatIndex);
    if (pos) {
      const targetX = pos.x + pos.width / 2;
      scrollViewRef.current?.scrollTo({
        x: Math.max(0, targetX),
        animated: true,
      });
    }
  };

  const handleWordEdit = (flatWord: FlatWord) => {
    if (Platform.OS === 'ios') {
      Alert.prompt(
        'Edit Word',
        `Change "${flatWord.word}" to:`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Save',
            onPress: (newText?: string) => {
              if (newText !== undefined && newText !== flatWord.word) {
                submitWordEdit(
                  flatWord.segmentIndex,
                  flatWord.wordIndex,
                  newText,
                );
              }
            },
          },
        ],
        'plain-text',
        flatWord.word,
      );
    } else {
      setEditModal({
        segmentIndex: flatWord.segmentIndex,
        wordIndex: flatWord.wordIndex,
        text: flatWord.word,
      });
    }
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
    const { mode, overlayId, text, startText, endText } = overlayModal;

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
      Alert.alert('Error', mode === 'add' ? 'Failed to add overlay.' : 'Failed to update overlay.');
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

  // --- Overlay chip drag helpers ---
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

  const createChipPanResponder = useCallback(
    (overlay: Overlay, leftPos: number) =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (
          _: GestureResponderEvent,
          gs: PanResponderGestureState,
        ) => Math.abs(gs.dx) > 5,
        onPanResponderGrant: () => {
          isDraggingChip.current = true;
          setDragging({ overlayId: overlay.id, startX: leftPos, dx: 0 });
          // Start long-press timer
          longPressTimer.current = setTimeout(() => {
            // Only open modal if we haven't started dragging
            const cur = draggingRef.current;
            if (cur && Math.abs(cur.dx) < 5) {
              isDraggingChip.current = false;
              setDragging(null);
              handleEditOverlay(overlay);
            }
          }, 500);
        },
        onPanResponderMove: (
          _: GestureResponderEvent,
          gs: PanResponderGestureState,
        ) => {
          // Cancel long-press if moved significantly
          if (Math.abs(gs.dx) > 5 && longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
          }
          setDragging((prev) =>
            prev ? { ...prev, dx: gs.dx } : null,
          );
        },
        onPanResponderRelease: (
          _: GestureResponderEvent,
          gs: PanResponderGestureState,
        ) => {
          // Clear long-press timer
          if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
          }
          isDraggingChip.current = false;

          const cur = draggingRef.current;
          if (!cur) {
            setDragging(null);
            return;
          }

          // Tap: minimal movement
          if (Math.abs(gs.dx) < 5) {
            setDragging(null);
            onSeekTo(overlay.start);
            return;
          }

          // Drag: compute new position
          const newX = cur.startX + gs.dx;
          const newTime = xToTime(newX);
          if (newTime != null) {
            const cd = captionDataRef.current;
            const ov = cd.overlayTrack.find(
              (o) => o.id === cur.overlayId,
            );
            if (ov) {
              const duration = ov.end - ov.start;
              const newStart = Math.max(0, newTime);
              const newEnd = newStart + duration;
              onCaptionDataChange({
                ...cd,
                overlayTrack: cd.overlayTrack.map((o) =>
                  o.id === cur.overlayId
                    ? { ...o, start: newStart, end: newEnd }
                    : o,
                ),
              });
              updateOverlay(
                videoId,
                cur.overlayId,
                { start: newStart, end: newEnd },
                accessToken,
              );
            }
          }
          setDragging(null);
        },
        onPanResponderTerminate: () => {
          if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
          }
          isDraggingChip.current = false;
          setDragging(null);
        },
      }),
    [xToTime, onCaptionDataChange, onSeekTo, videoId, accessToken, handleEditOverlay],
  );

  // --- Render ---
  if (flatWords.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.emptyText}>No captions detected</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Time label row */}
      <View style={styles.timeLabel}>
        <Text style={styles.timeLabelText}>{formatTime(currentTime)}</Text>
        <Text style={styles.tapHint}>Tap to seek · Hold to edit · Drag to move</Text>
      </View>

      {/* Horizontal timeline with playhead — both rows in one ScrollView */}
      <View style={styles.timelineContainer}>
        <ScrollView
          ref={scrollViewRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          scrollEnabled={dragging === null}
          contentContainerStyle={{ paddingHorizontal: halfWidth }}
          onScroll={handleScroll}
          onScrollBeginDrag={handleScrollBeginDrag}
          onScrollEndDrag={handleScrollEnd}
          onMomentumScrollEnd={handleScrollEnd}
          scrollEventThrottle={16}
        >
          <View>
            {/* Speech row */}
            <View style={styles.speechRow}>
              {flatWords.map((fw, idx) => (
                <React.Fragment key={fw.flatIndex}>
                  <Pressable
                    onLayout={(e) => handleWordLayout(fw.flatIndex, e)}
                    onPress={() => handleWordSeek(fw)}
                    onLongPress={() => handleWordEdit(fw)}
                    disabled={saving}
                    style={[
                      styles.timelineWord,
                      activeWordIndex === fw.flatIndex &&
                        styles.timelineWordActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.wordText,
                        activeWordIndex === fw.flatIndex && styles.wordTextActive,
                        saving && styles.wordSaving,
                      ]}
                    >
                      {fw.word}
                    </Text>
                  </Pressable>
                  {idx < flatWords.length - 1 && (
                    <View style={{ width: gapWidths[idx], alignSelf: 'stretch' }} />
                  )}
                </React.Fragment>
              ))}
              {/* Trailing spacer for silence after the last word */}
              {trailingWidth > 0 && (
                <View style={{ width: trailingWidth, alignSelf: 'stretch' }} />
              )}
            </View>

            {/* Overlay row — draggable chips positioned at the matching word's x */}
            {sortedOverlays.length > 0 && wordPosSnapshot.size > 0 && (
              <View style={styles.overlayRow}>
                {sortedOverlays.map((overlay) => {
                  const isActive =
                    currentTime >= overlay.start && currentTime <= overlay.end;
                  const leftPos = getOverlayLeftPos(overlay);
                  const isDraggingThis = dragging?.overlayId === overlay.id;
                  const chipLeft = isDraggingThis && dragging
                    ? dragging.startX + dragging.dx
                    : leftPos;
                  const panResponder = createChipPanResponder(overlay, leftPos);
                  return (
                    <View
                      key={overlay.id}
                      style={[
                        styles.overlayChipWrapper,
                        { left: chipLeft },
                        isDraggingThis && styles.overlayChipDragging,
                      ]}
                      {...panResponder.panHandlers}
                    >
                      <View
                        style={[
                          styles.overlayChip,
                          isActive && styles.overlayChipActive,
                        ]}
                      >
                        <Text style={styles.overlayChipText} numberOfLines={1}>
                          {overlay.text}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        </ScrollView>

      </View>

      {/* Add overlay */}
      <TouchableOpacity style={styles.addButton} onPress={handleAddOverlay}>
        <Text style={styles.addButtonText}>
          + Add overlay at {formatTime(currentTime)}
        </Text>
      </TouchableOpacity>

      {/* Android word-edit modal */}
      <Modal visible={editModal !== null} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Word</Text>
            <TextInput
              style={styles.modalInput}
              value={editModal?.text ?? ''}
              onChangeText={(t) =>
                setEditModal((prev) => (prev ? { ...prev, text: t } : null))
              }
              autoFocus
              selectTextOnFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                onPress={() => setEditModal(null)}
                style={styles.modalButton}
              >
                <Text style={styles.modalButtonCancel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleEditModalSave}
                style={styles.modalButton}
              >
                <Text style={styles.modalButtonSave}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Unified overlay modal (add + edit) */}
      <Modal visible={overlayModal !== null} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {overlayModal?.mode === 'edit' ? 'Edit Overlay' : 'Add Overlay'}
            </Text>

            <Text style={styles.modalFieldLabel}>Text</Text>
            <TextInput
              style={styles.modalInput}
              value={overlayModal?.text ?? ''}
              onChangeText={(t) =>
                setOverlayModal((prev) =>
                  prev ? { ...prev, text: t } : null,
                )
              }
              placeholder="Overlay text..."
              autoFocus
            />

            <View style={styles.timeInputRow}>
              <View style={styles.timeInputGroup}>
                <Text style={styles.modalFieldLabel}>Start (sec)</Text>
                <TextInput
                  style={styles.modalInput}
                  value={overlayModal?.startText ?? ''}
                  onChangeText={(t) =>
                    setOverlayModal((prev) =>
                      prev ? { ...prev, startText: t } : null,
                    )
                  }
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.timeInputGroup}>
                <Text style={styles.modalFieldLabel}>End (sec)</Text>
                <TextInput
                  style={styles.modalInput}
                  value={overlayModal?.endText ?? ''}
                  onChangeText={(t) =>
                    setOverlayModal((prev) =>
                      prev ? { ...prev, endText: t } : null,
                    )
                  }
                  keyboardType="decimal-pad"
                />
              </View>
            </View>

            {overlayModal && (
              <Text style={styles.durationLabel}>
                Duration:{' '}
                {(() => {
                  const s = parseFloat(overlayModal.startText);
                  const e = parseFloat(overlayModal.endText);
                  if (isNaN(s) || isNaN(e) || e <= s) return '—';
                  return `${(e - s).toFixed(1)}s`;
                })()}
              </Text>
            )}

            <View style={styles.modalButtons}>
              {overlayModal?.mode === 'edit' && (
                <TouchableOpacity
                  onPress={() => handleDeleteOverlay(overlayModal.overlayId!)}
                  style={styles.modalButton}
                >
                  <Text style={styles.modalButtonDelete}>Delete</Text>
                </TouchableOpacity>
              )}
              <View style={{ flex: 1 }} />
              <TouchableOpacity
                onPress={() => setOverlayModal(null)}
                style={styles.modalButton}
              >
                <Text style={styles.modalButtonCancel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={submitOverlayModal}
                style={styles.modalButton}
                disabled={saving}
              >
                <Text
                  style={[styles.modalButtonSave, saving && { opacity: 0.5 }]}
                >
                  {saving
                    ? 'Saving...'
                    : overlayModal?.mode === 'edit'
                      ? 'Save'
                      : 'Add'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  emptyText: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    marginTop: 20,
  },
  timeLabel: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  timeLabelText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
  },
  tapHint: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
  },
  timelineContainer: {
    borderWidth: 2,
    borderColor: '#8B5CF6',
    borderRadius: 10,
    backgroundColor: 'rgba(139, 92, 246, 0.08)',
    marginBottom: 8,
    overflow: 'hidden',
  },
  speechRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 40,
  },
  overlayRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.15)',
    height: 30,
  },
  timelineWord: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  timelineWordActive: {
    backgroundColor: '#8B5CF6',
  },
  wordText: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.8)',
  },
  wordTextActive: {
    color: '#fff',
  },
  wordSaving: {
    opacity: 0.5,
  },
  overlayChipWrapper: {
    position: 'absolute',
    top: 2,
  },
  overlayChipDragging: {
    opacity: 0.85,
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
    zIndex: 10,
  },
  overlayChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.4)',
    maxWidth: 100,
  },
  overlayChipActive: {
    backgroundColor: 'rgba(139, 92, 246, 0.3)',
    borderColor: '#8B5CF6',
  },
  overlayChipText: {
    fontSize: 12,
    color: '#C4B5FD',
    fontWeight: '600',
  },
  addButton: {
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    borderStyle: 'dashed',
  },
  addButtonText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 14,
  },
  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    padding: 20,
    width: '85%',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 12,
    color: '#fff',
  },
  modalFieldLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 4,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 12,
    color: '#fff',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  timeInputRow: {
    flexDirection: 'row',
    gap: 12,
  },
  timeInputGroup: {
    flex: 1,
  },
  durationLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
    marginBottom: 12,
  },
  modalButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  modalButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  modalButtonCancel: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.5)',
  },
  modalButtonSave: {
    fontSize: 16,
    color: '#A78BFA',
    fontWeight: '600',
  },
  modalButtonDelete: {
    fontSize: 16,
    color: '#EF4444',
    fontWeight: '600',
  },
});
