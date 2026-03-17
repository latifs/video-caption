import { useState } from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { EditWordModal } from './EditWordModal';
import { updateSpeechText } from '@/lib/api';
import type { CaptionData } from 'types';

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
  return `${m}:${s.toString().padStart(2, '0')}`;
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
    currentText: string,
  ) => {
    setEditModal({ segmentIndex, wordIndex, text: currentText });
  };

  const submitEdit = async (
    segmentIndex: number,
    wordIndex: number,
    newText: string,
  ) => {
    setSaving(true);
    try {
      const result = await updateSpeechText(
        videoId,
        [{ segmentIndex, wordIndex, newText }],
        accessToken,
      );
      onCaptionDataChange(result.captionData);
    } catch (error) {
      Alert.alert('Error', 'Failed to update caption text.');
      console.error('Failed to update speech text:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleModalSave = () => {
    if (!editModal) return;
    const { segmentIndex, wordIndex, text } = editModal;
    const originalText = segments[segmentIndex].words[wordIndex].word;
    setEditModal(null);
    if (text !== undefined && text !== originalText) {
      submitEdit(segmentIndex, wordIndex, text);
    }
  };

  return (
    <View className="px-4 py-3">
      <Text className="mb-3 text-base font-bold text-foreground">
        Transcript
      </Text>
      {segments.map((segment, segIdx) => {
        const isActive =
          currentTime >= segment.start && currentTime <= segment.end;
        return (
          <View
            key={`seg-${segIdx}`}
            className={`mb-1 flex-row rounded-md px-2 py-2 ${isActive ? 'bg-primary-muted' : ''}`}
          >
            <Text className="mt-0.5 w-9 text-xs text-muted-foreground">
              {formatTime(segment.start)}
            </Text>
            <View className="flex-1 flex-row flex-wrap gap-1">
              {segment.words.map((word, wIdx) => (
                <TouchableOpacity
                  key={`w-${segIdx}-${wIdx}`}
                  onPress={() => handleWordPress(segIdx, wIdx, word.word)}
                  disabled={saving}
                  className="rounded bg-secondary px-1 py-0.5"
                >
                  <Text
                    className={`text-base text-foreground ${saving ? 'opacity-50' : ''}`}
                  >
                    {word.word}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        );
      })}

      <EditWordModal
        visible={editModal !== null}
        value={editModal?.text ?? ''}
        onChangeText={(t) =>
          setEditModal((prev) => (prev ? { ...prev, text: t } : null))
        }
        onCancel={() => setEditModal(null)}
        onSave={handleModalSave}
      />
    </View>
  );
}
