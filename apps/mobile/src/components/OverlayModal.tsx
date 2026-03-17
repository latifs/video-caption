import { View, Text, TouchableOpacity, TextInput, Modal } from 'react-native';

export type OverlayModalState =
  | {
      mode: 'add';
      text: string;
      startText: string;
      endText: string;
    }
  | {
      mode: 'edit';
      overlayId: string;
      text: string;
      startText: string;
      endText: string;
    };

interface OverlayModalProps {
  state: OverlayModalState | null;
  saving: boolean;
  onChange: (
    updater: (prev: OverlayModalState | null) => OverlayModalState | null,
  ) => void;
  onCancel: () => void;
  onSubmit: () => void;
  onDelete: (overlayId: string) => void;
}

export function OverlayModal({
  state,
  saving,
  onChange,
  onCancel,
  onSubmit,
  onDelete,
}: OverlayModalProps) {
  const duration = (() => {
    if (!state) return '—';
    const s = parseFloat(state.startText);
    const e = parseFloat(state.endText);
    if (isNaN(s) || isNaN(e) || e <= s) return '—';
    return `${(e - s).toFixed(1)}s`;
  })();

  return (
    <Modal visible={state !== null} transparent animationType="fade">
      <View className="flex-1 items-center justify-center bg-overlay">
        <View className="w-[85%] rounded-xl border border-border bg-popover p-5">
          <Text className="mb-3 text-lg font-semibold text-foreground">
            {state?.mode === 'edit' ? 'Edit Overlay' : 'Add Overlay'}
          </Text>

          <Text className="mb-1 text-xs text-muted-foreground">Text</Text>
          <TextInput
            className="mb-3 rounded-lg border border-input bg-secondary px-3 py-2 text-base text-foreground"
            value={state?.text ?? ''}
            onChangeText={(t) =>
              onChange((prev) => (prev ? { ...prev, text: t } : null))
            }
            placeholder="Overlay text..."
            autoFocus
          />

          <View className="flex-row gap-3">
            <View className="flex-1">
              <Text className="mb-1 text-xs text-muted-foreground">
                Start (sec)
              </Text>
              <TextInput
                className="mb-3 rounded-lg border border-input bg-secondary px-3 py-2 text-base text-foreground"
                value={state?.startText ?? ''}
                onChangeText={(t) =>
                  onChange((prev) => (prev ? { ...prev, startText: t } : null))
                }
                keyboardType="decimal-pad"
              />
            </View>
            <View className="flex-1">
              <Text className="mb-1 text-xs text-muted-foreground">
                End (sec)
              </Text>
              <TextInput
                className="mb-3 rounded-lg border border-input bg-secondary px-3 py-2 text-base text-foreground"
                value={state?.endText ?? ''}
                onChangeText={(t) =>
                  onChange((prev) => (prev ? { ...prev, endText: t } : null))
                }
                keyboardType="decimal-pad"
              />
            </View>
          </View>

          <Text className="mb-3 text-xs text-muted-foreground">
            Duration: {duration}
          </Text>

          <View className="flex-row items-center gap-3">
            {state?.mode === 'edit' && (
              <TouchableOpacity
                onPress={() => onDelete(state.overlayId)}
                className="px-4 py-2"
              >
                <Text className="text-base font-semibold text-destructive">
                  Delete
                </Text>
              </TouchableOpacity>
            )}
            <View className="flex-1" />
            <TouchableOpacity
              onPress={onCancel}
              className="px-4 py-2 bg-secondary rounded-lg"
            >
              <Text className="text-base text-secondary-foreground">
                Cancel
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onSubmit}
              className="px-4 py-2 bg-primary rounded-lg"
              disabled={saving}
            >
              <Text
                className={`text-base font-semibold text-primary-foreground ${saving ? 'opacity-50' : ''}`}
              >
                {saving ? 'Saving...' : state?.mode === 'edit' ? 'Save' : 'Add'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
