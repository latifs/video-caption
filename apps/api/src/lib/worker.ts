import axios from "axios";

export async function callWorker(
  videoId: string,
  rawUrl: string
): Promise<void> {
  await axios.post(`${process.env.WORKER_URL!}/process`, {
    videoId,
    rawUrl,
    secret: process.env.WORKER_SECRET!,
  });
}
