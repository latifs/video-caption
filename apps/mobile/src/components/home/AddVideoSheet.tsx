import { useEffect } from 'react';
import { View, Text, TouchableOpacity, Modal, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
} from 'react-native-reanimated';
import { X } from '@/lib/icons';

interface AddVideoSheetProps {
  visible: boolean;
  onClose: () => void;
  onDismiss: () => void;
  onPhotosPress: () => void;
  onCameraPress: () => void;
}

export function AddVideoSheet({
  visible,
  onClose,
  onDismiss,
  onPhotosPress,
  onCameraPress,
}: AddVideoSheetProps) {
  const anim = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      anim.value = withTiming(1, { duration: 300 });
    }
  }, [visible, anim]);

  const animateOut = (callback: () => void) => {
    anim.value = withTiming(0, { duration: 250 });
    setTimeout(callback, 250);
  };

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: anim.value,
  }));

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(anim.value, [0, 1], [300, 0]) },
    ],
  }));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={() => animateOut(onClose)}
      onDismiss={onDismiss}
    >
      <View className="flex-1 justify-end">
        <Animated.View
          className="absolute inset-0 bg-overlay"
          style={backdropStyle}
        >
          <Pressable
            style={{ flex: 1 }}
            onPress={() => animateOut(onClose)}
          />
        </Animated.View>
        <Animated.View
          className="rounded-t-2xl bg-card px-5 pb-10"
          style={sheetStyle}
        >
          <View className="mb-4 mt-2.5 h-1 w-9 self-center rounded-full bg-secondary" />
          <View className="mb-5 flex-row items-center justify-between">
            <Text className="text-xl font-semibold text-foreground">
              Add New Video
            </Text>
            <TouchableOpacity onPress={() => animateOut(onClose)}>
              <X size={20} className="text-muted-foreground" />
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            className="mb-2.5 items-center rounded-xl bg-primary py-4"
            onPress={() => animateOut(onPhotosPress)}
          >
            <Text className="text-base font-semibold text-primary-foreground">
              Import from Photos
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            className="items-center rounded-xl bg-secondary py-4"
            onPress={() => animateOut(onCameraPress)}
          >
            <Text className="text-base font-medium text-foreground">
              Record New Video
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}
