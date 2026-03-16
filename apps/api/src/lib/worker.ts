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

export async function callWorkerExport(
  videoId: string,
  captionData: unknown,
  rawUrl: string
): Promise<void> {
  await axios.post(`${process.env.WORKER_URL!}/export`, {
    videoId,
    captionData,
    rawUrl,
    secret: process.env.WORKER_SECRET!,
  });
}
