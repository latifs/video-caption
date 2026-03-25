import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock @napi-rs/canvas — no real Skia binary needed in tests.
// The canvas context just needs measureText to return something plausible.
// ---------------------------------------------------------------------------
vi.mock("@napi-rs/canvas", () => {
  const ctx = {
    font: "",
    textBaseline: "",
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    lineJoin: "",
    measureText: (text: string) => ({ width: text.length * 8 }),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arcTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    fillText: vi.fn(),
    strokeText: vi.fn(),
    clearRect: vi.fn(),
    getContext: () => ctx,
  };
  return {
    createCanvas: () => ({
      getContext: () => ctx,
      toBuffer: () => Buffer.alloc(0),
    }),
  };
});

// Mock fs so no files are actually written.
vi.mock("fs", () => ({
  writeFileSync: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Import AFTER mocks are registered.
// ---------------------------------------------------------------------------
import { generateCaptionFrames } from "../lib/caption-canvas";
import type { CaptionData } from "../types/caption";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWord(word: string, start: number, end: number) {
  return { word, start, end };
}

function makeCaption(
  words: ReturnType<typeof makeWord>[],
  overlays: CaptionData["overlayTrack"] = []
): CaptionData {
  return {
    version: 1,
    speechTrack: {
      language: "en",
      text: words.map((w) => w.word).join(" "),
      segments: [
        {
          start: words[0]?.start ?? 0,
          end: words[words.length - 1]?.end ?? 0,
          words,
        },
      ],
    },
    overlayTrack: overlays,
  };
}

const TMP = "/tmp/test";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("generateCaptionFrames — group splitting", () => {
  it("puts words within SENTENCE_GAP_S (0.3 s) into the same group", () => {
    const words = [
      makeWord("Hello", 0.0, 0.4),
      makeWord("world", 0.5, 0.9), // gap 0.1 s < 0.3 s → same group
    ];
    const { frameEntries } = generateCaptionFrames(TMP, makeCaption(words), 1280, 720, "classic");
    // Both words are in one group, so we only see frames from that group (no inter-group empty frames).
    const speechFrames = frameEntries.filter((f) => f.path !== `${TMP}/caption_empty.png`);
    expect(speechFrames.length).toBeGreaterThanOrEqual(2); // at least one frame per word
  });

  it("splits words into separate groups when gap > SENTENCE_GAP_S (0.3 s)", () => {
    const words = [
      makeWord("First", 0.0, 0.4),
      makeWord("Second", 1.0, 1.4), // gap 0.6 s > 0.3 s → new group
    ];
    const { frameEntries } = generateCaptionFrames(TMP, makeCaption(words), 1280, 720, "classic");
    // Total timeline = end of second word = 1.4
    const totalDuration = frameEntries.reduce((s, f) => s + f.duration, 0);
    expect(totalDuration).toBeCloseTo(1.4, 3);
    // After "First" ends (0.4), the last word's no-highlight frame runs to groupEnd (1.0),
    // covering 0.6 s. This is a caption_frame (not empty) with activeWordIdx=-1.
    const noHighlightGap = frameEntries.find(
      (f) => f.path.includes("caption_frame") && f.duration > 0.5
    );
    expect(noHighlightGap).toBeDefined();
    expect(noHighlightGap!.duration).toBeCloseTo(0.6, 3);
  });
});

describe("generateCaptionFrames — between-word gaps / no-highlight intervals", () => {
  it("ends a highlighted frame at word.end when next word starts later", () => {
    const words = [
      makeWord("one", 0.0, 0.3), // ends 0.3
      makeWord("two", 0.6, 0.9), // starts 0.6 → gap 0.3 s (= SENTENCE_GAP_S, not > so same group)
    ];
    // gap is exactly 0.3 — not strictly greater, so same group.
    // Highlighted frame for "one" should last [0.0, 0.3] = 0.3 s.
    // Gap frame (no highlight) should last [0.3, 0.6] = 0.3 s.
    const { frameEntries } = generateCaptionFrames(TMP, makeCaption(words), 1280, 720, "classic");

    // First speech frame: highlighted word "one" — duration should be 0.3
    const captionFrames = frameEntries.filter((f) => !f.path.includes("empty"));
    // First frame = word "one" highlighted
    expect(captionFrames[0].duration).toBeCloseTo(0.3, 3);
  });

  it("inserts a no-highlight gap frame when next.start > word.end", () => {
    const words = [
      makeWord("alpha", 0.0, 0.2),  // ends 0.2
      makeWord("beta",  0.5, 0.8),  // starts 0.5 → gap 0.3 s (not > 0.3, same group; but word gap = 0.3)
    ];
    // gap between words = 0.5 - 0.2 = 0.3 > 0.001 → gap frame inserted
    const { frameEntries } = generateCaptionFrames(TMP, makeCaption(words), 1280, 720, "classic");

    const captionFrames = frameEntries.filter((f) => !f.path.includes("empty") && !f.path.includes("overlay"));
    // Frame 0: alpha highlighted [0.0, 0.2]
    // Frame 1: no-highlight [0.2, 0.5]
    // Frame 2: beta highlighted [0.5, 0.8]
    expect(captionFrames[0].duration).toBeCloseTo(0.2, 3);
    expect(captionFrames[1].duration).toBeCloseTo(0.3, 3);
    expect(captionFrames[2].duration).toBeCloseTo(0.3, 3);
  });
});

describe("generateCaptionFrames — concat list ordering and durations", () => {
  it("frame durations sum to the end time of the last spoken word", () => {
    const words = [
      makeWord("a", 0.0, 0.4),
      makeWord("b", 0.5, 0.9),
      makeWord("c", 1.0, 1.5),
    ];
    const { frameEntries } = generateCaptionFrames(TMP, makeCaption(words), 1280, 720, "classic");
    const total = frameEntries.reduce((s, f) => s + f.duration, 0);
    expect(total).toBeCloseTo(1.5, 3);
  });

  it("returns at least one frame even when captionData has no words", () => {
    const empty: CaptionData = {
      version: 1,
      speechTrack: { language: "en", text: "", segments: [] },
      overlayTrack: [],
    };
    const { frameEntries } = generateCaptionFrames(TMP, empty, 1280, 720, "classic");
    expect(frameEntries.length).toBeGreaterThanOrEqual(1);
  });

  it("produces frames in chronological order (non-decreasing start times)", () => {
    const words = [
      makeWord("x", 1.0, 1.3),
      makeWord("y", 1.4, 1.8),
      makeWord("z", 2.5, 3.0),
    ];
    const { frameEntries } = generateCaptionFrames(TMP, makeCaption(words), 1280, 720, "classic");
    let cursor = 0;
    for (const f of frameEntries) {
      expect(f.duration).toBeGreaterThan(0);
      cursor += f.duration;
    }
    // Cursor should end exactly at last word end (3.0)
    expect(cursor).toBeCloseTo(3.0, 3);
  });

  it("concatListPath is inside tmpDir", () => {
    const words = [makeWord("hi", 0.0, 0.5)];
    const { concatListPath } = generateCaptionFrames(TMP, makeCaption(words), 1280, 720, "classic");
    expect(concatListPath.startsWith(TMP)).toBe(true);
  });
});

describe("generateCaptionFrames — overlayTrack rendering", () => {
  it("inserts overlay-only frames during silence before speech starts", () => {
    const words = [makeWord("hello", 2.0, 2.5)];
    const overlays = [
      {
        id: "ov1",
        text: "Intro",
        start: 0.0,
        end: 1.5,
        position: { x: "center" as const, y: 0.5 },
        style: { fontSize: 24, color: "#ffffff", backgroundColor: "#000000", backgroundOpacity: 0.7 },
      },
    ];
    const { frameEntries } = generateCaptionFrames(
      TMP,
      makeCaption(words, overlays),
      1280,
      720,
      "classic"
    );
    // There must be at least one overlay frame before the speech frames
    const overlayFrames = frameEntries.filter((f) => f.path.includes("overlay"));
    expect(overlayFrames.length).toBeGreaterThanOrEqual(1);
    // Total duration still covers from 0 to 2.5
    const total = frameEntries.reduce((s, f) => s + f.duration, 0);
    expect(total).toBeCloseTo(2.5, 3);
  });

  it("does not produce overlay frames when overlayTrack is empty", () => {
    const words = [makeWord("test", 0.0, 0.5)];
    const { frameEntries } = generateCaptionFrames(
      TMP,
      makeCaption(words, []),
      1280,
      720,
      "classic"
    );
    const overlayFrames = frameEntries.filter((f) => f.path.includes("overlay"));
    expect(overlayFrames.length).toBe(0);
  });
});
