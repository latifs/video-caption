import { createCanvas, type CanvasRenderingContext2D } from "@napi-rs/canvas";
import * as fs from "fs";
import * as path from "path";
import type { CaptionData, Overlay, SpeechWord } from "../types/caption";

/** Minimum gap (seconds) between words to treat as a sentence boundary. */
const SENTENCE_GAP_S = 0.3;
/** Cap word duration — WhisperX inflates segment-final words to absorb silence. */
const MAX_WORD_DURATION_S = 0.8;

interface CanvasStyleConfig {
  textColor: string;
  activeWordColor: string;
  showBackground: boolean;
  backgroundColor: string;
  fontWeight: "normal" | "bold";
  textShadow: boolean;
}

const CANVAS_STYLES: Record<string, CanvasStyleConfig> = {
  classic: {
    textColor: "#ffffff",
    activeWordColor: "#FFD700",
    showBackground: true,
    backgroundColor: "rgba(0,0,0,0.5)",
    fontWeight: "normal",
    textShadow: false,
  },
  outline: {
    textColor: "#ffffff",
    activeWordColor: "#00E5FF",
    showBackground: false,
    backgroundColor: "transparent",
    fontWeight: "bold",
    textShadow: true,
  },
};

export interface FrameEntry {
  path: string;
  duration: number;
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

function computeLayout(videoWidth: number, videoHeight: number) {
  const shortEdge = Math.min(videoWidth, videoHeight);
  const fontSize = Math.round((shortEdge * 33) / 720);
  const lineHeight = Math.round(fontSize * 1.25);
  const paddingH = Math.round(fontSize * 0.75); // matches px-3 / text-base ratio
  const paddingV = Math.round(fontSize * 0.375); // matches py-1.5 / text-base ratio
  const borderRadius = Math.round(fontSize * 0.25); // matches Tailwind "rounded"
  const maxTextWidth = videoWidth * 0.85; // matches left-4 right-4 constraint
  const bottomY = videoHeight * 0.9; // bottom of caption box at 90% height
  return { fontSize, lineHeight, paddingH, paddingV, borderRadius, maxTextWidth, bottomY };
}

/** Greedy word wrap — returns array of lines, each line is an array of words. */
function wrapWords(
  ctx: CanvasRenderingContext2D,
  words: string[],
  maxWidth: number
): string[][] {
  const lines: string[][] = [];
  let current: string[] = [];
  for (const word of words) {
    const test =
      current.length === 0 ? word : current.join(" ") + " " + word;
    if (ctx.measureText(test).width > maxWidth && current.length > 0) {
      lines.push(current);
      current = [word];
    } else {
      current.push(word);
    }
  }
  if (current.length > 0) lines.push(current);
  return lines;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function drawOverlays(
  ctx: CanvasRenderingContext2D,
  overlays: Overlay[],
  videoWidth: number,
  videoHeight: number
): void {
  for (const overlay of overlays) {
    const fontSize = overlay.style.fontSize;
    ctx.font = `normal ${fontSize}px Arial`;
    ctx.textBaseline = "middle";

    const paddingH = Math.round(fontSize * 0.75);
    const paddingV = Math.round(fontSize * 0.375);
    const borderRadius = Math.round(fontSize * 0.25);
    const maxTextWidth = videoWidth * 0.85;
    const lineHeight = Math.round(fontSize * 1.25);

    const lines = wrapWords(ctx, overlay.text.split(" "), maxTextWidth);

    let maxLineWidth = 0;
    for (const line of lines) {
      const w = ctx.measureText(line.join(" ")).width;
      if (w > maxLineWidth) maxLineWidth = w;
    }

    const boxWidth = maxLineWidth + paddingH * 2;
    const boxHeight = lines.length * lineHeight + paddingV * 2;

    // position.x: "left" | "center" | "right"
    // position.y: fraction of video height (0–1), treated as the vertical center of the box
    let boxX: number;
    if (overlay.position.x === "left") {
      boxX = videoWidth * 0.04;
    } else if (overlay.position.x === "right") {
      boxX = videoWidth - boxWidth - videoWidth * 0.04;
    } else {
      boxX = (videoWidth - boxWidth) / 2;
    }
    const boxY = overlay.position.y * videoHeight - boxHeight / 2;

    // Background
    const opacity = Math.max(0, Math.min(1, overlay.style.backgroundOpacity));
    if (opacity > 0) {
      // Parse hex color and apply opacity
      const hex = overlay.style.backgroundColor.replace("#", "");
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      ctx.fillStyle = `rgba(${r},${g},${b},${opacity})`;
      drawRoundedRect(ctx, boxX, boxY, boxWidth, boxHeight, borderRadius);
      ctx.fill();
    }

    // Text
    ctx.fillStyle = overlay.style.color;
    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];
      const lineWidth = ctx.measureText(line.join(" ")).width;
      let wordX: number;
      if (overlay.position.x === "left") {
        wordX = boxX + paddingH;
      } else if (overlay.position.x === "right") {
        wordX = boxX + paddingH;
      } else {
        wordX = (videoWidth - lineWidth) / 2;
      }
      const wordY = boxY + paddingV + lineIdx * lineHeight + lineHeight / 2;
      ctx.fillText(line.join(" "), wordX, wordY);
    }
  }
}

function renderEmptyFrame(
  outputPath: string,
  videoWidth: number,
  videoHeight: number,
  activeOverlays: Overlay[] = []
): void {
  const canvas = createCanvas(videoWidth, videoHeight);
  if (activeOverlays.length > 0) {
    const ctx = canvas.getContext("2d");
    drawOverlays(ctx, activeOverlays, videoWidth, videoHeight);
  }
  fs.writeFileSync(outputPath, canvas.toBuffer("image/png"));
}

function renderCaptionFrame(
  outputPath: string,
  videoWidth: number,
  videoHeight: number,
  groupWords: SpeechWord[],
  activeWordIdx: number,
  style: CanvasStyleConfig,
  activeOverlays: Overlay[] = []
): void {
  const { fontSize, lineHeight, paddingH, paddingV, borderRadius, maxTextWidth, bottomY } =
    computeLayout(videoWidth, videoHeight);

  const canvas = createCanvas(videoWidth, videoHeight);
  const ctx = canvas.getContext("2d");

  ctx.font = `${style.fontWeight} ${fontSize}px Arial`;
  // Use 'middle' baseline so glyphs are centered in their slot regardless of
  // font-internal leading (Skia's 'top' includes leading that shifts glyphs down).
  ctx.textBaseline = "middle";

  const wordTexts = groupWords.map((w) => w.word);
  const lines = wrapWords(ctx, wordTexts, maxTextWidth);

  // Compute max line width to size the background box
  let maxLineWidth = 0;
  for (const line of lines) {
    const w = ctx.measureText(line.join(" ")).width;
    if (w > maxLineWidth) maxLineWidth = w;
  }

  const boxWidth = maxLineWidth + paddingH * 2;
  const boxHeight = lines.length * lineHeight + paddingV * 2;
  const boxX = (videoWidth - boxWidth) / 2;
  const boxY = bottomY - boxHeight;

  // Background box (classic style only)
  if (style.showBackground) {
    ctx.fillStyle = style.backgroundColor;
    drawRoundedRect(ctx, boxX, boxY, boxWidth, boxHeight, borderRadius);
    ctx.fill();
  }

  // Draw words line by line, per-word coloring.
  // wordY = center of each line slot within the padded text area → text
  // is vertically centered in the box (verified: box center == text block center).
  let globalWordIdx = 0;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    const lineWidth = ctx.measureText(line.join(" ")).width;
    // Center each line in the video (= center in the box since box is centered)
    let wordX = (videoWidth - lineWidth) / 2;
    const wordY = boxY + paddingV + lineIdx * lineHeight + lineHeight / 2;

    for (let wi = 0; wi < line.length; wi++) {
      const word = line[wi];
      const spaceWidth = wi > 0 ? ctx.measureText(" ").width : 0;
      const wordWidth = ctx.measureText(word).width;
      const drawX = wordX + spaceWidth;

      if (style.textShadow) {
        ctx.strokeStyle = "rgba(0,0,0,0.9)";
        ctx.lineWidth = Math.max(2, Math.round(fontSize * 0.12));
        ctx.lineJoin = "round";
        ctx.strokeText(word, drawX, wordY);
      }

      ctx.fillStyle =
        globalWordIdx === activeWordIdx
          ? style.activeWordColor
          : style.textColor;
      ctx.fillText(word, drawX, wordY);

      wordX += spaceWidth + wordWidth;
      globalWordIdx++;
    }
  }

  if (activeOverlays.length > 0) {
    drawOverlays(ctx, activeOverlays, videoWidth, videoHeight);
  }

  fs.writeFileSync(outputPath, canvas.toBuffer("image/png"));
}

function writeConcatList(concatListPath: string, frames: FrameEntry[]): void {
  const escape = (p: string) => p.replace(/'/g, "'\\''");
  const lines = ["ffconcat version 1.0"];
  for (const f of frames) {
    lines.push(`file '${escape(f.path)}'`);
    lines.push(`duration ${f.duration.toFixed(6)}`);
  }
  // Duplicate last entry without duration (ffconcat quirk: ensures final frame renders)
  if (frames.length > 0) {
    lines.push(`file '${escape(frames[frames.length - 1].path)}'`);
  }
  fs.writeFileSync(concatListPath, lines.join("\n"));
}

/** Return the overlays from overlayTrack that are active at the given time. */
function getActiveOverlays(overlays: Overlay[], time: number): Overlay[] {
  return overlays.filter((o) => o.start <= time && time < o.end);
}

/**
 * Generate transparent PNG caption frames for every word event and write an
 * ffconcat list file. The caller passes this list to burnCaptionFrames().
 * Both speech captions and overlayTrack items are rendered into the same frames.
 */
export function generateCaptionFrames(
  tmpDir: string,
  captionData: CaptionData,
  videoWidth: number,
  videoHeight: number,
  styleId: string
): { concatListPath: string; frameEntries: FrameEntry[] } {
  const style = CANVAS_STYLES[styleId] ?? CANVAS_STYLES.classic;
  const frames: FrameEntry[] = [];
  const overlays = captionData.overlayTrack ?? [];

  // Pre-render a reusable empty frame (no speech, no overlays)
  const emptyPath = path.join(tmpDir, "caption_empty.png");
  renderEmptyFrame(emptyPath, videoWidth, videoHeight, []);

  // Cache for overlay-only frames keyed by sorted overlay ids at that time
  const overlayFrameCache = new Map<string, string>();

  let timelinePos = 0;
  let frameCount = 0;

  /**
   * Push a silence/gap segment from timelinePos to `until`.
   * During this gap there may still be active overlays, so we can't always
   * use the static empty frame — we must check at each overlay boundary.
   */
  function pushGap(until: number): void {
    if (until <= timelinePos + 0.001) return;

    // Collect overlay boundaries within this gap
    const boundaries = new Set<number>([timelinePos, until]);
    for (const o of overlays) {
      if (o.start > timelinePos && o.start < until) boundaries.add(o.start);
      if (o.end > timelinePos && o.end < until) boundaries.add(o.end);
    }
    const sorted = Array.from(boundaries).sort((a, b) => a - b);

    for (let i = 0; i < sorted.length - 1; i++) {
      const segStart = sorted[i];
      const segEnd = sorted[i + 1];
      const duration = segEnd - segStart;
      if (duration <= 0.001) continue;

      const midTime = segStart + duration / 2;
      const active = getActiveOverlays(overlays, midTime);

      let framePath: string;
      if (active.length === 0) {
        framePath = emptyPath;
      } else {
        const cacheKey = active.map((o) => o.id).sort().join("|");
        if (!overlayFrameCache.has(cacheKey)) {
          const p = path.join(tmpDir, `caption_overlay_${frameCount++}.png`);
          renderEmptyFrame(p, videoWidth, videoHeight, active);
          overlayFrameCache.set(cacheKey, p);
        }
        framePath = overlayFrameCache.get(cacheKey)!;
      }

      frames.push({ path: framePath, duration });
    }

    timelinePos = until;
  }

  for (const seg of captionData.speechTrack.segments) {
    if (seg.words.length === 0) continue;

    const groupStarts = getGroupBoundaries(seg.words);

    for (let g = 0; g < groupStarts.length; g++) {
      const startIdx = groupStarts[g];
      const endIdx =
        g + 1 < groupStarts.length ? groupStarts[g + 1] : seg.words.length;

      const groupWords = seg.words.slice(startIdx, endIdx);
      const groupStart = groupWords[0].start;
      const groupEnd =
        g + 1 < groupStarts.length
          ? seg.words[groupStarts[g + 1]].start
          : seg.words[seg.words.length - 1].end;

      // Gap before this group (may contain overlay-only frames)
      pushGap(groupStart);

      // One frame per word event (active word advances across the group).
      // Each word is highlighted only for [word.start, min(word.end, nextWord.start)].
      // If next.start > word.end, insert a no-highlight frame for that gap so the
      // exported video matches the preview (findActiveWordIndex returns -1 between words).
      for (let wIdx = 0; wIdx < groupWords.length; wIdx++) {
        const word = groupWords[wIdx];
        const nextStart =
          wIdx + 1 < groupWords.length
            ? groupWords[wIdx + 1].start
            : groupEnd;

        // Highlighted frame: word is active until its own end (or next word starts)
        const highlightEnd = Math.min(word.end, nextStart);
        const highlightDuration = highlightEnd - word.start;

        if (highlightDuration > 0) {
          const midTime = word.start + highlightDuration / 2;
          const activeOverlays = getActiveOverlays(overlays, midTime);
          const framePath = path.join(tmpDir, `caption_frame_${frameCount++}.png`);
          renderCaptionFrame(framePath, videoWidth, videoHeight, groupWords, wIdx, style, activeOverlays);
          frames.push({ path: framePath, duration: highlightDuration });
          timelinePos = highlightEnd;
        }

        // Gap frame: word ended but next word hasn't started yet — no active highlight
        if (nextStart > word.end + 0.001) {
          const gapDuration = nextStart - word.end;
          const midTime = word.end + gapDuration / 2;
          const activeOverlays = getActiveOverlays(overlays, midTime);
          const framePath = path.join(tmpDir, `caption_frame_${frameCount++}.png`);
          renderCaptionFrame(framePath, videoWidth, videoHeight, groupWords, -1, style, activeOverlays);
          frames.push({ path: framePath, duration: gapDuration });
          timelinePos = nextStart;
        }
      }
    }
  }

  // Guarantee at least one entry so the concat list is valid
  if (frames.length === 0) {
    frames.push({ path: emptyPath, duration: 9999 });
  }

  const concatListPath = path.join(tmpDir, "caption_concat.txt");
  writeConcatList(concatListPath, frames);

  return { concatListPath, frameEntries: frames };
}
