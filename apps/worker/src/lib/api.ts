import axios from "axios";

const API_URL = process.env.API_URL!;
const WORKER_SECRET = process.env.WORKER_SECRET!;

export async function callApiCallback(
  videoId: string,
  payload: {
    status: string;
    captionData?: unknown;
    durationSec?: number;
    processedUrl?: string;
  }
): Promise<void> {
  await axios.post(`${API_URL}/api/videos/${videoId}/callback`, payload, {
    headers: { "x-worker-secret": WORKER_SECRET },
  });
}
