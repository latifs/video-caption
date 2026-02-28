import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";

ffmpeg.setFfmpegPath(ffmpegPath!);

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

export function burnSubtitles(
  inputPath: string,
  srtPath: string,
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const escapedSrtPath = srtPath.replace(/'/g, "'\\''").replace(/:/g, "\\:");
    ffmpeg(inputPath)
      .videoFilter(`subtitles='${escapedSrtPath}'`)
      .videoCodec("libx264")
      .outputOptions("-c:a", "copy")
      .output(outputPath)
      .on("end", () => resolve())
      .on("error", (err: Error) => reject(err))
      .run();
  });
}
