import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Platform,
  TextInput,
  Modal,
} from "react-native";
import { updateSpeechText } from "@/lib/api";
import type { CaptionData } from "types";

interface TranscriptPanelProps {
  captionData: CaptionData;
  currentTime: number;
  videoId: string;
  accessToken: string;
  onCaptionDataChange: (captionData: CaptionData) => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function TranscriptPanel({
  captionData,
  currentTime,
  videoId,
  accessToken,
  onCaptionDataChange,
}: TranscriptPanelProps) {
  const [editModal, setEditModal] = useState<{
    segmentIndex: number;
    wordIndex: number;
    text: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  const segments = captionData.speechTrack.segments;

  const handleWordPress = (
    segmentIndex: number,
    wordIndex: number,
    currentText: string
  ) => {
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
                submitEdit(segmentIndex, wordIndex, newText);
              }
            },
          },
        ],
        "plain-text",
        currentText
      );
    } else {
      setEditModal({ segmentIndex, wordIndex, text: currentText });
    }
  };

  const submitEdit = async (
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
    } catch (error) {
      Alert.alert("Error", "Failed to update caption text.");
      console.error("Failed to update speech text:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleModalSave = () => {
    if (!editModal) return;
    const { segmentIndex, wordIndex, text } = editModal;
    const originalText = segments[segmentIndex].words[wordIndex].word;
    setEditModal(null);
    if (text && text !== originalText) {
      submitEdit(segmentIndex, wordIndex, text);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Transcript</Text>
      {segments.map((segment, segIdx) => {
        const isActive =
          currentTime >= segment.start && currentTime <= segment.end;
        return (
          <View
            key={`seg-${segIdx}`}
            style={[styles.segment, isActive && styles.segmentActive]}
          >
            <Text style={styles.timestamp}>{formatTime(segment.start)}</Text>
            <View style={styles.wordsRow}>
              {segment.words.map((word, wIdx) => (
                <TouchableOpacity
                  key={`w-${segIdx}-${wIdx}`}
                  onPress={() => handleWordPress(segIdx, wIdx, word.word)}
                  disabled={saving}
                  style={styles.wordTouchable}
                >
                  <Text style={[styles.wordText, saving && styles.wordSaving]}>
                    {word.word}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        );
      })}

      {/* Android edit modal (Alert.prompt is iOS-only) */}
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
                onPress={handleModalSave}
                style={styles.modalButton}
              >
                <Text style={styles.modalButtonSave}>Save</Text>
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
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  heading: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 12,
    color: "#333",
  },
  segment: {
    flexDirection: "row",
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 6,
    marginBottom: 4,
  },
  segmentActive: {
    backgroundColor: "rgba(0, 122, 255, 0.08)",
  },
  timestamp: {
    fontSize: 12,
    color: "#999",
    width: 36,
    marginTop: 2,
  },
  wordsRow: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  wordTouchable: {
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: "rgba(0, 0, 0, 0.04)",
  },
  wordText: {
    fontSize: 15,
    color: "#222",
  },
  wordSaving: {
    opacity: 0.5,
  },
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
    width: "80%",
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "600",
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
