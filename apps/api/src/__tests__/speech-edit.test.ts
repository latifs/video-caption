import { describe, it, expect } from "vitest";
import type { CaptionData } from "types";

function makeCaptionData(): CaptionData {
  return {
    version: 1,
    speechTrack: {
      language: "en",
      text: "Hello beautiful world",
      segments: [
        {
          start: 0.0,
          end: 2.0,
          words: [
            { word: "Hello", start: 0.0, end: 0.5 },
            { word: "beautiful", start: 0.6, end: 1.2 },
            { word: "world", start: 1.3, end: 2.0 },
          ],
        },
      ],
    },
    overlayTrack: [],
  };
}

function applySpeechEdits(
  captionData: CaptionData,
  edits: { segmentIndex: number; wordIndex: number; newText: string }[]
): { error?: string; captionData?: CaptionData } {
  for (const edit of edits) {
    if (
      edit.segmentIndex < 0 ||
      edit.segmentIndex >= captionData.speechTrack.segments.length
    ) {
      return { error: `segmentIndex ${edit.segmentIndex} out of bounds` };
    }
    const segment = captionData.speechTrack.segments[edit.segmentIndex];
    if (edit.wordIndex < 0 || edit.wordIndex >= segment.words.length) {
      return {
        error: `wordIndex ${edit.wordIndex} out of bounds for segment ${edit.segmentIndex}`,
      };
    }
  }

  for (const edit of edits) {
    captionData.speechTrack.segments[edit.segmentIndex].words[
      edit.wordIndex
    ].word = edit.newText;
  }

  captionData.speechTrack.text = captionData.speechTrack.segments
    .map((seg) => seg.words.map((w) => w.word).join(" "))
    .join(" ");

  return { captionData };
}

describe("speech edit validation", () => {
  it("rejects out-of-bounds segmentIndex", () => {
    const data = makeCaptionData();
    const result = applySpeechEdits(data, [
      { segmentIndex: 5, wordIndex: 0, newText: "x" },
    ]);
    expect(result.error).toContain("segmentIndex 5 out of bounds");
  });

  it("rejects negative segmentIndex", () => {
    const data = makeCaptionData();
    const result = applySpeechEdits(data, [
      { segmentIndex: -1, wordIndex: 0, newText: "x" },
    ]);
    expect(result.error).toContain("out of bounds");
  });

  it("rejects out-of-bounds wordIndex", () => {
    const data = makeCaptionData();
    const result = applySpeechEdits(data, [
      { segmentIndex: 0, wordIndex: 10, newText: "x" },
    ]);
    expect(result.error).toContain("wordIndex 10 out of bounds");
  });

  it("applies valid text-only edit", () => {
    const data = makeCaptionData();
    const result = applySpeechEdits(data, [
      { segmentIndex: 0, wordIndex: 1, newText: "wonderful" },
    ]);
    expect(result.captionData!.speechTrack.segments[0].words[1].word).toBe(
      "wonderful"
    );
  });

  it("never modifies timing fields", () => {
    const data = makeCaptionData();
    const originalStart =
      data.speechTrack.segments[0].words[1].start;
    const originalEnd = data.speechTrack.segments[0].words[1].end;

    const result = applySpeechEdits(data, [
      { segmentIndex: 0, wordIndex: 1, newText: "wonderful" },
    ]);

    expect(
      result.captionData!.speechTrack.segments[0].words[1].start
    ).toBe(originalStart);
    expect(
      result.captionData!.speechTrack.segments[0].words[1].end
    ).toBe(originalEnd);
  });

  it("rebuilds full transcript after edit", () => {
    const data = makeCaptionData();
    const result = applySpeechEdits(data, [
      { segmentIndex: 0, wordIndex: 1, newText: "wonderful" },
    ]);
    expect(result.captionData!.speechTrack.text).toBe(
      "Hello wonderful world"
    );
  });
});
