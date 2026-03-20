import { describe, it, expect } from "vitest";
import { captionDataToAss } from "../lib/caption-ass";
import type { CaptionData } from "../types/caption";

function makeCaptionData(overrides: Partial<CaptionData> = {}): CaptionData {
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

describe("captionDataToAss — script header", () => {
  it("includes Script Info and style sections", () => {
    const ass = captionDataToAss(makeCaptionData());
    expect(ass).toContain("[Script Info]");
    expect(ass).toContain("[V4+ Styles]");
    expect(ass).toContain("[Events]");
  });

  it("sets PlayResX/PlayResY to supplied dimensions", () => {
    const ass = captionDataToAss(makeCaptionData(), 1920, 1080);
    expect(ass).toContain("PlayResX: 1920");
    expect(ass).toContain("PlayResY: 1080");
  });

  it("defaults to 1280×720 when no dimensions passed", () => {
    const ass = captionDataToAss(makeCaptionData());
    expect(ass).toContain("PlayResX: 1280");
    expect(ass).toContain("PlayResY: 720");
  });

  it("scales font size to short edge (portrait video)", () => {
    // Short edge = 720 on a 720×1280 portrait video → same base font as 1280×720
    const landscape = captionDataToAss(makeCaptionData(), 1280, 720);
    const portrait = captionDataToAss(makeCaptionData(), 720, 1280);
    const extractFs = (ass: string) =>
      ass.match(/Style: Speech,Arial,(\d+)/)?.[1];
    expect(extractFs(landscape)).toBe(extractFs(portrait));
  });
});

describe("captionDataToAss — speech dialogue timing and highlighting", () => {
  it("emits one dialogue event per word in a group", () => {
    const ass = captionDataToAss(makeCaptionData());
    const dialogues = ass.match(/^Dialogue:/gm) ?? [];
    // Two words → two dialogue events
    expect(dialogues).toHaveLength(2);
  });

  it("formats ASS timestamps correctly (H:MM:SS.cc)", () => {
    const ass = captionDataToAss(makeCaptionData());
    // First word starts at 0.0
    expect(ass).toContain("0:00:00.00");
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
    const ass = captionDataToAss(data);
    expect(ass).toContain("1:01:01.50");
  });

  it("wraps active word in gold colour override and resets after", () => {
    const ass = captionDataToAss(makeCaptionData());
    // Gold override tag for active word
    expect(ass).toContain("{\\c&H0000D7FF&}Hello{\\r}");
  });

  it("shows the full group text in every word event", () => {
    const ass = captionDataToAss(makeCaptionData());
    // Both events must contain both words
    const lines = ass.split("\n").filter((l) => l.startsWith("Dialogue:"));
    for (const line of lines) {
      expect(line).toContain("Hello");
      expect(line).toContain("world");
    }
  });

  it("splits into separate sentence groups on a long gap", () => {
    const data = makeCaptionData({
      speechTrack: {
        language: "en",
        text: "Hello world",
        segments: [
          {
            start: 0.0,
            end: 5.0,
            words: [
              { word: "Hello", start: 0.0, end: 0.5 },
              // Gap > 0.3 s after capped end (0.5 + 0.8 cap = same here) → new group at 2.0
              { word: "world", start: 2.0, end: 2.5 },
            ],
          },
        ],
      },
    });
    const ass = captionDataToAss(data);
    const dialogues = ass.split("\n").filter((l) => l.startsWith("Dialogue:"));
    // Each group has 1 word → 2 separate single-word events (not shown together)
    expect(dialogues).toHaveLength(2);
    // "Hello" event should NOT contain "world" (different group)
    const helloLine = dialogues.find((l) => l.includes("Hello"))!;
    expect(helloLine).not.toContain("world");
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
            words: [{ word: "hi", start: 2, end: 3 }],
          },
        ],
      },
    });
    const ass = captionDataToAss(data);
    const dialogues = ass.split("\n").filter((l) => l.startsWith("Dialogue:"));
    expect(dialogues).toHaveLength(1);
    expect(dialogues[0]).toContain("hi");
  });

  it("handles empty speech and overlay tracks", () => {
    const data = makeCaptionData({
      speechTrack: { language: "en", text: "", segments: [] },
    });
    const ass = captionDataToAss(data);
    expect(ass).toContain("[Script Info]");
    const dialogues = ass.split("\n").filter((l) => l.startsWith("Dialogue:"));
    expect(dialogues).toHaveLength(0);
  });
});

describe("captionDataToAss — overlay positioning and colour formatting", () => {
  const baseOverlay = {
    id: "o1",
    text: "Subscribe!",
    start: 2.0,
    end: 4.0,
    position: { x: "center" as const, y: 0.1 },
    style: {
      fontSize: 24,
      color: "#ffffff",
      backgroundColor: "#000000",
      backgroundOpacity: 1,
    },
  };

  it("emits a Dialogue event for each overlay", () => {
    const data = makeCaptionData({ overlayTrack: [baseOverlay] });
    const ass = captionDataToAss(data);
    expect(ass).toContain("Subscribe!");
  });

  it("includes \\pos tag at correct pixel position (center)", () => {
    const data = makeCaptionData({
      overlayTrack: [{ ...baseOverlay, position: { x: "center", y: 0.5 } }],
    });
    const ass = captionDataToAss(data, 1280, 720);
    // center X = 640, y = 0.5 * 720 = 360
    expect(ass).toContain("\\pos(640,360)");
  });

  it("includes \\pos tag at correct pixel position (left)", () => {
    const data = makeCaptionData({
      overlayTrack: [{ ...baseOverlay, position: { x: "left", y: 0.0 } }],
    });
    const ass = captionDataToAss(data, 1280, 720);
    // left X = round(1280 * 32/1280) = 32
    expect(ass).toContain("\\pos(32,0)");
  });

  it("includes \\pos tag at correct pixel position (right)", () => {
    const data = makeCaptionData({
      overlayTrack: [{ ...baseOverlay, position: { x: "right", y: 0.0 } }],
    });
    const ass = captionDataToAss(data, 1280, 720);
    // right X = round(1280 * 1248/1280) = 1248
    expect(ass).toContain("\\pos(1248,0)");
  });

  it("uses \\an7 for left, \\an8 for center, \\an9 for right", () => {
    const makeData = (x: "left" | "center" | "right") =>
      makeCaptionData({
        overlayTrack: [{ ...baseOverlay, position: { x, y: 0.1 } }],
      });

    expect(captionDataToAss(makeData("left"))).toContain("\\an7");
    expect(captionDataToAss(makeData("center"))).toContain("\\an8");
    expect(captionDataToAss(makeData("right"))).toContain("\\an9");
  });

  it("converts hex colour to ASS &HAABBGGRR format for text (\\c)", () => {
    // #FF0000 = red, opacity 1 → alpha 00 → &H00 + 00 00 FF (BGR) = &H000000FF
    const data = makeCaptionData({
      overlayTrack: [
        { ...baseOverlay, style: { ...baseOverlay.style, color: "#ff0000" } },
      ],
    });
    const ass = captionDataToAss(data);
    expect(ass).toContain("\\c&H000000FF");
  });

  it("expands 3-digit hex shorthand correctly (#fff → FFFFFF, not FFF000)", () => {
    const data = makeCaptionData({
      overlayTrack: [
        { ...baseOverlay, style: { ...baseOverlay.style, color: "#fff", backgroundColor: "#000" } },
      ],
    });
    const ass = captionDataToAss(data);
    expect(ass).toContain("\\c&H00FFFFFF");
    expect(ass).toContain("\\4c&H00000000");
  });

  it("converts background colour and opacity to \\4c (BackColour override)", () => {
    // #ffffff, opacity 0.5 → alpha = round((1-0.5)*255) = 128 = 0x80
    // BGR for #ffffff = FFFFFF → &H80FFFFFF
    const data = makeCaptionData({
      overlayTrack: [
        {
          ...baseOverlay,
          style: {
            ...baseOverlay.style,
            backgroundColor: "#ffffff",
            backgroundOpacity: 0.5,
          },
        },
      ],
    });
    const ass = captionDataToAss(data);
    expect(ass).toContain("\\4c&H80FFFFFF");
  });

  it("uses \\fs with the overlay's fontSize value", () => {
    const data = makeCaptionData({
      overlayTrack: [{ ...baseOverlay, style: { ...baseOverlay.style, fontSize: 36 } }],
    });
    const ass = captionDataToAss(data);
    expect(ass).toContain("\\fs36");
  });
});
