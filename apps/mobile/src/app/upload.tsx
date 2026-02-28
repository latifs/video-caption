import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { processVideo } from "@/lib/api";

export default function UploadScreen() {
  const { user, session } = useAuth();
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [statusText, setStatusText] = useState("");

  const handlePickAndUpload = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["videos"],
    });

    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    setUploading(true);

    try {
      const videoId = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
        /[xy]/g,
        (c) => {
          const r = (Math.random() * 16) | 0;
          return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
        }
      );
      const filePath = `raw/${user!.id}/${videoId}.mp4`;

      setStatusText("Uploading video...");
      const formData = new FormData();
      formData.append("file", {
        uri: asset.uri,
        name: `${videoId}.mp4`,
        type: "video/mp4",
      } as unknown as Blob);

      const { error: uploadError } = await supabase.storage
        .from("videos")
        .upload(filePath, formData);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("videos")
        .getPublicUrl(filePath);

      const rawUrl = urlData.publicUrl;

      setStatusText("Starting processing...");
      await processVideo(videoId, rawUrl, session!.access_token);

      router.push(`/status?videoId=${videoId}`);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Upload failed";
      Alert.alert("Error", message);
    } finally {
      setUploading(false);
      setStatusText("");
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Upload Video</Text>
      <Text style={styles.subtitle}>
        Pick a short video to add captions
      </Text>

      <TouchableOpacity
        style={[styles.button, uploading && styles.buttonDisabled]}
        onPress={handlePickAndUpload}
        disabled={uploading}
      >
        {uploading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Choose Video</Text>
        )}
      </TouchableOpacity>

      {statusText ? (
        <Text style={styles.status}>{statusText}</Text>
      ) : null}

      {!uploading && (
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>Back to Videos</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#666",
    marginBottom: 30,
  },
  button: {
    backgroundColor: "#007AFF",
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 8,
    alignItems: "center",
    width: "100%",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  status: {
    marginTop: 20,
    fontSize: 14,
    color: "#666",
  },
  backButton: {
    marginTop: 20,
    paddingVertical: 10,
  },
  backButtonText: {
    color: "#007AFF",
    fontSize: 16,
  },
});
