import axios from "axios";
import type { CaptionData, Overlay } from "types";

const API_URL = process.env.EXPO_PUBLIC_API_URL!;

export async function createVideo(
  videoId: string,
  rawUrl: string,
  accessToken: string
): Promise<{ id: string; status: string }> {
  const { data } = await axios.post(
    `${API_URL}/api/videos`,
    { videoId, rawUrl },
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  return data;
}

export async function processVideo(
  videoId: string,
  language: string,
  accessToken: string
): Promise<void> {
  await axios.post(
    `${API_URL}/api/process`,
    { videoId, language },
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
}

export async function listVideos(
  accessToken: string
): Promise<{ id: string; status: string; createdAt: string; durationSec: number | null }[]> {
  const { data } = await axios.get(`${API_URL}/api/videos`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return data;
}

export interface VideoStatusResponse {
  id: string;
  rawUrl: string;
  processedUrl: string | null;
  status: string;
  durationSec: number | null;
  captionData: CaptionData | null;
}

export async function getVideoStatus(
  videoId: string,
  accessToken: string
): Promise<VideoStatusResponse> {
  const { data } = await axios.get(`${API_URL}/api/videos/${videoId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return data;
}

export async function updateSpeechText(
  videoId: string,
  edits: { segmentIndex: number; wordIndex: number; newText: string }[],
  accessToken: string
): Promise<{ captionData: CaptionData }> {
  const { data } = await axios.patch(
    `${API_URL}/api/videos/${videoId}/speech`,
    { edits },
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  return data;
}

export async function addOverlay(
  videoId: string,
  overlay: {
    text: string;
    start: number;
    end: number;
    position?: Overlay["position"];
    style?: Overlay["style"];
  },
  accessToken: string
): Promise<{ overlay: Overlay }> {
  const { data } = await axios.post(
    `${API_URL}/api/videos/${videoId}/overlays`,
    overlay,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  return data;
}

export async function updateOverlay(
  videoId: string,
  overlayId: string,
  updates: { text?: string; start?: number; end?: number },
  accessToken: string
): Promise<{ overlay: Overlay }> {
  const { data } = await axios.patch(
    `${API_URL}/api/videos/${videoId}/overlays/${overlayId}`,
    updates,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  return data;
}

export async function deleteOverlay(
  videoId: string,
  overlayId: string,
  accessToken: string
): Promise<void> {
  await axios.delete(
    `${API_URL}/api/videos/${videoId}/overlays/${overlayId}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
}

export async function retryVideo(
  videoId: string,
  accessToken: string
): Promise<void> {
  await axios.post(
    `${API_URL}/api/videos/${videoId}/retry`,
    {},
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
}

export async function triggerExport(
  videoId: string,
  accessToken: string
): Promise<void> {
  await axios.post(
    `${API_URL}/api/videos/${videoId}/export`,
    {},
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
}
