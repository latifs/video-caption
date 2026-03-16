import { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Modal,
  Pressable,
  Animated,
  ActivityIndicator,
  Alert,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '@/lib/auth';
import { listVideos, processVideo } from '@/lib/api';
import { supabase } from '@/lib/supabase';

const DRAWER_WIDTH = 280;

interface VideoRow {
  id: string;
  status: string;
  createdAt: string;
  durationSec: number | null;
}

export default function HomeScreen() {
  const { user, session, signOut } = useAuth();
  const router = useRouter();
  const [videos, setVideos] = useState<VideoRow[]>([]);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const menuAnim = useRef(new Animated.Value(0)).current;
  const [uploading, setUploading] = useState(false);

  const openMenu = useCallback(() => {
    setMenuVisible(true);
    Animated.timing(menuAnim, {
      toValue: 1,
      duration: 280,
      useNativeDriver: true,
    }).start();
  }, [menuAnim]);

  const closeMenu = useCallback(
    (onDone?: () => void) => {
      Animated.timing(menuAnim, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }).start(() => {
        setMenuVisible(false);
        onDone?.();
      });
    },
    [menuAnim],
  );
  // Deferred action: launch picker only after modal is fully dismissed
  const pendingAction = useRef<'photos' | 'camera' | null>(null);

  useEffect(() => {
    if (!session) return;
    listVideos(session.access_token).then(setVideos).catch(console.error);
  }, [session]);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const year = d.getFullYear();
    return `${day}.${month}.${year}`;
  };

  const formatDuration = (sec: number | null) => {
    if (!sec) return '';
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

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

        await processVideo(videoId, urlData.publicUrl, session!.access_token);
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

  const statusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return '#34C759';
      case 'failed':
        return '#FF3B30';
      case 'processing':
        return '#A78BFA';
      default:
        return 'rgba(255,255,255,0.4)';
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.appTitle}>Video Caption App</Text>
        </View>
        <TouchableOpacity
          onPress={openMenu}
          style={styles.hamburgerButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <View style={styles.hamburgerLine} />
          <View style={[styles.hamburgerLine, styles.hamburgerLineShort]} />
          <View style={styles.hamburgerLine} />
        </TouchableOpacity>
      </View>

      {/* Section header */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Videos</Text>
        <Text style={styles.videoCount}>
          {videos.length} {videos.length === 1 ? 'video' : 'videos'}
        </Text>
      </View>

      {/* Video list */}
      <FlatList
        data={videos}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No videos yet</Text>
            <Text style={styles.emptySubtitle}>
              Add your first video to get started
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.videoCard}
            onPress={() => router.push(`/status?videoId=${item.id}`)}
            activeOpacity={0.7}
          >
            {/* Thumbnail placeholder */}
            <View style={styles.thumbnail}>
              <Text style={styles.thumbnailIcon}>{'\u25B6'}</Text>
            </View>
            {/* Info */}
            <View style={styles.videoInfo}>
              <Text style={styles.videoTitle} numberOfLines={1}>
                Video {item.id.slice(0, 8)}
              </Text>
              <View style={styles.videoMeta}>
                <View
                  style={[
                    styles.statusDot,
                    { backgroundColor: statusColor(item.status) },
                  ]}
                />
                <Text
                  style={[
                    styles.videoStatus,
                    { color: statusColor(item.status) },
                  ]}
                >
                  {item.status}
                </Text>
              </View>
              <Text style={styles.videoDate}>
                {formatDate(item.createdAt)}
                {item.durationSec
                  ? ` \u00B7 ${formatDuration(item.durationSec)}`
                  : ''}
              </Text>
            </View>
          </TouchableOpacity>
        )}
      />

      {/* Uploading overlay */}
      {uploading && (
        <View style={styles.uploadingOverlay}>
          <ActivityIndicator size="large" color="#8B5CF6" />
          <Text style={styles.uploadingText}>Uploading video...</Text>
        </View>
      )}

      {/* Pinned bottom button */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setShowAddSheet(true)}
          disabled={uploading}
        >
          <Text style={styles.addButtonText}>Add New Video</Text>
        </TouchableOpacity>
      </View>

      {/* Bottom sheet */}
      <Modal
        visible={showAddSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddSheet(false)}
        onDismiss={handleSheetDismiss}
      >
        <Pressable
          style={styles.sheetBackdrop}
          onPress={() => setShowAddSheet(false)}
        />
        <View style={styles.sheetContainer}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Add New Video</Text>
            <TouchableOpacity onPress={() => setShowAddSheet(false)}>
              <Text style={styles.sheetClose}>{'\u2715'}</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={styles.sheetButtonPrimary}
            onPress={() => handleChooseAction('photos')}
          >
            <Text style={styles.sheetButtonPrimaryText}>
              Import from Photos
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.sheetButtonSecondary}
            onPress={() => handleChooseAction('camera')}
          >
            <Text style={styles.sheetButtonSecondaryText}>
              Record New Video
            </Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Side menu */}
      {menuVisible && (
        <View style={styles.menuOverlay}>
          <Animated.View style={[styles.menuBackdrop, { opacity: menuAnim }]}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => closeMenu()}
            />
          </Animated.View>
          <Animated.View
            style={[
              styles.menuDrawer,
              {
                transform: [
                  {
                    translateX: menuAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [DRAWER_WIDTH, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            {/* Close */}
            <TouchableOpacity
              style={styles.menuCloseButton}
              onPress={() => closeMenu()}
            >
              <Text style={styles.menuCloseText}>{'\u2715'}</Text>
            </TouchableOpacity>

            {/* User info */}
            <View style={styles.menuUserSection}>
              <View style={styles.menuAvatar}>
                <Text style={styles.menuAvatarText}>
                  {user?.email?.[0]?.toUpperCase() || 'U'}
                </Text>
              </View>
              <Text style={styles.menuEmail} numberOfLines={1}>
                {user?.email}
              </Text>
            </View>

            <View style={styles.menuDivider} />

            {/* Links */}
            <TouchableOpacity style={styles.menuItem}>
              <Text style={styles.menuItemText}>My Projects</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem}>
              <Text style={styles.menuItemText}>Caption Styles</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem}>
              <Text style={styles.menuItemText}>Settings</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem}>
              <Text style={styles.menuItemText}>Help & Support</Text>
            </TouchableOpacity>

            {/* Sign out at bottom */}
            <View style={styles.menuSpacer} />
            <View style={styles.menuDivider} />
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => closeMenu(signOut)}
            >
              <Text style={styles.menuSignOutText}>Sign Out</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  appTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  email: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 2,
  },
  hamburgerButton: {
    padding: 8,
    justifyContent: 'center',
    gap: 5,
  },
  hamburgerLine: {
    width: 22,
    height: 2,
    backgroundColor: '#fff',
    borderRadius: 1,
  },
  hamburgerLineShort: {
    width: 16,
    alignSelf: 'flex-end',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  videoCount: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 100,
    flexGrow: 1,
  },
  videoCard: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  thumbnail: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: 'rgba(139,92,246,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbnailIcon: {
    fontSize: 24,
    color: '#8B5CF6',
  },
  videoInfo: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  videoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  videoMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  videoStatus: {
    fontSize: 13,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  videoDate: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 80,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.4)',
  },
  uploadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  uploadingText: {
    color: '#fff',
    fontSize: 16,
    marginTop: 16,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 34,
    backgroundColor: '#111',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  addButton: {
    backgroundColor: '#8B5CF6',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  addButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  // Bottom sheet
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheetContainer: {
    backgroundColor: '#1C1C2E',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 16,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
  },
  sheetClose: {
    fontSize: 20,
    color: 'rgba(255,255,255,0.5)',
    padding: 4,
  },
  sheetButtonPrimary: {
    backgroundColor: '#8B5CF6',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 10,
  },
  sheetButtonPrimaryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  sheetButtonSecondary: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  sheetButtonSecondaryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  // Side menu
  menuOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 20,
  },
  menuBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  menuDrawer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
    backgroundColor: '#1C1C2E',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  menuCloseButton: {
    alignSelf: 'flex-end',
    padding: 4,
    marginBottom: 20,
  },
  menuCloseText: {
    fontSize: 20,
    color: 'rgba(255,255,255,0.5)',
  },
  menuUserSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  menuAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#8B5CF6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  menuAvatarText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  menuEmail: {
    color: '#fff',
    fontSize: 14,
    flex: 1,
  },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginVertical: 12,
  },
  menuItem: {
    paddingVertical: 14,
  },
  menuItemText: {
    color: '#fff',
    fontSize: 16,
  },
  menuSpacer: {
    flex: 1,
  },
  menuSignOutText: {
    color: '#FF6B6B',
    fontSize: 16,
  },
});
