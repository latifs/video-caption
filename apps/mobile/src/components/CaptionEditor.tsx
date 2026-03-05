import { useState } from "react";
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
} from "react-native";
import { updateSpeechText, addOverlay, deleteOverlay } from "@/lib/api";
import { findActiveWordIndex } from "@/lib/caption-utils";
import type { CaptionData, SpeechSegment } from "types";

interface CaptionEditorProps {
  captionData: CaptionData;
  currentTime: number;
  videoId: string;
  accessToken: string;
  onCaptionDataChange: (captionData: CaptionData) => void;
  onSeekTo: (time: number) => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function findActiveSegmentIndex(
  segments: SpeechSegment[],
  time: number
): number {
  for (let i = 0; i < segments.length; i++) {
    if (time >= segments[i].start && time <= segments[i].end) return i;
  }
  // Between segments — find the closest upcoming one
  for (let i = 0; i < segments.length; i++) {
    if (segments[i].start > time) return i;
  }
  // Past the end — show last segment
  return segments.length - 1;
}

export function CaptionEditor({
  captionData,
  currentTime,
  videoId,
  accessToken,
  onCaptionDataChange,
  onSeekTo,
}: CaptionEditorProps) {
  const [editModal, setEditModal] = useState<{
    segmentIndex: number;
    wordIndex: number;
    text: string;
  } | null>(null);
  const [overlayModal, setOverlayModal] = useState<{
    text: string;
    start: number;
    end: number;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  // Track which word is highlighted on tap — cleared when playback moves past it
  const [selectedWord, setSelectedWord] = useState<{
    segmentIndex: number;
    wordIndex: number;
  } | null>(null);

  const segments = captionData.speechTrack.segments;
  if (segments.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.emptyText}>No captions detected</Text>
      </View>
    );
  }

  const activeIdx = findActiveSegmentIndex(segments, currentTime);
  const segment = segments[activeIdx];

  // Clear tap-selection when playback moves past the selected word
  if (selectedWord) {
    if (selectedWord.segmentIndex !== activeIdx) {
      setSelectedWord(null);
    } else {
      const selWord = segment.words[selectedWord.wordIndex];
      if (selWord && currentTime > selWord.end + 0.15) {
        setSelectedWord(null);
      }
    }
  }

  // Overlays that overlap this segment's time range
  const segmentOverlays = captionData.overlayTrack.filter(
    (o) => o.start < segment.end && o.end > segment.start
  );

  // --- Word interactions: tap = seek & highlight, long-press = edit ---
  const handleWordSeek = (wordIndex: number, wordStart: number) => {
    setSelectedWord({ segmentIndex: activeIdx, wordIndex });
    onSeekTo(wordStart);
  };

  const handleWordEdit = (wordIndex: number, currentText: string) => {
    if (Platform.OS === "ios") {
      Alert.prompt(
        "Edit Word",
        `Change "${currentText}" to:`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Save",
            onPress: (newText) => {
              if (newText && newText !== currentText) {
                submitWordEdit(activeIdx, wordIndex, newText);
              }
            },
          },
        ],
        "plain-text",
        currentText
      );
    } else {
      setEditModal({ segmentIndex: activeIdx, wordIndex, text: currentText });
    }
  };

  const submitWordEdit = async (
    segmentIndex: number,
    wordIndex: number,
    newText: string
  ) => {
    setSaving(true);
    try {
      const result = await updateSpeechText(
        videoId,
        [{ segmentIndex, wordIndex, newText }],
        accessToken
      );
      onCaptionDataChange(result.captionData);
    } catch {
      Alert.alert("Error", "Failed to update caption.");
    } finally {
      setSaving(false);
    }
  };

  const handleEditModalSave = () => {
    if (!editModal) return;
    const { segmentIndex, wordIndex, text } = editModal;
    const original = segments[segmentIndex].words[wordIndex].word;
    setEditModal(null);
    if (text && text !== original) submitWordEdit(segmentIndex, wordIndex, text);
  };

  // --- Overlay add/delete ---
  const handleAddOverlay = () => {
    setOverlayModal({
      text: "",
      start: segment.start,
      end: segment.end,
    });
  };

  const submitOverlay = async () => {
    if (!overlayModal) return;
    const { text, start, end } = overlayModal;
    if (!text.trim()) {
      Alert.alert("Error", "Text cannot be empty.");
      return;
    }
    setSaving(true);
    try {
      const result = await addOverlay(
        videoId,
        { text: text.trim(), start, end },
        accessToken
      );
      onCaptionDataChange({
        ...captionData,
        overlayTrack: [...captionData.overlayTrack, result.overlay],
      });
      setOverlayModal(null);
    } catch {
      Alert.alert("Error", "Failed to add overlay.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteOverlay = (overlayId: string) => {
    Alert.alert("Delete Overlay", "Remove this overlay?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteOverlay(videoId, overlayId, accessToken);
            onCaptionDataChange({
              ...captionData,
              overlayTrack: captionData.overlayTrack.filter(
                (o) => o.id !== overlayId
              ),
            });
          } catch {
            Alert.alert("Error", "Failed to delete overlay.");
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      {/* Segment navigation */}
      <View style={styles.segmentNav}>
        <Text style={styles.segmentTime}>
          {formatTime(segment.start)} – {formatTime(segment.end)}
        </Text>
        <Text style={styles.segmentCount}>
          {activeIdx + 1} / {segments.length}
        </Text>
      </View>

      {/* Active caption words */}
      <View style={[styles.captionCard, styles.captionCardActive]}>
        <View style={styles.wordsRow}>
          {segment.words.map((word, wIdx) => {
            // Tap highlight takes priority, otherwise follow playback
            const isActiveWord =
              selectedWord?.segmentIndex === activeIdx
                ? selectedWord.wordIndex === wIdx
                : findActiveWordIndex(segment.words, currentTime) === wIdx;
            return (
              <Pressable
                key={`w-${activeIdx}-${wIdx}`}
                onPress={() => handleWordSeek(wIdx, word.start)}
                onLongPress={() => handleWordEdit(wIdx, word.word)}
                disabled={saving}
                style={[
                  styles.wordTouchable,
                  isActiveWord && styles.wordTouchableActive,
                ]}
              >
                <Text
                  style={[
                    styles.wordText,
                    isActiveWord && styles.wordTextActive,
                    saving && styles.wordSaving,
                  ]}
                >
                  {word.word}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.tapHint}>Tap to seek · Hold to edit</Text>
      </View>

      {/* Overlays in this segment */}
      {segmentOverlays.map((overlay) => (
        <View key={overlay.id} style={styles.overlayCard}>
          <View style={styles.overlayBadge}>
            <Text style={styles.overlayBadgeText}>OVERLAY</Text>
          </View>
          <View style={styles.overlayBody}>
            <View style={styles.overlayInfo}>
              <Text style={styles.overlayText}>{overlay.text}</Text>
              <Text style={styles.overlayTime}>
                {formatTime(overlay.start)} – {formatTime(overlay.end)}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => handleDeleteOverlay(overlay.id)}
              style={styles.deleteButton}
            >
              <Text style={styles.deleteButtonText}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}

      {/* Add overlay */}
      <TouchableOpacity style={styles.addButton} onPress={handleAddOverlay}>
        <Text style={styles.addButtonText}>
          + Add overlay at {formatTime(segment.start)}
        </Text>
      </TouchableOpacity>

      {/* Android word-edit modal */}
      <Modal visible={editModal !== null} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Word</Text>
            <TextInput
              style={styles.modalInput}
              value={editModal?.text ?? ""}
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

      {/* Add overlay modal */}
      <Modal visible={overlayModal !== null} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Overlay</Text>
            <Text style={styles.modalTimeLabel}>
              Appears at {overlayModal ? formatTime(overlayModal.start) : ""} –{" "}
              {overlayModal ? formatTime(overlayModal.end) : ""}
            </Text>
            <TextInput
              style={styles.modalInput}
              value={overlayModal?.text ?? ""}
              onChangeText={(t) =>
                setOverlayModal((prev) => (prev ? { ...prev, text: t } : null))
              }
              placeholder="Overlay text..."
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                onPress={() => setOverlayModal(null)}
                style={styles.modalButton}
              >
                <Text style={styles.modalButtonCancel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={submitOverlay}
                style={styles.modalButton}
                disabled={saving}
              >
                <Text
                  style={[
                    styles.modalButtonSave,
                    saving && { opacity: 0.5 },
                  ]}
                >
                  {saving ? "Adding..." : "Add"}
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
    color: "#999",
    textAlign: "center",
    marginTop: 20,
  },
  segmentNav: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  segmentTime: {
    fontSize: 14,
    fontWeight: "600",
    color: "#555",
  },
  segmentCount: {
    fontSize: 13,
    color: "#999",
  },
  captionCard: {
    backgroundColor: "#f5f5f5",
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: "transparent",
  },
  captionCardActive: {
    borderColor: "#007AFF",
    backgroundColor: "rgba(0, 122, 255, 0.04)",
  },
  wordsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  wordTouchable: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: "rgba(0, 0, 0, 0.06)",
  },
  wordTouchableActive: {
    backgroundColor: "#007AFF",
  },
  wordText: {
    fontSize: 16,
    color: "#222",
  },
  wordTextActive: {
    color: "#fff",
    fontWeight: "700",
  },
  wordSaving: {
    opacity: 0.5,
  },
  tapHint: {
    fontSize: 11,
    color: "#bbb",
    marginTop: 8,
  },
  overlayCard: {
    backgroundColor: "#FFF8E1",
    borderRadius: 10,
    marginBottom: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#FFE082",
  },
  overlayBadge: {
    backgroundColor: "#FFD54F",
    paddingHorizontal: 10,
    paddingVertical: 3,
    alignSelf: "flex-start",
    borderBottomRightRadius: 6,
  },
  overlayBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#5D4037",
    letterSpacing: 0.5,
  },
  overlayBody: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
  },
  overlayInfo: {
    flex: 1,
  },
  overlayText: {
    fontSize: 15,
    color: "#333",
  },
  overlayTime: {
    fontSize: 12,
    color: "#999",
    marginTop: 2,
  },
  deleteButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 59, 48, 0.1)",
    marginLeft: 8,
  },
  deleteButtonText: {
    color: "#FF3B30",
    fontSize: 13,
    fontWeight: "600",
  },
  addButton: {
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ccc",
    borderStyle: "dashed",
  },
  addButtonText: {
    color: "#666",
    fontSize: 14,
  },
  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 20,
    width: "85%",
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "600",
    marginBottom: 12,
  },
  modalTimeLabel: {
    fontSize: 13,
    color: "#888",
    marginBottom: 12,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 16,
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
  },
  modalButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  modalButtonCancel: {
    fontSize: 16,
    color: "#999",
  },
  modalButtonSave: {
    fontSize: 16,
    color: "#007AFF",
    fontWeight: "600",
  },
});
