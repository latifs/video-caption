import { View, Text, TouchableOpacity, useColorScheme } from 'react-native';
import { Play } from '@/lib/icons';

interface VideoRow {
  id: string;
  status: string;
  createdAt: string;
  durationSec: number | null;
}

interface VideoListItemProps {
  video: VideoRow;
  onPress: () => void;
}

const statusColor = (status: string, isDark: boolean) => {
  switch (status) {
    case 'completed':
      return isDark ? '#4ade80' : '#15803d';
    case 'failed':
      return isDark ? '#EF4444' : '#DC2626';
    case 'processing':
      return isDark ? '#D5ECE5' : '#2E5D4E';
    case 'uploaded':
      return isDark ? 'rgba(232,240,236,0.5)' : '#5A6B65';
    default:
      return isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.3)';
  }
};

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

export function VideoListItem({ video, onPress }: VideoListItemProps) {
  const colorScheme = useColorScheme();
  const color = statusColor(video.status, colorScheme === 'dark');

  return (
    <TouchableOpacity
      className="mb-2.5 flex-row rounded-xl bg-secondary p-3"
      onPress={onPress}
      activeOpacity={0.7}
    >
      {/* Thumbnail placeholder */}
      <View className="h-20 w-20 items-center justify-center rounded-lg bg-primary-muted">
        <Play size={24} className="text-primary" />
      </View>
      {/* Info */}
      <View className="ml-3 flex-1 justify-center">
        <Text
          className="mb-1 text-base font-semibold text-foreground"
          numberOfLines={1}
        >
          Video {video.id.slice(0, 8)}
        </Text>
        <View className="mb-1 flex-row items-center">
          <View
            className="mr-1.5 h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: color }}
          />
          <Text
            className="text-xs font-medium capitalize"
            style={{ color }}
          >
            {video.status}
          </Text>
        </View>
        <Text className="text-xs text-muted-foreground">
          {formatDate(video.createdAt)}
          {video.durationSec
            ? ` \u00B7 ${formatDuration(video.durationSec)}`
            : ''}
        </Text>
      </View>
    </TouchableOpacity>
  );
}
