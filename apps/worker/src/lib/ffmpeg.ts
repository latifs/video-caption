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
        // Fallback — ASS coordinate system defaults will still work
        resolve({ width: 1280, height: 720 });
      }
    });
  });
}

export function burnSubtitles(
  inputPath: string,
  srtPath: string,
  outputPath: string,
  fontsDir?: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const escapedSrtPath = srtPath.replace(/'/g, "'\\''").replace(/:/g, "\\:");
    const escapedFontsDir = fontsDir?.replace(/'/g, "'\\''").replace(/:/g, "\\:");
    const filterStr = escapedFontsDir
      ? `subtitles='${escapedSrtPath}':fontsdir='${escapedFontsDir}'`
      : `subtitles='${escapedSrtPath}'`;
    ffmpeg(inputPath)
      .videoFilter(filterStr)
      .videoCodec("libx264")
      .outputOptions("-c:a", "copy")
      .output(outputPath)
      .on("end", () => resolve())
      .on("error", (err: Error) => reject(err))
      .run();
  });
}
