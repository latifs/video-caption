import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import { execFile } from "child_process";

if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}

export function extractAudio(
  inputPath: string,
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .noVideo()
      .audioCodec("libmp3lame")
      .audioBitrate("128k")
      .output(outputPath)
      .on("end", () => resolve())
      .on("error", (err: Error) => reject(err))
      .run();
  });
}

/**
 * Extract video dimensions by running `ffmpeg -i` and parsing stderr.
 * This uses the ffmpeg-static binary we already have — no ffprobe needed.
 * ffmpeg always exits non-zero when given no output, so we ignore the error
 * code and just parse the stream info from stderr.
 */
export function getVideoDimensions(
  inputPath: string
): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const bin = ffmpegPath ?? "ffmpeg";
    execFile(bin, ["-i", inputPath], (_err, _stdout, stderr) => {
      // Match the first WxH pattern in the video stream line, e.g. "1920x1080"
      const match = stderr.match(/(\d{2,5})x(\d{2,5})/);
      if (match) {
        resolve({ width: parseInt(match[1], 10), height: parseInt(match[2], 10) });
      } else {
        // Fallback — canvas scaling defaults will still work
        resolve({ width: 1280, height: 720 });
      }
    });
  });
}

/**
 * Composite transparent PNG caption frames (from an ffconcat list) onto the
 * source video. Uses eof_action=pass so the video continues normally after
 * the last caption. PNG frames are produced by generateCaptionFrames() in caption-canvas.ts.
 */
export function burnCaptionFrames(
  inputVideoPath: string,
  concatListPath: string,
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const bin = ffmpegPath ?? "ffmpeg";
    const args = [
      "-i", inputVideoPath,
      "-f", "concat", "-safe", "0", "-i", concatListPath,
      "-filter_complex",
        "[1:v]format=rgba[cap];" +
        "[0:v][cap]overlay=eof_action=pass[overlaid];" +
        "[overlaid]scale=1080:1920:force_original_aspect_ratio=decrease," +
        "pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1[out]",
      "-map", "[out]",
      "-map", "0:a:0?",
      "-c:v", "libx264",
      "-b:v", "10M",
      "-r", "30",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-ar", "44100",
      "-b:a", "192k",
      "-y",
      outputPath,
    ];
    execFile(bin, args, { maxBuffer: 50 * 1024 * 1024 }, (err, _stdout, stderr) => {
      if (err) {
        const parts: string[] = ["ffmpeg burnCaptionFrames failed"];
        if (err.message) parts.push(`error: ${err.message}`);
        const stderrText = stderr ? stderr.toString().trim() : "";
        if (stderrText) parts.push(`stderr: ${stderrText}`);
        reject(new Error(parts.join(" | ")));
        return;
      }
      resolve();
    });
  });
}
