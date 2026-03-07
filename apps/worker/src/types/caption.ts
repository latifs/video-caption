export interface SpeechWord {
  word: string;
  start: number;
  end: number;
}

export interface SpeechSegment {
  start: number;
  end: number;
  words: SpeechWord[];
}

export interface SpeechTrack {
  language: string;
  text: string;
  segments: SpeechSegment[];
}

export interface Overlay {
  id: string;
  text: string;
  start: number;
  end: number;
  position: { x: "left" | "center" | "right"; y: number };
  style: {
    fontSize: number;
    color: string;
    backgroundColor: string;
    backgroundOpacity: number;
  };
}

export type OverlayTrack = Overlay[];

export interface CaptionData {
  version: 1;
  speechTrack: SpeechTrack;
  overlayTrack: OverlayTrack;
}
