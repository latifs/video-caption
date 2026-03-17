import {
  useEffect,
  useState,
  useRef,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Pressable,
  Modal,
  StatusBar,
  Dimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEventListener } from 'expo';
import { ArrowLeft, Play, Pause, X, Maximize } from '@/lib/icons';
import { useAuth } from '@/lib/auth';
import { getVideoStatus, triggerExport } from '@/lib/api';
import { CaptionOverlay } from '@/components/CaptionOverlay';
import { CaptionEditor } from '@/components/CaptionEditor';
import { VideoControls } from '@/components/VideoControls';
import { normalizeCaptionTimings } from '@/lib/caption-utils';
import type { CaptionData } from 'types';

interface CaptionedVideoHandle {
  seekTo: (time: number) => void;
  pause: () => void;
  togglePlay: () => void;
}

const CaptionedVideo = forwardRef<
  CaptionedVideoHandle,
  {
    url: string;
    captionData: CaptionData;
    onTimeUpdate?: (time: number) => void;
    onPlayingChange?: (isPlaying: boolean) => void;
    onDurationChange?: (duration: number) => void;
  }
>(function CaptionedVideo(
  { url, captionData, onTimeUpdate, onPlayingChange, onDurationChange },
  ref,
) {
  const player = useVideoPlayer(url, (p) => {
    p.timeUpdateEventInterval = 0.1;
  });
  const [currentTime, setCurrentTime] = useState(0);

  // Single event listener drives both local state (for overlay) and parent callback directly
  const onTimeUpdateRef = useRef(onTimeUpdate);
  onTimeUpdateRef.current = onTimeUpdate;

  useEventListener(player, 'timeUpdate', (payload) => {
    setCurrentTime(payload.currentTime);
    onTimeUpdateRef.current?.(payload.currentTime);
  });

  useImperativeHandle(
    ref,
    () => ({
      seekTo: (time: number) => {
        if (typeof time === 'number' && isFinite(time)) {
          player.currentTime = time;
        }
      },
      pause: () => {
        player.pause();
      },
      togglePlay: () => {
        if (player.playing) {
          player.pause();
        } else {
          player.play();
        }
      },
    }),
    [player],
  );

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEventListener(player, 'statusChange', (({ status }: any) => {
    if (status === 'readyToPlay' && player.duration > 0) {
      onDurationChange?.(player.duration);
    }
  }) as any);

  useEventListener(player, 'playingChange', ({ isPlaying: playing }) => {
    setIsPlaying(playing);
    onPlayingChange?.(playing);
    // Also report duration on first play, in case statusChange missed it
    if (playing && player.duration > 0) {
      onDurationChange?.(player.duration);
    }
  });

  const scheduleHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowControls(false), 3000);
  }, []);

  const handleTap = () => {
    setShowControls(true);
    scheduleHide();
  };

  const togglePlay = () => {
    if (isPlaying) {
      player.pause();
    } else {
      player.play();
    }
  };

  const videoContent = (fullscreen: boolean) => (
    <View
      className={
        fullscreen ? 'flex-1 bg-black' : 'w-full overflow-hidden bg-black'
      }
      style={
        !fullscreen
          ? { height: Dimensions.get('window').height * 0.4 }
          : undefined
      }
    >
      <VideoView
        player={player}
        style={styles.video}
        contentFit="contain"
        allowsFullscreen={false}
        allowsPictureInPicture={!fullscreen}
        nativeControls={false}
      />

      {/* Tap target for fullscreen controls */}
      {fullscreen && (
        <Pressable style={StyleSheet.absoluteFill} onPress={handleTap}>
          {showControls && (
            <View className="absolute inset-0 items-center justify-center">
              <TouchableOpacity
                className="h-16 w-16 items-center justify-center rounded-full bg-overlay"
                onPress={togglePlay}
              >
                {isPlaying ? (
                  <Pause size={28} className="text-foreground" />
                ) : (
                  <Play size={28} className="text-foreground" fill="#fff" />
                )}
              </TouchableOpacity>
            </View>
          )}
        </Pressable>
      )}

      <CaptionOverlay currentTime={currentTime} captionData={captionData} />

      {(!fullscreen || showControls) && (
        <TouchableOpacity
          className={`absolute items-center justify-center rounded-full bg-overlay ${
            fullscreen ? 'right-4 top-[50px] h-9 w-9' : 'right-2 top-2 h-8 w-8'
          }`}
          onPress={() => setIsFullscreen((f) => !f)}
        >
          {fullscreen ? (
            <X size={18} className="text-foreground" />
          ) : (
            <Maximize size={18} className="text-foreground" />
          )}
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <>
      {videoContent(false)}
      <Modal
        visible={isFullscreen}
        animationType="fade"
        supportedOrientations={['portrait', 'landscape']}
        statusBarTranslucent
      >
        <StatusBar hidden />
        {videoContent(true)}
      </Modal>
    </>
  );
});

export default function StatusScreen() {
  const { videoId } = useLocalSearchParams<{ videoId: string }>();
  const { session } = useAuth();
  const router = useRouter();
  const [status, setStatus] = useState('processing');
  const [rawUrl, setRawUrl] = useState<string | null>(null);
  const [processedUrl, setProcessedUrl] = useState<string | null>(null);
  const [captionData, setCaptionData] = useState<CaptionData | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [videoDuration, setVideoDuration] = useState(0);
  const [exporting, setExporting] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoRef = useRef<CaptionedVideoHandle>(null);

  useEffect(() => {
    if (!videoId || !session) return;

    const poll = async () => {
      try {
        const data = await getVideoStatus(videoId, session.access_token);
        setStatus(data.status);
        if (data.rawUrl) setRawUrl(data.rawUrl);
        if (data.processedUrl) setProcessedUrl(data.processedUrl);
        if (data.captionData)
          setCaptionData(normalizeCaptionTimings(data.captionData));

        // Stop polling once we have caption data or hit a terminal state
        if (
          data.status === 'transcribed' ||
          data.status === 'completed' ||
          data.status === 'failed'
        ) {
          if (intervalRef.current) clearInterval(intervalRef.current);
        }
      } catch (error) {
        console.error('Failed to poll status:', error);
      }
    };

    poll();
    intervalRef.current = setInterval(poll, 5000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [videoId, session]);

  const handleTimeUpdate = useCallback((time: number) => {
    setCurrentTime(time);
  }, []);

  const handleSeekTo = useCallback((time: number) => {
    videoRef.current?.seekTo(time);
  }, []);

  const handlePause = useCallback(() => {
    videoRef.current?.pause();
  }, []);

  const handlePlayingChange = useCallback((playing: boolean) => {
    setIsVideoPlaying(playing);
  }, []);

  const handleDurationChange = useCallback((duration: number) => {
    setVideoDuration(duration);
  }, []);

  const handleTogglePlay = useCallback(() => {
    videoRef.current?.togglePlay();
  }, []);

  const handleExport = async () => {
    if (!videoId || !session) return;
    setExporting(true);
    try {
      await triggerExport(videoId, session.access_token);
      setStatus('exporting');

      // Resume polling for export completion
      intervalRef.current = setInterval(async () => {
        try {
          const data = await getVideoStatus(videoId, session.access_token);
          setStatus(data.status);
          if (data.processedUrl) setProcessedUrl(data.processedUrl);
          if (data.status === 'completed' || data.status === 'failed') {
            if (intervalRef.current) clearInterval(intervalRef.current);
            setExporting(false);
          }
        } catch {
          // keep polling
        }
      }, 5000);
    } catch (error) {
      console.error('Failed to trigger export:', error);
      setExporting(false);
    }
  };

  if (status === 'processing') {
    return (
      <View className="flex-1 items-center justify-center bg-background p-5">
        <ActivityIndicator size="large" color="#8B5CF6" />
        <Text className="mt-5 text-lg text-foreground">
          Processing your video...
        </Text>
        <Text className="mt-2 text-sm text-muted-foreground">
          This may take a minute
        </Text>
      </View>
    );
  }

  if (status === 'exporting') {
    return (
      <View className="flex-1 items-center justify-center bg-background p-5">
        <ActivityIndicator size="large" color="#8B5CF6" />
        <Text className="mt-5 text-lg text-foreground">
          Exporting your video...
        </Text>
        <Text className="mt-2 text-sm text-muted-foreground">
          Burning captions into video
        </Text>
      </View>
    );
  }

  if (status === 'failed') {
    return (
      <View className="flex-1 items-center justify-center bg-background p-5">
        <Text className="mb-5 text-lg text-destructive">Processing failed</Text>
        <TouchableOpacity
          className="rounded-lg bg-primary px-8 py-3.5"
          onPress={() => router.back()}
        >
          <Text className="text-base font-semibold text-foreground">
            Try Again
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  // "transcribed" or "completed" — show captioned video
  return (
    <View className="flex-1 bg-background">
      {/* Video pinned at top */}
      {rawUrl && captionData && (
        <CaptionedVideo
          ref={videoRef}
          url={rawUrl}
          captionData={captionData}
          onTimeUpdate={handleTimeUpdate}
          onPlayingChange={handlePlayingChange}
          onDurationChange={handleDurationChange}
        />
      )}

      {/* Custom playback controls */}
      <VideoControls
        currentTime={currentTime}
        duration={videoDuration}
        isPlaying={isVideoPlaying}
        onTogglePlay={handleTogglePlay}
        onSeek={handleSeekTo}
      />

      {/* Toolbar */}
      <View className="flex-row items-center justify-between border-b border-b-border px-4 py-2">
        <TouchableOpacity
          className="flex-row items-center gap-1"
          onPress={() => router.back()}
        >
          <ArrowLeft size={16} className="text-accent" />
          <Text className="text-base font-medium text-accent">Back</Text>
        </TouchableOpacity>
        {processedUrl && (
          <Text className="text-xs font-medium text-success">Exported</Text>
        )}
      </View>

      {/* Caption editor fills remaining space */}
      {captionData && session && (
        <CaptionEditor
          captionData={captionData}
          currentTime={currentTime}
          duration={videoDuration}
          videoId={videoId!}
          accessToken={session.access_token}
          onCaptionDataChange={setCaptionData}
          onSeekTo={handleSeekTo}
          onPause={handlePause}
        />
      )}

      {/* Pinned bottom bar */}
      <View className="border-t border-t-border bg-background px-4 pb-7 pt-3">
        <TouchableOpacity
          className={`items-center rounded-xl bg-primary py-3.5 ${exporting ? 'opacity-50' : ''}`}
          onPress={handleExport}
          disabled={exporting}
        >
          <Text className="text-base font-semibold text-foreground">
            {exporting
              ? 'Exporting...'
              : status === 'completed'
                ? 'Re-export Video'
                : 'Export Video'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  video: {
    width: '100%',
    height: '100%',
  },
});
