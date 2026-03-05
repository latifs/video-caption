import { describe, it, expect } from "vitest";

interface OverlayInput {
  text: string;
  start: number;
  end: number;
}

function validateOverlay(
  input: OverlayInput,
  durationSec: number | null
): string | null {
  if (typeof input.text !== "string" || !input.text.trim()) {
    return "text is required and must be non-empty";
  }
  if (typeof input.start !== "number" || typeof input.end !== "number") {
    return "start and end must be numbers";
  }
  if (input.start < 0) {
    return "start must be >= 0";
  }
  if (input.end <= input.start) {
    return "end must be greater than start";
  }
  if (durationSec != null && input.end > durationSec) {
    return "end must be within video duration";
  }
  return null;
}

describe("overlay validation", () => {
  it("rejects end <= start", () => {
    const error = validateOverlay(
      { text: "hello", start: 5, end: 3 },
      10
    );
    expect(error).toBe("end must be greater than start");
  });

  it("rejects zero-length overlay (end === start)", () => {
    const error = validateOverlay(
      { text: "hello", start: 5, end: 5 },
      10
    );
    expect(error).toBe("end must be greater than start");
  });

  it("rejects negative start", () => {
    const error = validateOverlay(
      { text: "hello", start: -1, end: 3 },
      10
    );
    expect(error).toBe("start must be >= 0");
  });

  it("rejects end beyond video duration", () => {
    const error = validateOverlay(
      { text: "hello", start: 0, end: 15 },
      10
    );
    expect(error).toBe("end must be within video duration");
  });

  it("allows end beyond when duration is null", () => {
    const error = validateOverlay(
      { text: "hello", start: 0, end: 999 },
      null
    );
    expect(error).toBeNull();
  });

  it("accepts valid overlay", () => {
    const error = validateOverlay(
      { text: "hello", start: 0, end: 5 },
      10
    );
    expect(error).toBeNull();
  });

  it("rejects empty text", () => {
    const error = validateOverlay({ text: "", start: 0, end: 5 }, 10);
    expect(error).toBe("text is required and must be non-empty");
  });

  it("rejects whitespace-only text", () => {
    const error = validateOverlay(
      { text: "   ", start: 0, end: 5 },
      10
    );
    expect(error).toBe("text is required and must be non-empty");
  });
});
