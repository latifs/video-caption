import { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
} from "react-native";
import { Link } from "expo-router";
import { useAuth } from "@/lib/auth";
import { listVideos } from "@/lib/api";

interface VideoRow {
  id: string;
  status: string;
  createdAt: string;
}

export default function HomeScreen() {
  const { user, session, signOut } = useAuth();
  const [videos, setVideos] = useState<VideoRow[]>([]);

  useEffect(() => {
    if (!session) return;
    listVideos(session.access_token).then(setVideos).catch(console.error);
  }, [session]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Video Caption App</Text>
      <Text style={styles.email}>{user?.email}</Text>

      <Link href="/upload" style={styles.uploadLink}>
        <Text style={styles.uploadLinkText}>Upload a Video</Text>
      </Link>

      {videos.length > 0 && (
        <View style={styles.listContainer}>
          <Text style={styles.sectionTitle}>Recent Videos</Text>
          <FlatList
            data={videos}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <Link href={`/status?videoId=${item.id}`} style={styles.videoRow}>
                <Text style={styles.videoId}>
                  {item.id.slice(0, 8)}...
                </Text>
                <Text
                  style={[
                    styles.videoStatus,
                    item.status === "completed" && styles.statusCompleted,
                    item.status === "failed" && styles.statusFailed,
                  ]}
                >
                  {item.status}
                </Text>
              </Link>
            )}
          />
        </View>
      )}

      <TouchableOpacity style={styles.signOutButton} onPress={signOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    paddingTop: 60,
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 4,
  },
  email: {
    fontSize: 14,
    color: "#666",
    marginBottom: 30,
  },
  uploadLink: {
    backgroundColor: "#007AFF",
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 8,
    marginBottom: 30,
  },
  uploadLinkText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  listContainer: {
    width: "100%",
    flex: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 10,
  },
  videoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  videoId: {
    fontSize: 14,
    color: "#333",
  },
  videoStatus: {
    fontSize: 14,
    color: "#999",
  },
  statusCompleted: {
    color: "#34C759",
  },
  statusFailed: {
    color: "#FF3B30",
  },
  signOutButton: {
    marginTop: 20,
    padding: 12,
  },
  signOutText: {
    color: "#FF3B30",
    fontSize: 16,
  },
});
