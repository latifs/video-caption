import { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  PanResponder,
  type LayoutChangeEvent,
  type GestureResponderEvent,
} from 'react-native';
import { Play, Pause } from '@/lib/icons';

interface VideoControlsProps {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function VideoControls({
  currentTime,
  duration,
  isPlaying,
  onTogglePlay,
  onSeek,
}: VideoControlsProps) {
  const [trackWidth, setTrackWidth] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekPosition, setSeekPosition] = useState(0);
  const trackOffsetX = useRef(0);

  const progress =
    duration > 0
      ? isSeeking
        ? seekPosition / duration
        : currentTime / duration
      : 0;

  const clampedProgress = Math.max(0, Math.min(1, progress));

  const positionToTime = useCallback(
    (x: number) => {
      if (trackWidth <= 0 || duration <= 0) return 0;
      const ratio = Math.max(0, Math.min(1, x / trackWidth));
      return ratio * duration;
    },
    [trackWidth, duration],
  );

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt: GestureResponderEvent) => {
        const x = evt.nativeEvent.locationX;
        const time = positionToTimeRef.current(x);
        setIsSeeking(true);
        setSeekPosition(time);
        onSeekRef.current(time);
      },
      onPanResponderMove: (evt: GestureResponderEvent) => {
        const pageX = evt.nativeEvent.pageX;
        const x = pageX - trackOffsetX.current;
        const time = positionToTimeRef.current(x);
        setSeekPosition(time);
        onSeekRef.current(time);
      },
      onPanResponderRelease: () => {
        setIsSeeking(false);
      },
      onPanResponderTerminate: () => {
        setIsSeeking(false);
      },
    }),
  ).current;

  // Use refs for callbacks accessed inside PanResponder (created once)
  const positionToTimeRef = useRef(positionToTime);
  positionToTimeRef.current = positionToTime;
  const onSeekRef = useRef(onSeek);
  onSeekRef.current = onSeek;

  const handleTrackLayout = useCallback((event: LayoutChangeEvent) => {
    const { width } = event.nativeEvent.layout;
    setTrackWidth(width);
    event.target?.measure?.(
      (_x: number, _y: number, _w: number, _h: number, pageX: number) => {
        trackOffsetX.current = pageX;
      },
    );
  }, []);

  const disabled = duration <= 0;

  return (
    <View style={styles.container}>
      {/* Play/Pause button */}
      <Pressable style={styles.playButton} onPress={onTogglePlay}>
        {isPlaying ? (
          <Pause size={14} color="#fff" />
        ) : (
          <Play size={14} color="#fff" />
        )}
      </Pressable>

      {/* Current time */}
      <Text style={styles.timeText}>
        {formatTime(isSeeking ? seekPosition : currentTime)}
      </Text>

      {/* Seek bar */}
      <View
        style={[styles.trackOuter, disabled && styles.trackDisabled]}
        onLayout={handleTrackLayout}
        {...(disabled ? {} : panResponder.panHandlers)}
      >
        <View style={styles.trackBg}>
          <View
            style={[styles.trackFill, { width: `${clampedProgress * 100}%` }]}
          />
        </View>
        {!disabled && (
          <View
            style={[
              styles.thumb,
              { left: `${clampedProgress * 100}%` },
            ]}
          />
        )}
      </View>

      {/* Duration */}
      <Text style={styles.timeText}>{formatTime(duration)}</Text>
    </View>
  );
}

const THUMB_SIZE = 12;

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    borderRadius: 24,
    paddingHorizontal: 6,
    paddingVertical: 6,
    marginHorizontal: 12,
    gap: 8,
  },
  playButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeText: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  trackOuter: {
    flex: 1,
    height: 28,
    justifyContent: 'center',
  },
  trackDisabled: {
    opacity: 0.4,
  },
  trackBg: {
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    overflow: 'hidden',
  },
  trackFill: {
    height: '100%',
    borderRadius: 1.5,
    backgroundColor: '#fff',
  },
  thumb: {
    position: 'absolute',
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: '#fff',
    marginLeft: -THUMB_SIZE / 2,
    top: (28 - THUMB_SIZE) / 2,
  },
});
