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
    // Measure pageX for move calculations
    event.target?.measure?.(
      (_x: number, _y: number, _w: number, _h: number, pageX: number) => {
        trackOffsetX.current = pageX;
      },
    );
  }, []);

  const disabled = duration <= 0;

  return (
    <View className="bg-neutral-900 px-4 pb-2 pt-3">
      {/* Seek bar */}
      <View
        style={[styles.trackOuter, disabled && styles.trackDisabled]}
        onLayout={handleTrackLayout}
        {...(disabled ? {} : panResponder.panHandlers)}
      >
        <View className="h-1 overflow-hidden rounded-sm bg-secondary">
          <View
            className="h-full rounded-sm bg-primary"
            style={{ width: `${clampedProgress * 100}%` }}
          />
        </View>
        {!disabled && (
          <View
            style={[
              styles.thumb,
              {
                left: `${clampedProgress * 100}%`,
              },
            ]}
          />
        )}
      </View>

      {/* Bottom row: time + play/pause */}
      <View className="mt-1 flex-row items-center justify-between">
        <Text
          className="flex-1 text-xs text-muted-foreground"
          style={{ fontVariant: ['tabular-nums'] }}
        >
          {formatTime(isSeeking ? seekPosition : currentTime)} /{' '}
          {formatTime(duration)}
        </Text>

        <Pressable
          className="h-11 w-11 items-center justify-center rounded-full bg-secondary"
          onPress={onTogglePlay}
        >
          {isPlaying ? (
            <Pause size={16} className="text-primary" />
          ) : (
            <Play size={16} className="text-primary" />
          )}
        </Pressable>

        {/* Spacer to balance layout */}
        <View className="flex-1" />
      </View>
    </View>
  );
}

const THUMB_SIZE = 16;

const styles = StyleSheet.create({
  trackOuter: {
    height: 30,
    justifyContent: 'center',
  },
  trackDisabled: {
    opacity: 0.4,
  },
  thumb: {
    position: 'absolute',
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: '#8B5CF6',
    marginLeft: -THUMB_SIZE / 2,
    top: (30 - THUMB_SIZE) / 2,
  },
});
