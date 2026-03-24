import "dotenv/config";
import express from "express";
import axios from "axios";
import fs from "fs";
import path from "path";
import { supabase } from "./lib/supabase";
import { callApiCallback } from "./lib/api";
import { extractAudio, burnCaptionFrames, getVideoDimensions } from "./lib/ffmpeg";
import {
  buildCaptionDataFromWhisperX,
  getWhisperXDuration,
} from "./lib/caption-data";
import { alignWithWhisperX } from "./lib/whisperx";
import { generateCaptionFrames } from "./lib/caption-canvas";
import type { CaptionData } from "./types/caption";

const app = express();
app.use(express.json({ limit: "5mb" }));

const WORKER_SECRET = process.env.WORKER_SECRET!;


async function processVideo(videoId: string, rawUrl: string, language?: string): Promise<void> {
  const tmpDir = path.join("/tmp", videoId);

  try {
    fs.mkdirSync(tmpDir, { recursive: true });

    const inputPath = path.join(tmpDir, "input.mp4");
    const audioPath = path.join(tmpDir, "audio.mp3");

    // Download raw video
    const response = await axios.get(rawUrl, { responseType: "arraybuffer" });
    fs.writeFileSync(inputPath, Buffer.from(response.data));

    // Extract audio
    await extractAudio(inputPath, audioPath);

    // Transcribe + align with WhisperX (accurate word-level timestamps)
    console.log(`[${videoId}] Running WhisperX via Replicate`);
    const audioBuffer = fs.readFileSync(audioPath);
    const whisperxResult = await alignWithWhisperX(audioBuffer, language);
    const captionData = buildCaptionDataFromWhisperX(whisperxResult);
    const durationSec = getWhisperXDuration(whisperxResult);
    console.log(`[${videoId}] WhisperX succeeded`);

    // Persist via API callback
    await callApiCallback(videoId, {
      status: "transcribed",
      captionData,
      durationSec,
    });
  } catch (error) {
    console.error(`Processing failed for ${videoId}:`, error);
    await callApiCallback(videoId, { status: "failed" });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

/** Extract the storage path within the "videos" bucket from a Supabase public URL. */
function extractStoragePath(publicUrl: string): string | null {
  const marker = "/storage/v1/object/public/videos/";
  const idx = publicUrl.indexOf(marker);
  return idx === -1 ? null : publicUrl.slice(idx + marker.length);
}

async function exportVideo(
  videoId: string,
  captionData: CaptionData,
  rawUrl: string,
  previousProcessedUrl?: string,
  captionStyle?: string
): Promise<void> {
  const tmpDir = path.join("/tmp", `${videoId}-export`);
  try {
    fs.mkdirSync(tmpDir, { recursive: true });

    if (!captionData) throw new Error("No caption data found");

    // Set exporting status
    await callApiCallback(videoId, { status: "exporting" });

    const inputPath = path.join(tmpDir, "input.mp4");
    const outputPath = path.join(tmpDir, "output.mp4");

    // Download raw video
    const response = await axios.get(rawUrl, {
      responseType: "arraybuffer",
    });
    fs.writeFileSync(inputPath, Buffer.from(response.data));

    // Probe actual video dimensions so canvas scales correctly at any resolution
    const { width: videoWidth, height: videoHeight } = await getVideoDimensions(inputPath);
    console.log(`[${videoId}] probed ${videoWidth}x${videoHeight}`);

    // Render caption frames to transparent PNGs and composite onto video
    const { concatListPath } = generateCaptionFrames(
      tmpDir,
      captionData,
      videoWidth,
      videoHeight,
      captionStyle ?? "classic"
    );
    await burnCaptionFrames(inputPath, concatListPath, outputPath);

    // Upload processed video — include a timestamp in the filename so each
    // re-export is a distinct storage object, bypassing CDN cache entirely.
    const processedFile = fs.readFileSync(outputPath);
    const storagePath = `processed/${videoId}_${Date.now()}.mp4`;

    const { error: uploadError } = await supabase.storage
      .from("videos")
      .upload(storagePath, processedFile, {
        contentType: "video/mp4",
      });

    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage
      .from("videos")
      .getPublicUrl(storagePath);

    await callApiCallback(videoId, {
      status: "completed",
      processedUrl: urlData.publicUrl,
    });

    // Delete the previous export object now that the new one is live.
    // Non-fatal: a cleanup failure should not roll back a successful export.
    if (previousProcessedUrl) {
      const oldPath = extractStoragePath(previousProcessedUrl);
      if (oldPath) {
        const { error: deleteError } = await supabase.storage
          .from("videos")
          .remove([oldPath]);
        if (deleteError) {
          console.warn(`[${videoId}] Failed to delete old export (${oldPath}):`, deleteError.message);
        }
      }
    }
  } catch (error) {
    console.error(`Export failed for ${videoId}:`, error);
    await callApiCallback(videoId, { status: "failed" });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

app.post("/process", (req, res) => {
  const { videoId, rawUrl, language, secret } = req.body;

  if (secret !== WORKER_SECRET) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  if (!videoId || !rawUrl) {
    res.status(400).json({ error: "Missing videoId or rawUrl" });
    return;
  }

  // Respond immediately, process in background
  res.json({ status: "accepted" });

  processVideo(videoId, rawUrl, language).catch((err) =>
    console.error(`processVideo failed for ${videoId}:`, err)
  );
});

app.post("/export", (req, res) => {
  const { videoId, captionData, rawUrl, previousProcessedUrl, captionStyle, secret } = req.body;

  if (secret !== WORKER_SECRET) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  if (!videoId) {
    res.status(400).json({ error: "Missing videoId" });
    return;
  }

  // Respond immediately, export in background
  res.json({ status: "accepted" });

  exportVideo(videoId, captionData, rawUrl, previousProcessedUrl, captionStyle).catch((err) =>
    console.error(`exportVideo failed for ${videoId}:`, err)
  );
});

const PORT = Number(process.env.PORT) || 8080;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Worker listening on 0.0.0.0:${PORT}`);
});
