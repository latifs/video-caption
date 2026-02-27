export interface ProcessVideoRequest {
  videoId: string;
  rawUrl: string;
}

export type VideoStatus =
  | "uploaded"
  | "processing"
  | "completed"
  | "failed";
