export interface ProcessVideoRequest {
  videoId: string;
  rawUrl: string;
}

export type VideoStatus =
  | "uploaded"
  | "processing"
  | "transcribed"
  | "exporting"
  | "completed"
  | "failed";
