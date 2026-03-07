import { describe, it, expect } from "vitest";
import { captionDataToSrt } from "../lib/caption-srt";
import type { CaptionData } from "../types/caption";

function makeCaptionData(
  overrides: Partial<CaptionData> = {}
): CaptionData {
  return {
    version: 1,
    speechTrack: {
      language: "en",
      text: "Hello world",
      segments: [
        {
          start: 0.0,
          end: 1.5,
          words: [
            { word: "Hello", start: 0.0, end: 0.5 },
            { word: "world", start: 0.6, end: 1.5 },
          ],
        },
      ],
    },
    overlayTrack: [],
    ...overrides,
  };
}

describe("captionDataToSrt", () => {
  it("produces valid SRT from speech segments", () => {
    const srt = captionDataToSrt(makeCaptionData());

    expect(srt).toContain("1\n");
    expect(srt).toContain("00:00:00,000 --> 00:00:01,500");
    expect(srt).toContain("Hello world");
  });

  it("includes overlay entries after speech", () => {
    const data = makeCaptionData({
      overlayTrack: [
        {
          id: "overlay-1",
          text: "Subscribe!",
          start: 2.0,
          end: 4.0,
          position: { x: "center", y: 0.1 },
          style: {
            fontSize: 24,
            color: "#fff",
            backgroundColor: "#000",
            backgroundOpacity: 0.5,
          },
        },
      ],
    });

    const srt = captionDataToSrt(data);
    expect(srt).toContain("2\n");
    expect(srt).toContain("00:00:02,000 --> 00:00:04,000");
    expect(srt).toContain("Subscribe!");
  });

  it("formats timestamps correctly for hours", () => {
    const data = makeCaptionData({
      speechTrack: {
        language: "en",
        text: "test",
        segments: [
          {
            start: 3661.5,
            end: 3663.25,
            words: [{ word: "test", start: 3661.5, end: 3663.25 }],
          },
        ],
      },
    });

    const srt = captionDataToSrt(data);
    expect(srt).toContain("01:01:01,500 --> 01:01:03,250");
  });

  it("skips segments with no words", () => {
    const data = makeCaptionData({
      speechTrack: {
        language: "en",
        text: "",
        segments: [
          { start: 0, end: 1, words: [] },
          {
            start: 2,
            end: 3,
            words: [{ word: "hello", start: 2, end: 3 }],
          },
        ],
      },
    });

    const srt = captionDataToSrt(data);
    expect(srt).toContain("1\n");
    expect(srt).not.toContain("2\n");
    expect(srt).toContain("hello");
  });

  it("handles empty caption data", () => {
    const data = makeCaptionData({
      speechTrack: { language: "en", text: "", segments: [] },
      overlayTrack: [],
    });

    const srt = captionDataToSrt(data);
    expect(srt).toBe("");
  });
});
