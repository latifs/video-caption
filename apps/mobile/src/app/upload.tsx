import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { processVideo } from '@/lib/api';

export default function UploadScreen() {
  const { user, session } = useAuth();
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [statusText, setStatusText] = useState('');

  const handlePickAndUpload = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
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

      setStatusText('Uploading video...');
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

      const rawUrl = urlData.publicUrl;

      setStatusText('Starting processing...');
      await processVideo(videoId, rawUrl, session!.access_token);

      router.push(`/status?videoId=${videoId}`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Upload failed';
      Alert.alert('Error', message);
    } finally {
      setUploading(false);
      setStatusText('');
    }
  };

  return (
    <View className="flex-1 items-center justify-center bg-background p-5">
      <Text className="mb-2 text-2xl font-bold text-foreground">
        Upload Video
      </Text>
      <Text className="mb-8 text-base text-muted-foreground">
        Pick a short video to add captions
      </Text>

      <TouchableOpacity
        className={`w-full items-center rounded-xl bg-primary py-3.5 px-8 ${uploading ? 'opacity-60' : ''}`}
        onPress={handlePickAndUpload}
        disabled={uploading}
      >
        {uploading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text className="text-base font-semibold text-white">
            Choose Video
          </Text>
        )}
      </TouchableOpacity>

      {statusText ? (
        <Text className="mt-5 text-sm text-muted-foreground">{statusText}</Text>
      ) : null}

      {!uploading && (
        <TouchableOpacity className="mt-5 py-2" onPress={() => router.back()}>
          <Text className="text-base text-accent">Back to Videos</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
