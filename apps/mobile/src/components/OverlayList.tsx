import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
} from "react-native";
import { addOverlay, deleteOverlay } from "@/lib/api";
import type { CaptionData } from "types";

interface OverlayListProps {
  captionData: CaptionData;
  durationSec: number;
  videoId: string;
  accessToken: string;
  onCaptionDataChange: (captionData: CaptionData) => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function OverlayList({
  captionData,
  durationSec,
  videoId,
  accessToken,
  onCaptionDataChange,
}: OverlayListProps) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [newText, setNewText] = useState("");
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");
  const [saving, setSaving] = useState(false);

  const overlays = captionData.overlayTrack;

  const handleDelete = (overlayId: string) => {
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
          } catch (error) {
            Alert.alert("Error", "Failed to delete overlay.");
            console.error("Failed to delete overlay:", error);
          }
        },
      },
    ]);
  };

  const handleAdd = async () => {
    const start = parseFloat(newStart);
    const end = parseFloat(newEnd);

    if (!newText.trim()) {
      Alert.alert("Error", "Text cannot be empty.");
      return;
    }
    if (isNaN(start) || isNaN(end) || start < 0 || end <= start) {
      Alert.alert("Error", "Enter valid start and end times (in seconds).");
      return;
    }
    if (end > durationSec) {
      Alert.alert(
        "Error",
        `End time cannot exceed video duration (${formatTime(durationSec)}).`
      );
      return;
    }

    setSaving(true);
    try {
      const result = await addOverlay(
        videoId,
        { text: newText.trim(), start, end },
        accessToken
      );
      onCaptionDataChange({
        ...captionData,
        overlayTrack: [...captionData.overlayTrack, result.overlay],
      });
      setShowAddModal(false);
      setNewText("");
      setNewStart("");
      setNewEnd("");
    } catch (error) {
      Alert.alert("Error", "Failed to add overlay.");
      console.error("Failed to add overlay:", error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Overlays</Text>

      {overlays.length === 0 && (
        <Text style={styles.emptyText}>No overlays yet</Text>
      )}

      {overlays.map((overlay) => (
        <View key={overlay.id} style={styles.overlayRow}>
          <View style={styles.overlayInfo}>
            <Text style={styles.overlayText} numberOfLines={1}>
              {overlay.text}
            </Text>
            <Text style={styles.overlayTime}>
              {formatTime(overlay.start)} – {formatTime(overlay.end)}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => handleDelete(overlay.id)}
            style={styles.deleteButton}
          >
            <Text style={styles.deleteButtonText}>✕</Text>
          </TouchableOpacity>
        </View>
      ))}

      <TouchableOpacity
        style={styles.addButton}
        onPress={() => setShowAddModal(true)}
      >
        <Text style={styles.addButtonText}>+ Add Overlay</Text>
      </TouchableOpacity>

      <Modal visible={showAddModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Overlay</Text>

            <Text style={styles.fieldLabel}>Text</Text>
            <TextInput
              style={styles.modalInput}
              value={newText}
              onChangeText={setNewText}
              placeholder="Overlay text"
              autoFocus
            />

            <Text style={styles.fieldLabel}>Start time (seconds)</Text>
            <TextInput
              style={styles.modalInput}
              value={newStart}
              onChangeText={setNewStart}
              placeholder="0"
              keyboardType="numeric"
            />

            <Text style={styles.fieldLabel}>End time (seconds)</Text>
            <TextInput
              style={styles.modalInput}
              value={newEnd}
              onChangeText={setNewEnd}
              placeholder={String(Math.min(5, durationSec))}
              keyboardType="numeric"
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                onPress={() => {
                  setShowAddModal(false);
                  setNewText("");
                  setNewStart("");
                  setNewEnd("");
                }}
                style={styles.modalButton}
              >
                <Text style={styles.modalButtonCancel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleAdd}
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e0e0e0",
  },
  heading: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 12,
    color: "#333",
  },
  emptyText: {
    fontSize: 14,
    color: "#999",
    marginBottom: 8,
  },
  overlayRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 8,
    backgroundColor: "rgba(0, 0, 0, 0.03)",
    borderRadius: 6,
    marginBottom: 6,
  },
  overlayInfo: {
    flex: 1,
  },
  overlayText: {
    fontSize: 15,
    color: "#222",
  },
  overlayTime: {
    fontSize: 12,
    color: "#999",
    marginTop: 2,
  },
  deleteButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 59, 48, 0.1)",
    marginLeft: 8,
  },
  deleteButtonText: {
    color: "#FF3B30",
    fontSize: 14,
    fontWeight: "600",
  },
  addButton: {
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#007AFF",
    borderStyle: "dashed",
    marginTop: 4,
  },
  addButtonText: {
    color: "#007AFF",
    fontSize: 15,
    fontWeight: "500",
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
    width: "85%",
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "600",
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 13,
    color: "#666",
    marginBottom: 4,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 12,
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 4,
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
