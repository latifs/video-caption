import "dotenv/config";
import express from "express";
import axios from "axios";
import fs from "fs";
import path from "path";
import { supabase } from "./lib/supabase";
import { callApiCallback } from "./lib/api";
import { extractAudio, burnSubtitles, getVideoDimensions } from "./lib/ffmpeg";
import {
  buildCaptionDataFromWhisperX,
  getWhisperXDuration,
} from "./lib/caption-data";
import { alignWithWhisperX } from "./lib/whisperx";
import { captionDataToAss } from "./lib/caption-ass";
import type { CaptionData } from "./types/caption";

const app = express();
app.use(express.json({ limit: "5mb" }));

const WORKER_SECRET = process.env.WORKER_SECRET!;

/**
 * Resolve a directory containing font files for libass.
 * Checked in order: FONTS_DIR env var, platform defaults.
 */
function getFontsDir(): string | undefined {
  if (process.env.FONTS_DIR) return process.env.FONTS_DIR;
  if (process.platform === "darwin") return "/Library/Fonts";
  // Linux (Docker with fonts-liberation installed)
  return "/usr/share/fonts";
}

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

async function exportVideo(
  videoId: string,
  captionData: CaptionData,
  rawUrl: string
): Promise<void> {
  const tmpDir = path.join("/tmp", `${videoId}-export`);
  try {
    fs.mkdirSync(tmpDir, { recursive: true });

    if (!captionData) throw new Error("No caption data found");

    // Set exporting status
    await callApiCallback(videoId, { status: "exporting" });

    const inputPath = path.join(tmpDir, "input.mp4");
    const assPath = path.join(tmpDir, "subtitles.ass");
    const outputPath = path.join(tmpDir, "output.mp4");

    // Download raw video
    const response = await axios.get(rawUrl, {
      responseType: "arraybuffer",
    });
    fs.writeFileSync(inputPath, Buffer.from(response.data));

    // Probe actual video dimensions so ASS scales correctly at any resolution
    const { width: videoWidth, height: videoHeight } = await getVideoDimensions(inputPath);

    // Convert caption data to ASS (styled subtitles matching UI overlay)
    const assContent = captionDataToAss(captionData, videoWidth, videoHeight);
    fs.writeFileSync(assPath, assContent);

    // Burn subtitles (pass fontsdir so libass can find Arial / Liberation Sans)
    await burnSubtitles(inputPath, assPath, outputPath, getFontsDir());

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
  const { videoId, captionData, rawUrl, secret } = req.body;

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

  exportVideo(videoId, captionData, rawUrl).catch((err) =>
    console.error(`exportVideo failed for ${videoId}:`, err)
  );
});

const PORT = Number(process.env.PORT) || 8080;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Worker listening on 0.0.0.0:${PORT}`);
});
