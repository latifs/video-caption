declare module "fluent-ffmpeg" {
  interface FfmpegCommand {
    input(source: string): FfmpegCommand;
    noVideo(): FfmpegCommand;
    audioCodec(codec: string): FfmpegCommand;
    audioBitrate(bitrate: string | number): FfmpegCommand;
    videoFilter(filter: string | string[]): FfmpegCommand;
    videoCodec(codec: string): FfmpegCommand;
    outputOptions(...options: string[]): FfmpegCommand;
    output(target: string): FfmpegCommand;
    on(event: "end", callback: () => void): FfmpegCommand;
    on(event: "error", callback: (err: Error) => void): FfmpegCommand;
    on(event: string, callback: (...args: unknown[]) => void): FfmpegCommand;
    run(): void;
    save(target: string): FfmpegCommand;
  }

  function ffmpeg(input?: string): FfmpegCommand;

  namespace ffmpeg {
    function setFfmpegPath(path: string): void;
  }

  export = ffmpeg;
}
