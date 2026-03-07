import type { CaptionData } from "../types/caption";

function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);

  return (
    String(h).padStart(2, "0") +
    ":" +
    String(m).padStart(2, "0") +
    ":" +
    String(s).padStart(2, "0") +
    "," +
    String(ms).padStart(3, "0")
  );
}

export function captionDataToSrt(data: CaptionData): string {
  let index = 1;
  const entries: string[] = [];

  // Speech segments
  for (const seg of data.speechTrack.segments) {
    if (seg.words.length === 0) continue;
    const text = seg.words.map((w) => w.word).join(" ");
    entries.push(
      `${index}\n${formatTimestamp(seg.start)} --> ${formatTimestamp(seg.end)}\n${text.trim()}\n`
    );
    index++;
  }

  // Overlay entries
  for (const overlay of data.overlayTrack) {
    entries.push(
      `${index}\n${formatTimestamp(overlay.start)} --> ${formatTimestamp(overlay.end)}\n${overlay.text.trim()}\n`
    );
    index++;
  }

  return entries.join("\n");
}
