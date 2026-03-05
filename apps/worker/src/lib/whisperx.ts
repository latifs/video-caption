import Replicate from "replicate";

export interface WhisperXWord {
  word: string;
  start: number;
  end: number;
}

export interface WhisperXSegment {
  start: number;
  end: number;
  text: string;
  words: WhisperXWord[];
}

export interface WhisperXResult {
  segments: WhisperXSegment[];
  detected_language: string;
}

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

/**
 * Run WhisperX on Replicate for accurate word-level timestamps.
 * WhisperX uses wav2vec2 forced phoneme alignment after transcription,
 * producing much more accurate per-word timestamps than Whisper alone.
 *
 * Accepts a file buffer which the Replicate client auto-uploads
 * (avoids needing a publicly accessible URL).
 *
 * @param audioBuffer - Raw audio file contents
 * @returns WhisperX result with aligned word timestamps
 */
export async function alignWithWhisperX(
  audioBuffer: Buffer
): Promise<WhisperXResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);

  try {
    const output = await replicate.run(
      "victor-upmeet/whisperx:84d2ad2d6194fe98a17d2b60bef1c7f910c46b2f6fd38996ca457afd9c8abfcb",
      {
        input: {
          audio_file: audioBuffer,
          align_output: true,
        },
        signal: controller.signal,
      }
    );

    const result = output as unknown as WhisperXResult;

    if (!result.segments || !Array.isArray(result.segments)) {
      throw new Error("WhisperX returned no segments");
    }

    return result;
  } finally {
    clearTimeout(timeout);
  }
}
