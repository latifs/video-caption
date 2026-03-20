import type { CaptionData, SpeechWord } from "../types/caption";

/** Minimum gap (seconds) between words to treat as a sentence boundary. */
const SENTENCE_GAP_S = 0.3;
/** Cap word duration — WhisperX inflates segment-final words to absorb silence. */
const MAX_WORD_DURATION_S = 0.8;

/** Format seconds as ASS timestamp: H:MM:SS.cc */
function formatAssTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.round((seconds % 1) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

/**
 * Convert #RRGGBB hex color + opacity (0–1) to ASS &HAABBGGRR format.
 * ASS alpha: 0x00 = fully opaque, 0xFF = fully transparent.
 */
function hexToAssColor(hex: string, opacity: number): string {
  const clean = hex.replace(/^#/, "").padEnd(6, "0");
  const r = clean.substring(0, 2).toUpperCase();
  const g = clean.substring(2, 4).toUpperCase();
  const b = clean.substring(4, 6).toUpperCase();
  const clampedOpacity = Math.max(0, Math.min(1, opacity));
  const assAlpha = Math.round((1 - clampedOpacity) * 255)
    .toString(16)
    .padStart(2, "0")
    .toUpperCase();
  return `&H${assAlpha}${b}${g}${r}`;
}

/** Return indices where each sentence group starts within a words array. */
function getGroupBoundaries(words: SpeechWord[]): number[] {
  const groupStarts = [0];
  for (let i = 1; i < words.length; i++) {
    const prev = words[i - 1];
    const cappedEnd =
      prev.start + Math.min(prev.end - prev.start, MAX_WORD_DURATION_S);
    if (words[i].start - cappedEnd > SENTENCE_GAP_S) {
      groupStarts.push(i);
    }
  }
  return groupStarts;
}

export function captionDataToAss(
  data: CaptionData,
  videoWidth = 1280,
  videoHeight = 720
): string {
  const lines: string[] = [];

  // Scale font to the SHORT edge so portrait videos (tall height) don't
  // inflate text. Base: 30px on a 720px short-edge ≈ 4.2%, which maps to
  // ~16pt on-screen when the video fills an iPhone 17 Pro display — matching
  // the in-app text-base size.
  const shortEdge = Math.min(videoWidth, videoHeight);
  const fontSize = Math.round(shortEdge * (30 / 720));
  const marginV = Math.round(videoHeight * (72 / 720));
  const marginLR = Math.round(videoWidth * (10 / 1280));

  // Overlay anchor X positions (left-edge, center, right-edge)
  const overlayXLeft = Math.round(videoWidth * (32 / 1280));
  const overlayXCenter = Math.round(videoWidth / 2);
  const overlayXRight = Math.round(videoWidth * (1248 / 1280));

  // Script Info
  lines.push("[Script Info]");
  lines.push("ScriptType: v4.00+");
  lines.push(`PlayResX: ${videoWidth}`);
  lines.push(`PlayResY: ${videoHeight}`);
  lines.push("");

  // Styles
  lines.push("[V4+ Styles]");
  lines.push(
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding"
  );
  // BorderStyle:3 = opaque box; Outline:2 = box border (required by some libass
  // builds for the box to render); BackColour &H40000000 = ~75% opaque black;
  // PrimaryColour = white (default text); Alignment:2 = bottom-center.
  // Active word is highlighted gold via inline {\c} override in each dialogue event.
  lines.push(
    `Style: Speech,Arial,${fontSize},&H00FFFFFF,&H00FFFFFF,&H00000000,&H40000000,0,0,0,0,100,100,0,0,3,2,0,2,${marginLR},${marginLR},${marginV},1`
  );
  lines.push("");

  // Events
  lines.push("[Events]");
  lines.push(
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"
  );

  // Speech segments with sentence grouping
  for (const seg of data.speechTrack.segments) {
    if (seg.words.length === 0) continue;

    const groupStarts = getGroupBoundaries(seg.words);

    for (let g = 0; g < groupStarts.length; g++) {
      const startIdx = groupStarts[g];
      const endIdx =
        g + 1 < groupStarts.length ? groupStarts[g + 1] : seg.words.length;

      const groupWords = seg.words.slice(startIdx, endIdx);
      const groupStart = groupWords[0].start;
      // End at the next group's first word start, or the last word's end
      const groupEnd =
        g + 1 < groupStarts.length
          ? seg.words[groupStarts[g + 1]].start
          : seg.words[seg.words.length - 1].end;

      // One dialogue event per word: shows the full group text with only the
      // active word wrapped in a gold {\c} override. Each event spans from the
      // active word's start until the next word's start (or groupEnd), so the
      // caption is displayed continuously with no gaps.
      for (let wIdx = 0; wIdx < groupWords.length; wIdx++) {
        const eventStart = groupWords[wIdx].start;
        const eventEnd =
          wIdx + 1 < groupWords.length
            ? groupWords[wIdx + 1].start
            : groupEnd;

        const lineText = groupWords
          .map((w, i) => {
            const space = i === 0 ? "" : " ";
            if (i === wIdx) {
              // Active word: override to gold, then {\r} resets to style default (white)
              return `${space}{\\c&H0000D7FF&}${w.word}{\\r}`;
            }
            return `${space}${w.word}`;
          })
          .join("");

        lines.push(
          `Dialogue: 0,${formatAssTime(eventStart)},${formatAssTime(eventEnd)},Speech,,0,0,0,,${lineText}`
        );
      }
    }
  }

  // Overlay entries with per-entry position, color, font size
  for (const overlay of data.overlayTrack) {
    // Map horizontal alignment to X pixel position and ASS anchor (\an)
    // \an uses numpad layout: 7=top-left, 8=top-center, 9=top-right
    let x: number;
    let an: number;
    if (overlay.position.x === "left") {
      x = overlayXLeft;
      an = 7;
    } else if (overlay.position.x === "right") {
      x = overlayXRight;
      an = 9;
    } else {
      x = overlayXCenter;
      an = 8;
    }
    const y = Math.round(overlay.position.y * videoHeight);

    const textColor = hexToAssColor(overlay.style.color, 1);
    const bgColor = hexToAssColor(
      overlay.style.backgroundColor,
      overlay.style.backgroundOpacity
    );
    const fs = overlay.style.fontSize;

    // \3c overrides OutlineColour per-dialogue (used with BorderStyle:1)
    const tags = `{\\pos(${x},${y})\\an${an}\\c${textColor}\\3c${bgColor}\\fs${fs}}`;
    lines.push(
      `Dialogue: 0,${formatAssTime(overlay.start)},${formatAssTime(overlay.end)},Speech,,0,0,0,,${tags}${overlay.text}`
    );
  }

  return lines.join("\n");
}
