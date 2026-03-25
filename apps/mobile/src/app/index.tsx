import { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Alert,
  useColorScheme,
} from 'react-native';
import { THEME_COLORS } from '@/lib/theme';
import {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
} from 'react-native-reanimated';
import { useRouter, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Menu } from '@/lib/icons';
import { useAuth } from '@/lib/auth';
import { listVideos, createVideo } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { VideoListItem } from '@/components/home/VideoListItem';
import { AddVideoSheet } from '@/components/home/AddVideoSheet';
import { SideMenu } from '@/components/home/SideMenu';

const DRAWER_WIDTH = 280;

interface VideoRow {
  id: string;
  status: string;
  createdAt: string;
  durationSec: number | null;
}

export default function HomeScreen() {
  const colorScheme = useColorScheme();
  const { user, session, signOut } = useAuth();
  const router = useRouter();
  const [videos, setVideos] = useState<VideoRow[]>([]);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const menuAnim = useSharedValue(0);
  const [uploading, setUploading] = useState(false);
  const closeMenuTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openMenu = useCallback(() => {
    if (closeMenuTimeout.current) {
      clearTimeout(closeMenuTimeout.current);
      closeMenuTimeout.current = null;
    }
    setMenuVisible(true);
    menuAnim.value = withTiming(1, { duration: 280 });
  }, [menuAnim]);

  const closeMenu = useCallback(
    (onDone?: () => void) => {
      menuAnim.value = withTiming(0, { duration: 220 });
      closeMenuTimeout.current = setTimeout(() => {
        closeMenuTimeout.current = null;
        setMenuVisible(false);
        onDone?.();
      }, 220);
    },
    [menuAnim],
  );

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: menuAnim.value,
  }));

  const drawerStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: interpolate(menuAnim.value, [0, 1], [DRAWER_WIDTH, 0]),
      },
    ],
  }));

  // Deferred action: launch picker only after modal is fully dismissed
  const pendingAction = useRef<'photos' | 'camera' | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      listVideos(session.access_token).then(setVideos).catch(console.error);
    }, [session]),
  );

  const launchPicker = useCallback(
    async (useCamera: boolean) => {
      const result = useCamera
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['videos'] })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['videos'],
          });

      if (result.canceled || !result.assets[0]) return;

      const asset = result.assets[0];
      setUploading(true);

      try {
        const videoId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(
          /[xy]/g,
          (c) => {
            const r = (Math.random() * 16) | 0;
            return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
          },
        );
        const filePath = `raw/${user!.id}/${videoId}.mp4`;

        const formData = new FormData();
        formData.append('file', {
          uri: asset.uri,
          name: `${videoId}.mp4`,
          type: 'video/mp4',
        } as unknown as Blob);

        const { error: uploadError } = await supabase.storage
          .from('videos')
          .upload(filePath, formData);

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('videos')
          .getPublicUrl(filePath);

        await createVideo(videoId, urlData.publicUrl, session!.access_token);
        router.push(`/status?videoId=${videoId}`);
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : 'Upload failed';
        Alert.alert('Error', message);
      } finally {
        setUploading(false);
      }
    },
    [user, session, router],
  );

  const handleSheetDismiss = useCallback(() => {
    const action = pendingAction.current;
    pendingAction.current = null;
    if (action) {
      // Small extra delay to ensure iOS has fully cleaned up the modal
      setTimeout(() => launchPicker(action === 'camera'), 300);
    }
  }, [launchPicker]);

  const handleChooseAction = (action: 'photos' | 'camera') => {
    pendingAction.current = action;
    setShowAddSheet(false);
  };

  return (
    <View className="flex-1 bg-background">
      {/* Header */}
      <View className="flex-row items-center justify-between px-5 pb-5 pt-16">
        <View>
          <Text className="text-2xl font-bold text-foreground">
            Video Caption App
          </Text>
        </View>
        <TouchableOpacity
          onPress={openMenu}
          className="justify-center p-2"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Menu size={22} className="text-foreground" />
        </TouchableOpacity>
      </View>

      {/* Section header */}
      <View className="mb-3 flex-row items-center justify-between px-5">
        <Text className="text-lg font-semibold text-foreground">Videos</Text>
        <Text className="text-xs text-muted-foreground">
          {videos.length} {videos.length === 1 ? 'video' : 'videos'}
        </Text>
      </View>

      {/* Video list */}
      <FlatList
        data={videos}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View className="items-center pt-20">
            <Text className="mb-1.5 text-lg font-semibold text-foreground">
              No videos yet
            </Text>
            <Text className="text-sm text-muted-foreground">
              Add your first video to get started
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <VideoListItem
            video={item}
            onPress={() => router.push(`/status?videoId=${item.id}`)}
          />
        )}
      />

      {/* Uploading overlay */}
      {uploading && (
        <View className="absolute inset-0 z-10 items-center justify-center bg-overlay">
          <ActivityIndicator size="large" color={THEME_COLORS[colorScheme === 'dark' ? 'dark' : 'light'].primary} />
          <Text className="mt-4 text-base text-foreground">
            Uploading video...
          </Text>
        </View>
      )}

      {/* Pinned bottom button */}
      <View className="absolute inset-x-0 bottom-0 border-t border-t-border bg-background px-5 pb-9 pt-3">
        <TouchableOpacity
          className="items-center rounded-xl bg-primary py-4"
          onPress={() => setShowAddSheet(true)}
          disabled={uploading}
        >
          <Text className="text-lg font-semibold text-primary-foreground">
            Add New Video
          </Text>
        </TouchableOpacity>
      </View>

      <AddVideoSheet
        visible={showAddSheet}
        onClose={() => setShowAddSheet(false)}
        onDismiss={handleSheetDismiss}
        onPhotosPress={() => handleChooseAction('photos')}
        onCameraPress={() => handleChooseAction('camera')}
      />

      <SideMenu
        visible={menuVisible}
        user={user}
        backdropStyle={backdropStyle}
        drawerStyle={drawerStyle}
        onClose={() => closeMenu()}
        onSignOut={() => closeMenu(signOut)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 100,
    flexGrow: 1,
  },
});
