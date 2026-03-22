export interface ProcessedMatch {
  faceitId: string;
  sclUploadId: string;
  timestamp: number;
}

export interface UploadProgress {
  faceitId: string;
  progress: number; // 0-100
  phase: "download" | "upload" | "processing" | "completed";
  statusText?: string;
  fileName?: string;
}

// Storage value: Record<faceitId, UploadProgress>
export type UploadProgressMap = Record<string, UploadProgress>;

export const PROCESSED_MATCHES_STORAGE_KEY = "PROCESSED_MATCHES";
export const INTRO_SHOWN_STORAGE_KEY = "INTRO_SHOWN";
export const UPLOAD_PROGRESS_KEY = "UPLOAD_PROGRESS";
