import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { View, Text, Modal, Pressable, TouchableOpacity } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
} from 'react-native-reanimated';
import { X } from '@/lib/icons';

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export function BottomSheet({ visible, onClose, title, children }: BottomSheetProps) {
  const anim = useSharedValue(0);
  const closing = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (visible) {
      closing.current = false;
      anim.value = withTiming(1, { duration: 300 });
    }
  }, [visible, anim]);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const animateOut = () => {
    if (closing.current) return;
    closing.current = true;
    anim.value = withTiming(0, { duration: 250 });
    timer.current = setTimeout(onClose, 250);
  };

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: anim.value,
  }));

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(anim.value, [0, 1], [300, 0]) }],
  }));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={animateOut}
    >
      <View className="flex-1 justify-end">
        <Animated.View className="absolute inset-0 bg-overlay" style={backdropStyle}>
          <Pressable style={{ flex: 1 }} onPress={animateOut} />
        </Animated.View>
        <Animated.View className="rounded-t-2xl bg-card px-5 pb-10" style={sheetStyle}>
          <View className="mb-4 mt-2.5 h-1 w-9 self-center rounded-full bg-secondary" />
          <View className="mb-5 flex-row items-center justify-between">
            <Text className="text-xl font-semibold text-foreground">{title}</Text>
            <TouchableOpacity onPress={animateOut}>
              <X size={20} className="text-muted-foreground" />
            </TouchableOpacity>
          </View>
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}
