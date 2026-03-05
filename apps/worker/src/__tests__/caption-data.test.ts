import { describe, it, expect } from "vitest";
import { buildCaptionData } from "../lib/caption-data";
import type { TranscriptionResult } from "../lib/transcribe";

function makeResult(
  overrides: Partial<TranscriptionResult> = {}
): TranscriptionResult {
  return {
    language: "en",
    text: "Hello world",
    duration: 5.0,
    words: [
      { word: "Hello", start: 0.0, end: 0.5 },
      { word: "world", start: 0.6, end: 1.0 },
    ],
    segments: [{ start: 0.0, end: 1.0, text: "Hello world" }],
    ...overrides,
  };
}

describe("buildCaptionData", () => {
  it("produces valid CaptionData from normal Whisper output", () => {
    const result = makeResult();
    const data = buildCaptionData(result);

    expect(data.version).toBe(1);
    expect(data.speechTrack.language).toBe("en");
    expect(data.speechTrack.segments).toHaveLength(1);
    expect(data.speechTrack.segments[0].words).toHaveLength(2);
    expect(data.speechTrack.segments[0].words[0].word).toBe("Hello");
    expect(data.speechTrack.segments[0].words[1].word).toBe("world");
    expect(data.overlayTrack).toEqual([]);
  });

  it("groups words into correct segments", () => {
    const result = makeResult({
      words: [
        { word: "Hello", start: 0.0, end: 0.5 },
        { word: "world", start: 0.6, end: 1.0 },
        { word: "foo", start: 2.0, end: 2.5 },
        { word: "bar", start: 2.6, end: 3.0 },
      ],
      segments: [
        { start: 0.0, end: 1.0, text: "Hello world" },
        { start: 2.0, end: 3.0, text: "foo bar" },
      ],
    });

    const data = buildCaptionData(result);
    expect(data.speechTrack.segments).toHaveLength(2);
    expect(data.speechTrack.segments[0].words).toHaveLength(2);
    expect(data.speechTrack.segments[1].words).toHaveLength(2);
    expect(data.speechTrack.segments[1].words[0].word).toBe("foo");
  });

  it("handles empty words gracefully", () => {
    const result = makeResult({
      words: [],
      segments: [{ start: 0.0, end: 1.0, text: "Hello world" }],
    });

    const data = buildCaptionData(result);
    expect(data.speechTrack.segments).toHaveLength(1);
    expect(data.speechTrack.segments[0].words).toHaveLength(0);
  });

  it("handles empty segments — puts all words in one segment", () => {
    const result = makeResult({
      segments: [],
    });

    const data = buildCaptionData(result);
    expect(data.speechTrack.segments).toHaveLength(1);
    expect(data.speechTrack.segments[0].words).toHaveLength(2);
  });

  it("handles completely empty transcription", () => {
    const result = makeResult({
      words: [],
      segments: [],
      text: "",
    });

    const data = buildCaptionData(result);
    expect(data.speechTrack.segments).toHaveLength(0);
    expect(data.overlayTrack).toEqual([]);
  });

  it("sets segment start/end from words when available", () => {
    const result = makeResult();
    const data = buildCaptionData(result);

    expect(data.speechTrack.segments[0].start).toBe(0.0);
    expect(data.speechTrack.segments[0].end).toBe(1.0);
  });
});
