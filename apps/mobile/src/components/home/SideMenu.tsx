import { View, Text, TouchableOpacity, Pressable, StyleSheet } from 'react-native';
import Animated, { type AnimatedStyle } from 'react-native-reanimated';
import { X } from '@/lib/icons';
import type { ViewStyle } from 'react-native';

const DRAWER_WIDTH = 280;

interface SideMenuProps {
  visible: boolean;
  user: { email?: string } | null;
  backdropStyle: AnimatedStyle<ViewStyle>;
  drawerStyle: AnimatedStyle<ViewStyle>;
  onClose: () => void;
  onSignOut: () => void;
}

export function SideMenu({
  visible,
  user,
  backdropStyle,
  drawerStyle,
  onClose,
  onSignOut,
}: SideMenuProps) {
  if (!visible) return null;

  return (
    <View className="absolute inset-0 z-20">
      <Animated.View
        className="absolute inset-0 bg-overlay"
        style={backdropStyle}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <Animated.View
        className="absolute inset-y-0 right-0 bg-card px-5 pb-10 pt-16"
        style={[{ width: DRAWER_WIDTH }, drawerStyle]}
      >
        {/* Close */}
        <TouchableOpacity className="mb-5 self-end p-1" onPress={onClose}>
          <X size={20} className="text-muted-foreground" />
        </TouchableOpacity>

        {/* User info */}
        <View className="mb-5 flex-row items-center">
          <View className="mr-3 h-10 w-10 items-center justify-center rounded-full bg-primary">
            <Text className="text-lg font-semibold text-foreground">
              {user?.email?.[0]?.toUpperCase() || 'U'}
            </Text>
          </View>
          <Text
            className="flex-1 text-sm text-foreground"
            numberOfLines={1}
          >
            {user?.email}
          </Text>
        </View>

        <View className="my-3 border-b border-b-border" />

        {/* Links */}
        <TouchableOpacity className="py-3.5">
          <Text className="text-base text-foreground">My Projects</Text>
        </TouchableOpacity>
        <TouchableOpacity className="py-3.5">
          <Text className="text-base text-foreground">Caption Styles</Text>
        </TouchableOpacity>
        <TouchableOpacity className="py-3.5">
          <Text className="text-base text-foreground">Settings</Text>
        </TouchableOpacity>
        <TouchableOpacity className="py-3.5">
          <Text className="text-base text-foreground">Help & Support</Text>
        </TouchableOpacity>

        {/* Sign out at bottom */}
        <View className="flex-1" />
        <View className="my-3 border-b border-b-border" />
        <TouchableOpacity className="py-3.5" onPress={onSignOut}>
          <Text className="text-base text-destructive">Sign Out</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}
