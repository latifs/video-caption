import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { X } from '@/lib/icons';
import { addOverlay, deleteOverlay } from '@/lib/api';
import type { CaptionData } from 'types';

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
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function OverlayList({
  captionData,
  durationSec,
  videoId,
  accessToken,
  onCaptionDataChange,
}: OverlayListProps) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [newText, setNewText] = useState('');
  const [newStart, setNewStart] = useState('');
  const [newEnd, setNewEnd] = useState('');
  const [saving, setSaving] = useState(false);

  const overlays = captionData.overlayTrack;

  const handleDelete = (overlayId: string) => {
    Alert.alert('Delete Overlay', 'Remove this overlay?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteOverlay(videoId, overlayId, accessToken);
            onCaptionDataChange({
              ...captionData,
              overlayTrack: captionData.overlayTrack.filter(
                (o) => o.id !== overlayId,
              ),
            });
          } catch (error) {
            Alert.alert('Error', 'Failed to delete overlay.');
            console.error('Failed to delete overlay:', error);
          }
        },
      },
    ]);
  };

  const handleAdd = async () => {
    const start = parseFloat(newStart);
    const end = parseFloat(newEnd);

    if (!newText.trim()) {
      Alert.alert('Error', 'Text cannot be empty.');
      return;
    }
    if (isNaN(start) || isNaN(end) || start < 0 || end <= start) {
      Alert.alert('Error', 'Enter valid start and end times (in seconds).');
      return;
    }
    if (end > durationSec) {
      Alert.alert(
        'Error',
        `End time cannot exceed video duration (${formatTime(durationSec)}).`,
      );
      return;
    }

    setSaving(true);
    try {
      const result = await addOverlay(
        videoId,
        { text: newText.trim(), start, end },
        accessToken,
      );
      onCaptionDataChange({
        ...captionData,
        overlayTrack: [...captionData.overlayTrack, result.overlay],
      });
      setShowAddModal(false);
      setNewText('');
      setNewStart('');
      setNewEnd('');
    } catch (error) {
      Alert.alert('Error', 'Failed to add overlay.');
      console.error('Failed to add overlay:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View className="border-t border-t-border px-4 py-3">
      <Text className="mb-3 text-base font-bold text-foreground">Overlays</Text>

      {overlays.length === 0 && (
        <Text className="mb-2 text-sm text-muted-foreground">
          No overlays yet
        </Text>
      )}

      {overlays.map((overlay) => (
        <View
          key={overlay.id}
          className="mb-1.5 flex-row items-center rounded-md bg-secondary px-2 py-2"
        >
          <View className="flex-1">
            <Text className="text-base text-foreground" numberOfLines={1}>
              {overlay.text}
            </Text>
            <Text className="mt-0.5 text-xs text-muted-foreground">
              {formatTime(overlay.start)} – {formatTime(overlay.end)}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => handleDelete(overlay.id)}
            className="ml-2 h-8 w-8 items-center justify-center rounded-full bg-destructive/10"
          >
            <X size={14} className="text-destructive" />
          </TouchableOpacity>
        </View>
      ))}

      <TouchableOpacity
        className="mt-1 items-center rounded-md border border-dashed border-primary py-2"
        onPress={() => setShowAddModal(true)}
      >
        <Text className="text-base font-medium text-accent">+ Add Overlay</Text>
      </TouchableOpacity>

      <Modal visible={showAddModal} transparent animationType="fade">
        <View className="flex-1 items-center justify-center bg-overlay">
          <View className="w-[85%] rounded-xl border border-border bg-popover p-5">
            <Text className="mb-4 text-lg font-semibold text-foreground">
              Add Overlay
            </Text>

            <Text className="mb-1 text-xs text-muted-foreground">Text</Text>
            <TextInput
              className="mb-3 rounded-lg border border-input bg-secondary px-3 py-2 text-base text-foreground"
              value={newText}
              onChangeText={setNewText}
              placeholder="Overlay text"
              autoFocus
            />

            <Text className="mb-1 text-xs text-muted-foreground">
              Start time (seconds)
            </Text>
            <TextInput
              className="mb-3 rounded-lg border border-input bg-secondary px-3 py-2 text-base text-foreground"
              value={newStart}
              onChangeText={setNewStart}
              placeholder="0"
              keyboardType="numeric"
            />

            <Text className="mb-1 text-xs text-muted-foreground">
              End time (seconds)
            </Text>
            <TextInput
              className="mb-3 rounded-lg border border-input bg-secondary px-3 py-2 text-base text-foreground"
              value={newEnd}
              onChangeText={setNewEnd}
              placeholder={String(Math.min(5, durationSec))}
              keyboardType="numeric"
            />

            <View className="mt-1 flex-row justify-end gap-3">
              <TouchableOpacity
                onPress={() => {
                  setShowAddModal(false);
                  setNewText('');
                  setNewStart('');
                  setNewEnd('');
                }}
                className="px-4 py-2"
              >
                <Text className="text-base text-muted-foreground">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleAdd}
                className="px-4 py-2"
                disabled={saving}
              >
                <Text
                  className={`text-base font-semibold text-accent ${saving ? 'opacity-50' : ''}`}
                >
                  {saving ? 'Adding...' : 'Add'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
