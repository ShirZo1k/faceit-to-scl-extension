export const SCL_API_URL = "https://api.scl.gg";
export const SCL_STORAGE_URL = "https://storage.scl.gg";
export const SCL_FRONTEND_URL = "https://scl.gg";

export const FACEIT_ORIGINS = ["https://faceit.com", "https://www.faceit.com"];

// 25MB per part for multipart upload (balance between speed and smooth progress)
export const MULTIPART_CHUNK_SIZE = 25 * 1024 * 1024;

// Number of concurrent part uploads
export const PARALLEL_UPLOADS = 5;

// Timeout for SSE parsing monitoring (ms) - short because upload is already done
export const PARSING_TIMEOUT = 30_000;
