import OpenAI from 'openai';
import fs from 'fs';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
}

export interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptionResult {
  language: string;
  text: string;
  duration: number;
  words: WordTimestamp[];
  segments: TranscriptionSegment[];
}

/**
 * Transcribe audio using OpenAI.
 *
 * Model options:
 * - "whisper-1": supports verbose_json with word/segment timestamps (required for captions)
 * - "gpt-4o-mini-transcribe": better accuracy but only returns plain text (no timestamps)
 *
 * Since we need word-level timestamps for caption rendering, whisper-1 is the default.
 * Set TRANSCRIPTION_MODEL env var to override (only useful for text-only use cases).
 */
export async function transcribeAudio(
  audioPath: string,
): Promise<TranscriptionResult> {
  const model = (process.env.TRANSCRIPTION_MODEL || 'whisper-1') as
    | 'whisper-1'
    | 'gpt-4o-mini-transcribe';
  const file = fs.createReadStream(audioPath);

  if (model === 'gpt-4o-mini-transcribe') {
    // This model only returns { text } — no timestamps
    const response = await openai.audio.transcriptions.create({
      file,
      model: 'gpt-4o-mini-transcribe',
      response_format: 'json',
    });

    return {
      language: 'en',
      text: (response as unknown as { text: string }).text || '',
      duration: 0,
      words: [],
      segments: [],
    };
  }

  // whisper-1: supports verbose_json with word + segment timestamps
  const response = await openai.audio.transcriptions.create({
    file,
    model: 'whisper-1',
    response_format: 'verbose_json',
    timestamp_granularities: ['word', 'segment'],
  });

  const data = response as unknown as {
    language: string;
    text: string;
    duration: number;
    words?: WordTimestamp[];
    segments?: TranscriptionSegment[];
  };

  return {
    language: data.language || 'en',
    text: data.text || '',
    duration: data.duration || 0,
    words: (data.words || []).map((w) => ({
      word: w.word,
      start: w.start,
      end: w.end,
    })),
    segments: (data.segments || []).map((s) => ({
      start: s.start,
      end: s.end,
      text: s.text,
    })),
  };
}
