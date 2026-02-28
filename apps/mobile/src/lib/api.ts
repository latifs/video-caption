import axios from "axios";

const API_URL = process.env.EXPO_PUBLIC_API_URL!;

export async function processVideo(
  videoId: string,
  rawUrl: string,
  accessToken: string
): Promise<void> {
  await axios.post(
    `${API_URL}/api/process`,
    { videoId, rawUrl },
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
}

export async function listVideos(
  accessToken: string
): Promise<{ id: string; status: string; createdAt: string }[]> {
  const { data } = await axios.get(`${API_URL}/api/videos`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return data;
}

export async function getVideoStatus(
  videoId: string,
  accessToken: string
): Promise<{ status: string; processedUrl: string | null }> {
  const { data } = await axios.get(`${API_URL}/api/videos/${videoId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return data;
}
