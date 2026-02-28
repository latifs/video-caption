import OpenAI from "openai";
import fs from "fs";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

interface Segment {
  start: number;
  end: number;
  text: string;
}

export async function transcribeAudio(audioPath: string): Promise<Segment[]> {
  const file = fs.createReadStream(audioPath);

  const response = await openai.audio.transcriptions.create({
    file,
    model: "whisper-1",
    response_format: "verbose_json",
  });

  const segments = (response as unknown as { segments: Segment[] }).segments;

  return segments.map((seg) => ({
    start: seg.start,
    end: seg.end,
    text: seg.text,
  }));
}
