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
  Animated,
  useColorScheme,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { THEME_COLORS } from '@/lib/theme';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEventListener } from 'expo';
import { ArrowLeft, Play, Pause, X, ChevronDown, Eye, Palette, PenLine, Download } from '@/lib/icons';
import { BottomSheet } from '@/components/BottomSheet';
import { useAuth } from '@/lib/auth';
import { getVideoStatus, processVideo, retryVideo, triggerExport } from '@/lib/api';
import { CaptionOverlay } from '@/components/CaptionOverlay';
import { CaptionEditor } from '@/components/CaptionEditor';
import { VideoControls } from '@/components/VideoControls';
import { normalizeCaptionTimings } from '@/lib/caption-utils';
import { CAPTION_STYLES, type CaptionStyleId, getCaptionStyle } from '@/lib/caption-styles';
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
    captionStyle?: CaptionStyleId;
    onTimeUpdate?: (time: number) => void;
    onPlayingChange?: (isPlaying: boolean) => void;
    onDurationChange?: (duration: number) => void;
    onBack?: () => void;
    compact?: boolean;
    onToggleCompact?: () => void;
    topInset?: number;
    bottomInset?: number;
  }
>(function CaptionedVideo(
  { url, captionData, captionStyle, onTimeUpdate, onPlayingChange, onDurationChange, onBack, compact, onToggleCompact, topInset = 0, bottomInset = 0 },
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
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [showControls, setShowControls] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEventListener(player, 'statusChange', (({ status }: any) => {
    if (status === 'readyToPlay' && player.duration > 0) {
      setVideoDuration(player.duration);
      onDurationChange?.(player.duration);
    }
  }) as any);

  (useEventListener as any)(player, 'videoSizeChange', ({ width, height }: { width: number; height: number }) => {
    if (width > 0 && height > 0) setNaturalSize({ width, height });
  });

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
    if (compact) {
      onToggleCompact?.();
      return;
    }
    setShowControls(true);
    scheduleHide();
    togglePlay();
  };

  const togglePlay = () => {
    if (isPlaying) {
      player.pause();
    } else {
      player.play();
    }
  };

  const screenWidth = Dimensions.get('window').width;
  const screenHeight = Dimensions.get('window').height;
  const containerHeight = naturalSize
    ? screenWidth * (naturalSize.height / naturalSize.width)
    : screenWidth * (16 / 9);
  // Clamp so compact mode never exceeds the natural height (e.g. landscape videos)
  const compactHeight = Math.min(screenHeight - topInset - bottomInset - 260, containerHeight);

  const animatedHeight = useRef(new Animated.Value(screenWidth * (16 / 9))).current;

  useEffect(() => {
    if (!compact) {
      animatedHeight.setValue(containerHeight);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [naturalSize?.width, naturalSize?.height]);

  useEffect(() => {
    Animated.timing(animatedHeight, {
      toValue: compact ? compactHeight : containerHeight,
      duration: 300,
      useNativeDriver: false,
    }).start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compact]);

  // Calculate letterbox insets so the overlay stays within the actual video frame
  const currentH = compact ? compactHeight : containerHeight;
  const videoAspect = naturalSize ? naturalSize.width / naturalSize.height : 9 / 16;
  const containerAspect = screenWidth / currentH;
  let overlayInsetX = 0;
  let overlayInsetY = 0;
  if (containerAspect > videoAspect) {
    overlayInsetX = (screenWidth - currentH * videoAspect) / 2;
  } else {
    overlayInsetY = (currentH - screenWidth / videoAspect) / 2;
  }

  const videoContent = (fullscreen: boolean) => (
    <Animated.View
      className={
        fullscreen ? 'flex-1 bg-black' : 'w-full overflow-hidden bg-background'
      }
      style={
        !fullscreen
          ? { height: animatedHeight }
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
        <CaptionOverlay
          currentTime={currentTime}
          captionData={captionData}
          captionStyle={captionStyle ? getCaptionStyle(captionStyle) : undefined}
          scale={compact ? compactHeight / containerHeight : 1}
          insetX={overlayInsetX}
          insetY={overlayInsetY}
        />
      )}

      {/* Back button at top-left */}
      {!fullscreen && onBack && (
        <TouchableOpacity
          className="absolute left-3 h-9 w-9 items-center justify-center rounded-full bg-primary"
          style={{ top: topInset + 12 }}
          onPress={onBack}
        >
          <ArrowLeft size={18} className="text-primary-foreground" />
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

      {/* Fullscreen exit button — only shown when in fullscreen */}
      {fullscreen && showControls && (
        <TouchableOpacity
          className="absolute right-4 top-[50px] h-9 w-9 items-center justify-center rounded-full bg-overlay"
          onPress={() => setIsFullscreen((f) => !f)}
        >
          <X size={18} className="text-foreground" />
        </TouchableOpacity>
      )}
    </Animated.View>
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

function StatusSkeleton() {
  const pulse = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.7, duration: 800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 800, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulse]);

  const videoHeight = Dimensions.get('window').height * 0.65;

  return (
    <View className="flex-1 bg-background">
      <Animated.View
        style={{ height: videoHeight, opacity: pulse }}
        className="w-full bg-secondary"
      />
      <View className="px-5 pt-6 gap-3">
        <Animated.View style={{ opacity: pulse }} className="h-4 w-32 rounded-md bg-secondary" />
        <Animated.View style={{ opacity: pulse }} className="h-3 w-56 rounded-md bg-secondary" />
        <Animated.View style={{ opacity: pulse }} className="mt-2 h-12 rounded-xl bg-secondary" />
      </View>
    </View>
  );
}

export default function StatusScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const primaryColor = THEME_COLORS[colorScheme === 'dark' ? 'dark' : 'light'].primary;
  const { videoId } = useLocalSearchParams<{ videoId: string }>();
  const { session } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('uploaded');
  const [rawUrl, setRawUrl] = useState<string | null>(null);
  const [captionData, setCaptionData] = useState<CaptionData | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [processedUrl, setProcessedUrl] = useState<string | null>(null);
  const [showExported, setShowExported] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState('en');
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);
  const [startingTranscription, setStartingTranscription] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState<CaptionStyleId>('classic');
  const [isEditMode, setIsEditMode] = useState(false);
  const [exportSheetOpen, setExportSheetOpen] = useState(false);
  const [viewsSheetOpen, setViewsSheetOpen] = useState(false);
  const [stylesSheetOpen, setStylesSheetOpen] = useState(false);
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
      } finally {
        setLoading(false);
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
    setShowExported(false);
    setExporting(true);
    try {
      await triggerExport(videoId, session.access_token, selectedStyle);
      setStatus('exporting');

      // Resume polling for export completion
      if (intervalRef.current) clearInterval(intervalRef.current);
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

  const selectedLangLabel =
    LANGUAGES.find((l) => l.code === selectedLanguage)?.label ??
    selectedLanguage;

  if (loading) {
    return <StatusSkeleton />;
  }

  if (status === 'uploaded') {
    return (
      <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
        {/* Video preview (same player as transcribed, no captions) */}
        {rawUrl && (
          <CaptionedVideo
            ref={videoRef}
            url={rawUrl}
            onTimeUpdate={handleTimeUpdate}
            onDurationChange={handleDurationChange}
            onBack={() => router.back()}
            topInset={insets.top}
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
                      <Text className="text-xs text-primary-foreground">✓</Text>
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
            <Text className="text-lg font-semibold text-primary-foreground">
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
        <ActivityIndicator size="large" color={primaryColor} />
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
        <ActivityIndicator size="large" color={primaryColor} />
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
          <Text className="text-base font-semibold text-primary-foreground">
            Try Again
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  // "transcribed" or "completed" — show captioned video
  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      {/* Video pinned at top */}
      {rawUrl && (
        <CaptionedVideo
          ref={videoRef}
          url={showExported && processedUrl ? processedUrl : rawUrl}
          captionData={showExported ? null : captionData}
          captionStyle={selectedStyle}
          onTimeUpdate={handleTimeUpdate}
          onDurationChange={handleDurationChange}
          onBack={() => router.back()}
          compact={isEditMode}
          onToggleCompact={() => setIsEditMode(false)}
          topInset={insets.top}
          bottomInset={insets.bottom}
        />
      )}

      {/* Middle area always fills remaining space so toolbar stays at bottom */}
      <View className="flex-1">
        {isEditMode && !showExported && captionData && session && (
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
      </View>

      {/* Bottom toolbar */}
      <View
        className="flex-row items-center border-t border-border bg-background"
        style={{ paddingTop: 10, paddingBottom: insets.bottom + 10 }}
      >
        <TouchableOpacity
          className="flex-1 items-center gap-1"
          onPress={() => setViewsSheetOpen(true)}
        >
          <View className="h-12 w-12 items-center justify-center rounded-full bg-secondary">
            <Eye size={20} className="text-foreground" />
          </View>
          <Text className="text-xs text-muted-foreground">Preview</Text>
        </TouchableOpacity>
        <TouchableOpacity
          className="flex-1 items-center gap-1"
          onPress={() => setIsEditMode((e) => !e)}
        >
          <View className={`h-12 w-12 items-center justify-center rounded-full ${isEditMode ? 'bg-primary' : 'bg-secondary'}`}>
            <PenLine size={20} className={isEditMode ? 'text-primary-foreground' : 'text-foreground'} />
          </View>
          <Text className="text-xs text-muted-foreground">Edit Captions</Text>
        </TouchableOpacity>
        <TouchableOpacity
          className="flex-1 items-center gap-1"
          onPress={() => setStylesSheetOpen(true)}
        >
          <View className="h-12 w-12 items-center justify-center rounded-full bg-secondary">
            <Palette size={20} className="text-foreground" />
          </View>
          <Text className="text-xs text-muted-foreground">Caption Style</Text>
        </TouchableOpacity>
        <TouchableOpacity
          className="flex-1 items-center gap-1"
          onPress={() => setExportSheetOpen(true)}
        >
          <View className="h-12 w-12 items-center justify-center rounded-full bg-secondary">
            <Download size={20} className="text-foreground" />
          </View>
          <Text className="text-xs text-muted-foreground">Export Video</Text>
        </TouchableOpacity>
      </View>

      {/* Views sheet */}
      <BottomSheet
        visible={viewsSheetOpen}
        onClose={() => setViewsSheetOpen(false)}
        title="View"
      >
        <TouchableOpacity
          className="flex-row items-center justify-between rounded-xl bg-secondary px-4 py-4 mb-2"
          onPress={() => { setShowExported(false); setViewsSheetOpen(false); }}
        >
          <Text className="text-base font-medium text-foreground">Preview</Text>
          {!showExported && (
            <View className="h-5 w-5 items-center justify-center rounded-full bg-primary">
              <Text className="text-xs text-primary-foreground">✓</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          className={`flex-row items-center justify-between rounded-xl bg-secondary px-4 py-4 ${!processedUrl ? 'opacity-40' : ''}`}
          onPress={() => {
            if (!processedUrl) return;
            setShowExported(true);
            setViewsSheetOpen(false);
          }}
          disabled={!processedUrl}
        >
          <Text className="text-base font-medium text-foreground">Exported</Text>
          {showExported && (
            <View className="h-5 w-5 items-center justify-center rounded-full bg-primary">
              <Text className="text-xs text-primary-foreground">✓</Text>
            </View>
          )}
        </TouchableOpacity>
      </BottomSheet>

      {/* Styles sheet */}
      <BottomSheet
        visible={stylesSheetOpen}
        onClose={() => setStylesSheetOpen(false)}
        title="Caption Style"
      >
        {CAPTION_STYLES.map((s) => (
          <TouchableOpacity
            key={s.id}
            className="flex-row items-center justify-between rounded-xl bg-secondary px-4 py-4 mb-2"
            onPress={() => { setSelectedStyle(s.id); setStylesSheetOpen(false); }}
          >
            <View className="flex-row items-center gap-3">
              <View
                className="h-5 w-5 rounded-full border-2 border-border"
                style={{ backgroundColor: s.activeWordColor }}
              />
              <Text className="text-base font-medium text-foreground">{s.label}</Text>
            </View>
            {selectedStyle === s.id && (
              <View className="h-5 w-5 items-center justify-center rounded-full bg-primary">
                <Text className="text-xs text-primary-foreground">✓</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </BottomSheet>

      {/* Export confirmation sheet */}
      <BottomSheet
        visible={exportSheetOpen}
        onClose={() => setExportSheetOpen(false)}
        title={processedUrl ? 'Re-export Video' : 'Export Video'}
      >
        <View className="flex-row items-center gap-3 rounded-xl bg-secondary px-4 py-4 mb-4">
          <View
            className="h-5 w-5 rounded-full border-2 border-border"
            style={{ backgroundColor: getCaptionStyle(selectedStyle).activeWordColor }}
          />
          <Text className="text-base text-foreground">
            Style: <Text className="font-semibold">{getCaptionStyle(selectedStyle).label}</Text>
          </Text>
        </View>
        <TouchableOpacity
          className={`items-center rounded-xl bg-primary py-4 ${exporting ? 'opacity-50' : ''}`}
          onPress={() => { handleExport(); setExportSheetOpen(false); }}
          disabled={exporting}
        >
          <Text className="text-base font-semibold text-primary-foreground">
            {exporting ? 'Exporting…' : processedUrl ? 'Re-export' : 'Export'}
          </Text>
        </TouchableOpacity>
      </BottomSheet>

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
