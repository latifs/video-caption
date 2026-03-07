import {
  useEffect,
  useState,
  useRef,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";
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
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEventListener } from "expo";
import { useAuth } from "@/lib/auth";
import { getVideoStatus, triggerExport } from "@/lib/api";
import { usePlaybackTime } from "@/hooks/usePlaybackTime";
import { CaptionOverlay } from "@/components/CaptionOverlay";
import { CaptionEditor } from "@/components/CaptionEditor";
import { normalizeCaptionTimings } from "@/lib/caption-utils";
import type { CaptionData } from "types";

interface CaptionedVideoHandle {
  seekTo: (time: number) => void;
}

const CaptionedVideo = forwardRef<
  CaptionedVideoHandle,
  {
    url: string;
    captionData: CaptionData;
    onTimeUpdate?: (time: number) => void;
  }
>(function CaptionedVideo({ url, captionData, onTimeUpdate }, ref) {
  const player = useVideoPlayer(url, (p) => {
    p.timeUpdateEventInterval = 0.1;
  });
  const currentTime = usePlaybackTime(player);

  useImperativeHandle(ref, () => ({
    seekTo: (time: number) => {
      player.currentTime = time;
    },
  }), [player]);

  useEffect(() => {
    onTimeUpdate?.(currentTime);
  }, [currentTime, onTimeUpdate]);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEventListener(player, "playingChange", ({ isPlaying: playing }) => {
    setIsPlaying(playing);
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
    <View style={fullscreen ? styles.fsRoot : styles.videoContainer}>
      <VideoView
        player={player}
        style={styles.video}
        contentFit="contain"
        allowsFullscreen={false}
        allowsPictureInPicture={!fullscreen}
        nativeControls={!fullscreen}
      />

      {/* Tap target for fullscreen controls */}
      {fullscreen && (
        <Pressable style={StyleSheet.absoluteFill} onPress={handleTap}>
          {showControls && (
            <View style={styles.fsControls}>
              <TouchableOpacity
                style={styles.fsPlayButton}
                onPress={togglePlay}
              >
                <Text style={styles.fsPlayIcon}>
                  {isPlaying ? "\u23F8" : "\u25B6"}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </Pressable>
      )}

      <CaptionOverlay currentTime={currentTime} captionData={captionData} />

      {(!fullscreen || showControls) && (
        <TouchableOpacity
          style={[
            styles.fullscreenButton,
            fullscreen && styles.fullscreenButtonFs,
          ]}
          onPress={() => setIsFullscreen((f) => !f)}
        >
          <Text style={styles.fullscreenButtonText}>
            {fullscreen ? "\u2715" : "\u26F6"}
          </Text>
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
        supportedOrientations={["portrait", "landscape"]}
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
  const [status, setStatus] = useState("processing");
  const [rawUrl, setRawUrl] = useState<string | null>(null);
  const [processedUrl, setProcessedUrl] = useState<string | null>(null);
  const [captionData, setCaptionData] = useState<CaptionData | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
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
          data.status === "transcribed" ||
          data.status === "completed" ||
          data.status === "failed"
        ) {
          if (intervalRef.current) clearInterval(intervalRef.current);
        }
      } catch (error) {
        console.error("Failed to poll status:", error);
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

  const handleExport = async () => {
    if (!videoId || !session) return;
    setExporting(true);
    try {
      await triggerExport(videoId, session.access_token);
      setStatus("exporting");

      // Resume polling for export completion
      intervalRef.current = setInterval(async () => {
        try {
          const data = await getVideoStatus(videoId, session.access_token);
          setStatus(data.status);
          if (data.processedUrl) setProcessedUrl(data.processedUrl);
          if (data.status === "completed" || data.status === "failed") {
            if (intervalRef.current) clearInterval(intervalRef.current);
            setExporting(false);
          }
        } catch {
          // keep polling
        }
      }, 5000);
    } catch (error) {
      console.error("Failed to trigger export:", error);
      setExporting(false);
    }
  };

  if (status === "processing") {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.statusText}>Processing your video...</Text>
        <Text style={styles.hint}>This may take a minute</Text>
      </View>
    );
  }

  if (status === "exporting") {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.statusText}>Exporting your video...</Text>
        <Text style={styles.hint}>Burning captions into video</Text>
      </View>
    );
  }

  if (status === "failed") {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Processing failed</Text>
        <TouchableOpacity
          style={styles.button}
          onPress={() => router.back()}
        >
          <Text style={styles.buttonText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // "transcribed" or "completed" — show captioned video
  return (
    <View style={styles.editorContainer}>
      {/* Video pinned at top */}
      {rawUrl && captionData && (
        <CaptionedVideo
          ref={videoRef}
          url={rawUrl}
          captionData={captionData}
          onTimeUpdate={handleTimeUpdate}
        />
      )}

      {/* Toolbar */}
      <View style={styles.toolbar}>
        <TouchableOpacity onPress={() => router.replace("/")}>
          <Text style={styles.toolbarLink}>← Back</Text>
        </TouchableOpacity>
        {processedUrl && (
          <Text style={styles.toolbarHint}>Exported</Text>
        )}
      </View>

      {/* Caption editor fills remaining space */}
      {captionData && session && (
        <CaptionEditor
          captionData={captionData}
          currentTime={currentTime}
          videoId={videoId!}
          accessToken={session.access_token}
          onCaptionDataChange={(data) => setCaptionData(normalizeCaptionTimings(data))}
          onSeekTo={handleSeekTo}
        />
      )}

      {/* Pinned bottom bar */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.exportButton, exporting && styles.buttonDisabled]}
          onPress={handleExport}
          disabled={exporting}
        >
          <Text style={styles.exportButtonText}>
            {exporting
              ? "Exporting..."
              : status === "completed"
                ? "Re-export Video"
                : "Export Video"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  editorContainer: {
    flex: 1,
    backgroundColor: "#fff",
  },
  toolbar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e0e0e0",
  },
  toolbarLink: {
    color: "#007AFF",
    fontSize: 16,
    fontWeight: "500",
  },
  toolbarHint: {
    fontSize: 13,
    color: "#34C759",
    fontWeight: "500",
  },
  bottomBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 28,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e0e0e0",
    backgroundColor: "#fff",
  },
  exportButton: {
    backgroundColor: "#007AFF",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  exportButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  videoContainer: {
    width: "100%",
    height: Dimensions.get("window").height * 0.5,
    overflow: "hidden",
    backgroundColor: "#000",
  },
  fsRoot: {
    flex: 1,
    backgroundColor: "#000",
  },
  video: {
    width: "100%",
    height: "100%",
  },
  fullscreenButton: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  fullscreenButtonFs: {
    top: 50,
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  fullscreenButtonText: {
    color: "#fff",
    fontSize: 18,
  },
  fsControls: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  fsPlayButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  fsPlayIcon: {
    color: "#fff",
    fontSize: 28,
  },
  statusText: {
    fontSize: 18,
    marginTop: 20,
    color: "#333",
  },
  hint: {
    fontSize: 14,
    color: "#999",
    marginTop: 8,
  },
  errorText: {
    fontSize: 18,
    color: "#FF3B30",
    marginBottom: 20,
  },
  button: {
    backgroundColor: "#007AFF",
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
