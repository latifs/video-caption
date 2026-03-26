import { View, Text, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import { Portal } from '@rn-primitives/portal';

interface EditWordModalProps {
  visible: boolean;
  value: string;
  onChangeText: (text: string) => void;
  onCancel: () => void;
  onSave: () => void;
}

export function EditWordModal({
  visible,
  value,
  onChangeText,
  onCancel,
  onSave,
}: EditWordModalProps) {
  if (!visible) return null;
  return (
    <Portal name="edit-word-modal">
      <View style={StyleSheet.absoluteFill} className="items-center justify-center bg-overlay">
        <View className="w-[85%] rounded-xl border border-border bg-popover p-5">
          <Text className="mb-3 text-lg font-semibold text-foreground">
            Edit Word
          </Text>
          <TextInput
            className="mb-3 h-11 rounded-lg border border-input bg-secondary px-3 text-base text-foreground"
            value={value}
            onChangeText={onChangeText}
            autoFocus
            selectTextOnFocus
          />
          <View className="flex-row justify-end gap-3">
            <TouchableOpacity
              onPress={onCancel}
              className="px-4 py-2 bg-secondary rounded-lg"
            >
              <Text className="text-base text-secondary-foreground">
                Cancel
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onSave}
              className="px-4 py-2 bg-primary rounded-lg"
            >
              <Text className="text-base font-semibold text-primary-foreground">
                Save
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Portal>
  );
}
