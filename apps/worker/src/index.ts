import "dotenv/config";
import express from "express";
import axios from "axios";
import fs from "fs";
import path from "path";
import { supabase } from "./lib/supabase";
import { prisma } from "./lib/prisma";
import { extractAudio, burnSubtitles } from "./lib/ffmpeg";
import { transcribeAudio } from "./lib/transcribe";
import { segmentsToSrt } from "./lib/srt";

const app = express();
app.use(express.json());

const WORKER_SECRET = process.env.WORKER_SECRET!;

async function processVideo(videoId: string, rawUrl: string): Promise<void> {
  const tmpDir = path.join("/tmp", videoId);
  try {
    fs.mkdirSync(tmpDir, { recursive: true });

    const inputPath = path.join(tmpDir, "input.mp4");
    const audioPath = path.join(tmpDir, "audio.mp3");
    const srtPath = path.join(tmpDir, "subtitles.srt");
    const outputPath = path.join(tmpDir, "output.mp4");

    // Download raw video
    const response = await axios.get(rawUrl, { responseType: "arraybuffer" });
    fs.writeFileSync(inputPath, Buffer.from(response.data));

    // Extract audio
    await extractAudio(inputPath, audioPath);

    // Transcribe
    const segments = await transcribeAudio(audioPath);

    // Generate SRT
    const srtContent = segmentsToSrt(segments);
    fs.writeFileSync(srtPath, srtContent);

    // Burn subtitles
    await burnSubtitles(inputPath, srtPath, outputPath);

    // Upload processed video
    const processedFile = fs.readFileSync(outputPath);
    const storagePath = `processed/${videoId}.mp4`;

    const { error: uploadError } = await supabase.storage
      .from("videos")
      .upload(storagePath, processedFile, {
        contentType: "video/mp4",
        upsert: true,
      });

    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage
      .from("videos")
      .getPublicUrl(storagePath);

    // Update DB with completed status
    await prisma.video.update({
      where: { id: videoId },
      data: { status: "completed", processedUrl: urlData.publicUrl },
    });
  } catch (error) {
    console.error(`Processing failed for ${videoId}:`, error);
    await prisma.video.update({
      where: { id: videoId },
      data: { status: "failed" },
    });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

app.post("/process", (req, res) => {
  const { videoId, rawUrl, secret } = req.body;

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

  processVideo(videoId, rawUrl);
});

const PORT = Number(process.env.PORT) || 8080;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Worker listening on 0.0.0.0:${PORT}`);
});
