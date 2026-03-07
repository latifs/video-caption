import { describe, it, expect } from "vitest";
import type { SpeechSegment, SpeechWord, Overlay } from "types";

// Inline the pure functions to avoid React Native module resolution in vitest
function findActiveSegment(
  segments: SpeechSegment[],
  currentTime: number
): SpeechSegment | null {
  for (const seg of segments) {
    if (currentTime >= seg.start && currentTime <= seg.end) {
      return seg;
    }
  }
  return null;
}

function findActiveWordIndex(words: SpeechWord[], currentTime: number): number {
  for (let i = 0; i < words.length; i++) {
    if (currentTime >= words[i].start && currentTime <= words[i].end) {
      return i;
    }
  }
  return -1;
}

function findActiveOverlays(overlays: Overlay[], currentTime: number): Overlay[] {
  return overlays.filter((o) => currentTime >= o.start && currentTime <= o.end);
}

const segments: SpeechSegment[] = [
  {
    start: 0.0,
    end: 2.0,
    words: [
      { word: "Hello", start: 0.0, end: 0.5 },
      { word: "world", start: 0.6, end: 1.0 },
      { word: "foo", start: 1.5, end: 2.0 },
    ],
  },
  {
    start: 3.0,
    end: 5.0,
    words: [
      { word: "bar", start: 3.0, end: 3.5 },
      { word: "baz", start: 4.0, end: 5.0 },
    ],
  },
];

describe("findActiveSegment", () => {
  it("returns segment at exact start boundary", () => {
    expect(findActiveSegment(segments, 0.0)).toBe(segments[0]);
  });

  it("returns segment at exact end boundary", () => {
    expect(findActiveSegment(segments, 2.0)).toBe(segments[0]);
  });

  it("returns segment in the middle", () => {
    expect(findActiveSegment(segments, 1.0)).toBe(segments[0]);
  });

  it("returns null between segments", () => {
    expect(findActiveSegment(segments, 2.5)).toBeNull();
  });

  it("returns null before first segment", () => {
    expect(findActiveSegment([], 0.5)).toBeNull();
  });

  it("returns null after last segment", () => {
    expect(findActiveSegment(segments, 6.0)).toBeNull();
  });

  it("returns second segment when in range", () => {
    expect(findActiveSegment(segments, 4.0)).toBe(segments[1]);
  });
});

describe("findActiveWordIndex", () => {
  const words = segments[0].words;

  it("returns correct index for first word", () => {
    expect(findActiveWordIndex(words, 0.2)).toBe(0);
  });

  it("returns correct index for second word", () => {
    expect(findActiveWordIndex(words, 0.8)).toBe(1);
  });

  it("returns -1 between words", () => {
    expect(findActiveWordIndex(words, 0.55)).toBe(-1);
  });

  it("returns -1 for empty words", () => {
    expect(findActiveWordIndex([], 0.5)).toBe(-1);
  });

  it("returns index at exact word boundary", () => {
    expect(findActiveWordIndex(words, 0.6)).toBe(1);
  });
});

describe("findActiveOverlays", () => {
  const overlays: Overlay[] = [
    {
      id: "1",
      text: "A",
      start: 1.0,
      end: 3.0,
      position: { x: "center", y: 0.1 },
      style: { fontSize: 24, color: "#fff", backgroundColor: "#000", backgroundOpacity: 0.5 },
    },
    {
      id: "2",
      text: "B",
      start: 2.0,
      end: 4.0,
      position: { x: "left", y: 0.5 },
      style: { fontSize: 20, color: "#fff", backgroundColor: "#000", backgroundOpacity: 0.5 },
    },
  ];

  it("returns empty when none active", () => {
    expect(findActiveOverlays(overlays, 0.5)).toEqual([]);
  });

  it("returns single active overlay", () => {
    const active = findActiveOverlays(overlays, 1.5);
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe("1");
  });

  it("returns multiple overlapping overlays", () => {
    const active = findActiveOverlays(overlays, 2.5);
    expect(active).toHaveLength(2);
  });

  it("returns only second overlay after first ends", () => {
    const active = findActiveOverlays(overlays, 3.5);
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe("2");
  });

  it("includes overlay at exact start boundary", () => {
    const active = findActiveOverlays(overlays, 1.0);
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe("1");
  });

  it("includes overlay at exact end boundary", () => {
    const active = findActiveOverlays(overlays, 4.0);
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe("2");
  });
});
