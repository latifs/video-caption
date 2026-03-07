import { View, Text, StyleSheet } from "react-native";
import type { CaptionData } from "types";
import {
  findActiveSegment,
  findActiveWordIndex,
  findActiveOverlays,
} from "@/lib/caption-utils";

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
    currentTime
  );
  const activeOverlays = findActiveOverlays(
    captionData.overlayTrack,
    currentTime
  );

  const activeWordIndex = activeSegment
    ? findActiveWordIndex(activeSegment.words, currentTime)
    : -1;

  return (
    <View style={styles.container} pointerEvents="none">
      {/* Speech captions */}
      {activeSegment && (
        <View style={styles.speechContainer}>
          <View style={styles.speechBackground}>
            <Text style={styles.speechText}>
              {activeSegment.words.map((word, i) => (
                <Text
                  key={`${word.start}-${i}`}
                  style={i === activeWordIndex ? styles.activeWord : undefined}
                >
                  {i > 0 ? " " : ""}
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
          style={[
            styles.overlayContainer,
            {
              top: `${overlay.position.y * 100}%`,
              alignItems:
                overlay.position.x === "left"
                  ? "flex-start"
                  : overlay.position.x === "right"
                    ? "flex-end"
                    : "center",
            },
          ]}
        >
          <View
            style={[
              styles.overlayBackground,
              {
                backgroundColor: overlay.style.backgroundColor,
                opacity: overlay.style.backgroundOpacity,
              },
            ]}
          />
          <Text
            style={[
              styles.overlayText,
              {
                fontSize: overlay.style.fontSize,
                color: overlay.style.color,
              },
            ]}
          >
            {overlay.text}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
  },
  speechContainer: {
    position: "absolute",
    bottom: "10%",
    left: 16,
    right: 16,
    alignItems: "center",
  },
  speechBackground: {
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  speechText: {
    color: "#ffffff",
    fontSize: 16,
    textAlign: "center",
  },
  activeWord: {
    fontWeight: "bold",
    color: "#FFD700",
  },
  overlayContainer: {
    position: "absolute",
    left: 16,
    right: 16,
  },
  overlayBackground: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 4,
  },
  overlayText: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    textAlign: "center",
  },
});
