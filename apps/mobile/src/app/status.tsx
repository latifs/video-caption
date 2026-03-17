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
  ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEventListener } from 'expo';
import { ArrowLeft, Play, Pause, X, Maximize, ChevronDown } from '@/lib/icons';
import { useAuth } from '@/lib/auth';
import { getVideoStatus, processVideo, retryVideo, triggerExport } from '@/lib/api';
import { CaptionOverlay } from '@/components/CaptionOverlay';
import { CaptionEditor } from '@/components/CaptionEditor';
import { VideoControls } from '@/components/VideoControls';
import { normalizeCaptionTimings } from '@/lib/caption-utils';
import type { CaptionData } from 'types';

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'ar', label: 'Arabic' },
  { code: 'zh', label: 'Chinese' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'hi', label: 'Hindi' },
  { code: 'it', label: 'Italian' },
  { code: 'ru', label: 'Russian' },
  { code: 'nl', label: 'Dutch' },
  { code: 'tr', label: 'Turkish' },
];

interface CaptionedVideoHandle {
  seekTo: (time: number) => void;
  pause: () => void;
  togglePlay: () => void;
}

const CaptionedVideo = forwardRef<
  CaptionedVideoHandle,
  {
    url: string;
    captionData?: CaptionData | null;
    onTimeUpdate?: (time: number) => void;
    onPlayingChange?: (isPlaying: boolean) => void;
    onDurationChange?: (duration: number) => void;
    onBack?: () => void;
  }
>(function CaptionedVideo(
  { url, captionData, onTimeUpdate, onPlayingChange, onDurationChange, onBack },
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
  const [videoDuration, setVideoDuration] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEventListener(player, 'statusChange', (({ status }: any) => {
    if (status === 'readyToPlay' && player.duration > 0) {
      setVideoDuration(player.duration);
      onDurationChange?.(player.duration);
    }
  }) as any);

  useEventListener(player, 'playingChange', ({ isPlaying: playing }) => {
    setIsPlaying(playing);
    onPlayingChange?.(playing);
    // Also report duration on first play, in case statusChange missed it
    if (playing && player.duration > 0) {
      setVideoDuration(player.duration);
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
        fullscreen ? 'flex-1 bg-black' : 'w-full overflow-hidden bg-background'
      }
      style={
        !fullscreen
          ? { height: Dimensions.get('window').height * 0.65 }
          : undefined
      }
    >
      <VideoView
        player={player}
        style={styles.video}
        contentFit="contain"
        allowsPictureInPicture={!fullscreen}
        nativeControls={false}
      />

      {/* Tap target to show/hide controls */}
      <Pressable style={StyleSheet.absoluteFill} onPress={handleTap}>
        {fullscreen && showControls && (
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

      {captionData && (
        <CaptionOverlay currentTime={currentTime} captionData={captionData} />
      )}

      {/* Back button at top-left */}
      {!fullscreen && onBack && (
        <TouchableOpacity
          className="absolute left-3 top-[50px] h-9 w-9 items-center justify-center rounded-full bg-primary"
          onPress={onBack}
        >
          <ArrowLeft size={18} className="text-foreground" />
        </TouchableOpacity>
      )}

      {/* Controls overlay at bottom of video */}
      {(!fullscreen || showControls) && (
        <View style={controlsOverlayStyles.bottom}>
          <VideoControls
            currentTime={currentTime}
            duration={videoDuration}
            isPlaying={isPlaying}
            onTogglePlay={togglePlay}
            onSeek={(time) => {
              if (typeof time === 'number' && isFinite(time)) {
                player.currentTime = time;
              }
            }}
          />
        </View>
      )}

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
  const [status, setStatus] = useState('uploaded');
  const [rawUrl, setRawUrl] = useState<string | null>(null);
  const [captionData, setCaptionData] = useState<CaptionData | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState('en');
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);
  const [startingTranscription, setStartingTranscription] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoRef = useRef<CaptionedVideoHandle>(null);

  useEffect(() => {
    if (!videoId || !session) return;

    const poll = async () => {
      try {
        const data = await getVideoStatus(videoId, session.access_token);
        setStatus(data.status);
        if (data.rawUrl) setRawUrl(data.rawUrl);

        if (data.captionData)
          setCaptionData(normalizeCaptionTimings(data.captionData));

        // Stop polling for resting/terminal states
        if (
          data.status === 'uploaded' ||
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

  const handleStartTranscription = async () => {
    if (!videoId || !session) return;
    setStartingTranscription(true);
    try {
      await processVideo(videoId, selectedLanguage, session.access_token);
      setStatus('processing');

      // Resume polling
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(async () => {
        try {
          const data = await getVideoStatus(videoId, session.access_token);
          setStatus(data.status);
          if (data.rawUrl) setRawUrl(data.rawUrl);
          if (data.captionData)
            setCaptionData(normalizeCaptionTimings(data.captionData));
          if (
            data.status === 'transcribed' ||
            data.status === 'completed' ||
            data.status === 'failed'
          ) {
            if (intervalRef.current) clearInterval(intervalRef.current);
          }
        } catch {
          // keep polling
        }
      }, 5000);
    } catch (error) {
      console.error('Failed to start transcription:', error);
    } finally {
      setStartingTranscription(false);
    }
  };

  const handleTimeUpdate = useCallback((time: number) => {
    setCurrentTime(time);
  }, []);

  const handleSeekTo = useCallback((time: number) => {
    videoRef.current?.seekTo(time);
  }, []);

  const handlePause = useCallback(() => {
    videoRef.current?.pause();
  }, []);

  const handleDurationChange = useCallback((duration: number) => {
    setVideoDuration(duration);
  }, []);

  const handleExport = async () => {
    if (!videoId || !session) return;
    setExporting(true);
    try {
      await triggerExport(videoId, session.access_token);
      setStatus('exporting');

      // Resume polling for export completion
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(async () => {
        try {
          const data = await getVideoStatus(videoId, session.access_token);
          setStatus(data.status);

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

  const selectedLangLabel =
    LANGUAGES.find((l) => l.code === selectedLanguage)?.label ??
    selectedLanguage;

  if (status === 'uploaded') {
    return (
      <View className="flex-1 bg-background">
        {/* Video preview (same player as transcribed, no captions) */}
        {rawUrl && (
          <CaptionedVideo
            ref={videoRef}
            url={rawUrl}
            onTimeUpdate={handleTimeUpdate}
            onDurationChange={handleDurationChange}
            onBack={() => router.back()}
          />
        )}

        {/* Language picker */}
        <View className="px-5 pt-6">
          <Text className="mb-2 text-base font-semibold text-foreground">
            Select Language
          </Text>
          <Text className="mb-4 text-sm text-muted-foreground">
            Choose the language spoken in the video
          </Text>

          <TouchableOpacity
            className="flex-row items-center justify-between rounded-xl border border-border bg-secondary px-4 py-3.5"
            onPress={() => setShowLanguagePicker(true)}
          >
            <Text className="text-base text-foreground">
              {selectedLangLabel}
            </Text>
            <ChevronDown size={18} className="text-muted-foreground" />
          </TouchableOpacity>
        </View>

        {/* Language picker modal */}
        <Modal
          visible={showLanguagePicker}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setShowLanguagePicker(false)}
        >
          <View className="flex-1 bg-background">
            <View className="flex-row items-center justify-between border-b border-b-border px-5 pb-4 pt-16">
              <Text className="text-lg font-semibold text-foreground">
                Select Language
              </Text>
              <TouchableOpacity onPress={() => setShowLanguagePicker(false)}>
                <Text className="text-base font-medium text-accent">Done</Text>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
              {LANGUAGES.map((lang) => (
                <TouchableOpacity
                  key={lang.code}
                  className="flex-row items-center justify-between border-b border-b-border px-5 py-4"
                  onPress={() => {
                    setSelectedLanguage(lang.code);
                    setShowLanguagePicker(false);
                  }}
                >
                  <Text className="text-base text-foreground">
                    {lang.label}
                  </Text>
                  {selectedLanguage === lang.code && (
                    <View className="h-5 w-5 items-center justify-center rounded-full bg-primary">
                      <Text className="text-xs text-foreground">✓</Text>
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </Modal>

        {/* Start Transcription button */}
        <View className="absolute inset-x-0 bottom-0 border-t border-t-border bg-background px-5 pb-9 pt-3">
          <TouchableOpacity
            className={`items-center rounded-xl bg-primary py-4 ${startingTranscription ? 'opacity-50' : ''}`}
            onPress={handleStartTranscription}
            disabled={startingTranscription}
          >
            <Text className="text-lg font-semibold text-foreground">
              {startingTranscription ? 'Starting...' : 'Start Transcription'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

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
    const handleRetry = async () => {
      if (!videoId || !session) return;
      try {
        await retryVideo(videoId, session.access_token);
        setStatus('uploaded');
      } catch (error) {
        console.error('Failed to retry:', error);
      }
    };

    return (
      <View className="flex-1 items-center justify-center bg-background p-5">
        <Text className="mb-5 text-lg text-destructive">Processing failed</Text>
        <TouchableOpacity
          className="rounded-lg bg-primary px-8 py-3.5"
          onPress={handleRetry}
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
      {rawUrl && (
        <CaptionedVideo
          ref={videoRef}
          url={rawUrl}
          captionData={captionData}
          onTimeUpdate={handleTimeUpdate}
          onDurationChange={handleDurationChange}
          onBack={() => router.back()}
        />
      )}

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

const controlsOverlayStyles = StyleSheet.create({
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 8,
  },
});
