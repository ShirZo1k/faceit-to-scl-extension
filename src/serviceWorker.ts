import {
  FaceitErrors,
  ServiceWorkerMessage,
  ServiceWorkerMessageType,
} from "./messages";
import {
  FACEIT_ORIGINS,
  SCL_API_URL,
  SCL_STORAGE_URL,
  MULTIPART_CHUNK_SIZE,
  PARALLEL_UPLOADS,
  PARSING_TIMEOUT,
} from "./constants";
import { getProcessedDemos } from "./helpers";
import {
  INTRO_SHOWN_STORAGE_KEY,
  PROCESSED_MATCHES_STORAGE_KEY,
  UPLOAD_PROGRESS_KEY,
  UploadProgress,
  UploadProgressMap,
} from "./storage";

console.log("Loaded FACEIT to SCL service worker");

// Firefox MV3 event pages get terminated on idle, which breaks messaging.
// Periodic alarm keeps the background script alive.
if (typeof chrome.alarms !== "undefined") {
  chrome.alarms.create("keepAlive", { periodInMinutes: 0.5 });
}

interface SclSessionTeam {
  id: string;
  organization: { id: number } | null;
}

interface SclSession {
  isLoggedIn: boolean;
  user: {
    id: string;
    defaultTeamId: string;
    defaultTeam: SclSessionTeam | null;
    teams: SclSessionTeam[];
  };
}

// Cache cookie header to avoid repeated chrome.cookies.getAll() calls
let cachedCookieHeader: string | null = null;
let cookieCacheTime = 0;
const COOKIE_CACHE_TTL = 60_000; // 1 minute

async function getSclCookieHeader(): Promise<string> {
  const now = Date.now();
  if (cachedCookieHeader && now - cookieCacheTime < COOKIE_CACHE_TTL) {
    return cachedCookieHeader;
  }
  const cookies = await chrome.cookies.getAll({ domain: ".scl.gg" });
  cachedCookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  cookieCacheTime = now;
  return cachedCookieHeader;
}

async function sclFetch(url: string, init?: RequestInit): Promise<Response> {
  const cookieHeader = await getSclCookieHeader();
  return fetch(url, {
    ...init,
    headers: {
      ...init?.headers,
      Cookie: cookieHeader,
    },
  });
}

async function getSclSession(): Promise<SclSession | null> {
  try {
    const response = await sclFetch(`${SCL_API_URL}/api/v1/session`);
    if (!response.ok) return null;
    const data = await response.json();
    if (!data.isLoggedIn) return null;
    return data;
  } catch {
    return null;
  }
}

async function setProgress(
  faceitId: string,
  progress: number,
  phase: UploadProgress["phase"],
  statusText?: string,
  fileName?: string,
) {
  const { [UPLOAD_PROGRESS_KEY]: existing = {} } =
    (await chrome.storage.local.get(UPLOAD_PROGRESS_KEY)) as {
      [UPLOAD_PROGRESS_KEY]?: UploadProgressMap;
    };
  existing[faceitId] = {
    faceitId,
    progress: Math.round(progress),
    phase,
    statusText,
    fileName,
  };
  await chrome.storage.local.set({ [UPLOAD_PROGRESS_KEY]: existing });
}

async function clearProgress(faceitId: string) {
  const { [UPLOAD_PROGRESS_KEY]: existing = {} } =
    (await chrome.storage.local.get(UPLOAD_PROGRESS_KEY)) as {
      [UPLOAD_PROGRESS_KEY]?: UploadProgressMap;
    };
  delete existing[faceitId];
  await chrome.storage.local.set({ [UPLOAD_PROGRESS_KEY]: existing });
}

// Check SCL for existing demo by FACEIT match ID
async function checkSclDemoStatus(
  matchId: string,
  mapIndex: number,
): Promise<{ status: string; mapId?: string }> {
  try {
    const sclMatchId = `faceit-1-${matchId}-${mapIndex}`;
    const response = await sclFetch(
      `${SCL_API_URL}/api/v1/demo-viewer/faceit-import/check?matchId=${sclMatchId}`,
    );
    if (!response.ok) return { status: "unknown" };
    return await response.json();
  } catch {
    return { status: "unknown" };
  }
}

// Monitor SSE stream for parsing progress.
// Always resolves - never blocks the upload from completing.
async function monitorParsing(
  uploadId: string,
  faceitId: string,
  progressFn: (p: number, phase: UploadProgress["phase"], text?: string) => Promise<void>,
): Promise<void> {
  console.log(`Monitoring parsing for uploadId: ${uploadId}`);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      console.log("Parsing monitoring timed out, marking as completed");
      controller.abort();
    }, PARSING_TIMEOUT);

    const response = await sclFetch(
      `${SCL_STORAGE_URL}/api/demo/status/stream/${uploadId}`,
      {
        headers: {
          Accept: "text/event-stream",
          Origin: "https://scl.gg",
          Referer: "https://scl.gg/",
        },
        signal: controller.signal,
      },
    );

    if (!response.ok || !response.body) {
      console.error("SSE stream failed:", response.status);
      clearTimeout(timeout);
      // Upload already succeeded, just mark as complete
      await progressFn(100, "completed", "Upload complete!");
      return;
    }

    console.log("SSE stream connected, reading events...");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events - handle both \n\n and \r\n\r\n delimiters
        const events = buffer.split(/\r?\n\r?\n/);
        buffer = events.pop() ?? "";

        for (const eventBlock of events) {
          if (!eventBlock.trim()) continue;

          let data = "";
          for (const line of eventBlock.split(/\r?\n/)) {
            if (line.startsWith("data:")) {
              data = line.slice(5).trim();
            } else if (line.startsWith("data: ")) {
              data = line.slice(6);
            }
          }

          if (!data) continue;

          try {
            const parsed = JSON.parse(data);
            console.log("SSE event:", parsed.status, parsed.progress);

            if (parsed.status === "queued") {
              await progressFn(92, "processing", "Queued for processing...");
            } else if (parsed.status === "extracting") {
              const p = parsed.progress ?? 0;
              await progressFn(92 + p * 0.03, "processing", `Extracting... ${p}%`);
            } else if (parsed.status === "parsing") {
              await progressFn(96, "processing", "Parsing demo...");
            } else if (parsed.status === "completed") {
              await progressFn(100, "completed", "Completed!");
              clearTimeout(timeout);
              reader.cancel();
              return;
            }
          } catch {
            console.log("SSE parse error for data:", data.substring(0, 100));
          }
        }
      }
    } catch (e: any) {
      if (e?.name === "AbortError") {
        console.log("SSE aborted by timeout");
      } else {
        console.error("SSE read error:", e);
      }
    }

    clearTimeout(timeout);
  } catch (error: any) {
    if (error?.name !== "AbortError") {
      console.error("SSE monitoring error:", error);
    }
  }

  // If we get here without "completed", the upload is still done - just mark complete
  await progressFn(100, "completed", "Upload complete!");
}

async function uploadDemoToScl(
  demoUrl: string,
  fileName: string,
  faceitId: string,
): Promise<string> {
  // 1. Check SCL session
  const session = await getSclSession();
  if (!session) {
    throw FaceitErrors.NOT_LOGGED_IN_TO_SCL;
  }

  const userId = session.user.id;

  // 2. Determine team/user upload target
  const hasDefaultTeam =
    !!session.user.defaultTeamId && session.user.defaultTeamId !== "";
  const teamId = hasDefaultTeam ? session.user.defaultTeamId : userId;
  const libraryType = hasDefaultTeam ? "team" : "user";

  let organizationId = "1";
  if (hasDefaultTeam && session.user.defaultTeam?.organization) {
    organizationId = String(session.user.defaultTeam.organization.id);
  }

  console.log(
    `SCL upload target: ${libraryType}, teamId=${teamId}, orgId=${organizationId}`,
  );

  // Helper to set progress with fileName always included
  const progress = (p: number, phase: UploadProgress["phase"], text?: string) =>
    setProgress(faceitId, p, phase, text, fileName);

  // 3. Download the demo file with progress tracking
  console.log(`Downloading demo from: ${demoUrl}`);
  await progress(0, "download");

  const demoResponse = await fetch(demoUrl);
  if (!demoResponse.ok) {
    throw new Error(`Failed to download demo: ${demoResponse.status}`);
  }

  const contentLength = demoResponse.headers.get("Content-Length");
  const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;

  let demoData: ArrayBuffer;

  if (totalBytes && demoResponse.body) {
    const reader = demoResponse.body.getReader();
    const chunks: Uint8Array[] = [];
    let receivedBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      receivedBytes += value.length;
      const downloadProgress = (receivedBytes / totalBytes) * 50;
      await progress( downloadProgress, "download");
    }

    const combined = new Uint8Array(receivedBytes);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }
    demoData = combined.buffer;
  } else {
    demoData = await demoResponse.arrayBuffer();
    await progress( 50, "download");
  }

  const fileSize = demoData.byteLength;
  console.log(`Downloaded demo: ${fileSize} bytes`);

  // 4. Create multipart upload
  console.log("Creating multipart upload on SCL...");
  await progress( 50, "upload");

  const createResponse = await sclFetch(
    `${SCL_STORAGE_URL}/api/v1/media/r2/create-multipart`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://scl.gg",
        Referer: "https://scl.gg/",
      },
      body: JSON.stringify({
        fileName,
        fileSize,
        libraryType,
        organizationId,
        teamId,
        userId,
      }),
    },
  );

  if (!createResponse.ok) {
    const errorText = await createResponse.text();
    console.error("Failed to create multipart upload:", errorText);
    throw new Error("Failed to create multipart upload on SCL");
  }

  const createData = await createResponse.json();
  const { key, uploadId, s3UploadId } = createData as {
    key: string;
    uploadId: string;
    s3UploadId: string;
  };

  console.log(`Created multipart upload: key=${key}, uploadId=${uploadId}`);

  // 5. Pre-sign all parts in parallel, then upload with high concurrency
  const totalParts = Math.ceil(fileSize / MULTIPART_CHUNK_SIZE);
  const parts: { PartNumber: number; ETag: string }[] = new Array(totalParts);
  let completedParts = 0;

  // Pre-sign all parts at once (much faster than signing one-by-one)
  console.log(`Pre-signing ${totalParts} parts...`);
  await progress(51, "upload", "Preparing upload...");

  const signedUrls: string[] = new Array(totalParts);
  const signPromises = [];
  for (let i = 0; i < totalParts; i++) {
    const partNumber = i + 1;
    const signParams = new URLSearchParams({
      key,
      uploadId: s3UploadId,
      partNumber: String(partNumber),
    });

    signPromises.push(
      sclFetch(
        `${SCL_STORAGE_URL}/api/v1/media/r2/sign-part?${signParams}`,
        {
          headers: {
            Origin: "https://scl.gg",
            Referer: "https://scl.gg/",
          },
        },
      ).then(async (res) => {
        if (!res.ok) throw new Error(`Failed to sign part ${partNumber}: ${res.status}`);
        const data = await res.json();
        if (!data.url) throw new Error(`No signed URL for part ${partNumber}`);
        signedUrls[i] = data.url;
      }),
    );
  }
  await Promise.all(signPromises);
  console.log(`All ${totalParts} parts pre-signed`);

  // Upload parts using pre-signed URLs
  async function uploadPart(partIndex: number): Promise<void> {
    const partNumber = partIndex + 1;
    const start = partIndex * MULTIPART_CHUNK_SIZE;
    const end = Math.min(start + MULTIPART_CHUNK_SIZE, fileSize);
    const chunk = demoData.slice(start, end);

    const uploadResponse = await fetch(signedUrls[partIndex], {
      method: "PUT",
      body: chunk,
    });

    if (!uploadResponse.ok) {
      const uploadError = await uploadResponse.text();
      throw new Error(`Failed to upload part ${partNumber}: ${uploadResponse.status} ${uploadError}`);
    }

    const etag = uploadResponse.headers.get("ETag");
    if (!etag) {
      throw new Error(`No ETag returned for part ${partNumber}`);
    }

    parts[partIndex] = { PartNumber: partNumber, ETag: etag };
    completedParts++;

    // Upload progress: 52% + (completed / total) * 38%
    const uploadProgress = 52 + (completedParts / totalParts) * 38;
    await progress(uploadProgress, "upload");
    console.log(`Part ${partNumber}/${totalParts} uploaded`);
  }

  // Upload parts with concurrency limit
  console.log(`Uploading ${totalParts} parts (${PARALLEL_UPLOADS} concurrent)...`);
  for (let i = 0; i < totalParts; i += PARALLEL_UPLOADS) {
    const batch = [];
    for (let j = i; j < Math.min(i + PARALLEL_UPLOADS, totalParts); j++) {
      batch.push(uploadPart(j));
    }
    await Promise.all(batch);
  }

  // 6. Complete multipart upload
  console.log("Completing multipart upload...");
  await progress( 91, "processing", "Finalizing upload...");

  const completeResponse = await sclFetch(
    `${SCL_STORAGE_URL}/api/v1/media/r2/complete-multipart`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://scl.gg",
        Referer: "https://scl.gg/",
      },
      body: JSON.stringify({
        fileName,
        fileSize,
        key,
        libraryType,
        organizationId,
        parts,
        s3UploadId,
        teamId,
        uploadId,
      }),
    },
  );

  if (!completeResponse.ok) {
    const errorText = await completeResponse.text();
    console.error("Failed to complete multipart upload:", errorText);
    throw new Error("Failed to complete multipart upload on SCL");
  }

  console.log(`Upload complete, monitoring parsing for ${uploadId}...`);

  // 7. Monitor SSE parsing progress
  await monitorParsing(uploadId, faceitId, progress);

  console.log(`Successfully uploaded and parsed demo on SCL: ${uploadId}`);
  return uploadId;
}

async function onMessage(
  request: ServiceWorkerMessage,
  sender: chrome.runtime.MessageSender,
) {
  try {
    switch (request.type) {
      case ServiceWorkerMessageType.SEND_TO_SCL: {
        if (!FACEIT_ORIGINS.includes(new URL(sender.url ?? "").origin)) {
          throw new Error("SEND_TO_SCL was not called from FACEIT origin");
        }

        const { url, faceitId } = request.payload;

        const urlPath = new URL(url).pathname;
        const fileName =
          urlPath.split("/").pop() ?? `${faceitId}.dem.zst`;

        console.log(`Uploading demo for FACEIT match ${faceitId} to SCL`);
        const sclUploadId = await uploadDemoToScl(url, fileName, faceitId);

        const processedMatches = await getProcessedDemos();
        if (
          !processedMatches.some((match) => match.faceitId === faceitId)
        ) {
          processedMatches.push({
            sclUploadId,
            faceitId,
            timestamp: Date.now(),
          });

          await chrome.storage.local.set({
            [PROCESSED_MATCHES_STORAGE_KEY]: processedMatches,
          });
        }

        await clearProgress(faceitId);
        return { id: sclUploadId };
      }

      case ServiceWorkerMessageType.GET_PROCESSED_DEMO: {
        if (!FACEIT_ORIGINS.includes(new URL(sender.url ?? "").origin)) {
          throw new Error(
            "GET_PROCESSED_DEMO was not called from FACEIT origin",
          );
        }

        const processedDemos = await getProcessedDemos();
        if (!processedDemos) return undefined;

        const searchId = request.payload.faceitId;
        // Support both exact match and prefix match (e.g., "abc123" matches "abc123_map1")
        return processedDemos.find(
          (demo) =>
            demo.faceitId === searchId ||
            demo.faceitId.startsWith(searchId + "_map"),
        );
      }

      case ServiceWorkerMessageType.CHECK_SCL_STATUS: {
        const { matchId, mapIndex } = request.payload;
        return await checkSclDemoStatus(matchId, mapIndex);
      }
    }
  } catch (error) {
    console.error(error);
    // Try to clear progress for the current upload
    try {
      if (request.type === ServiceWorkerMessageType.SEND_TO_SCL) {
        await clearProgress(request.payload.faceitId);
      }
    } catch {}
    if (error === FaceitErrors.NOT_LOGGED_IN_TO_SCL) {
      return { error: FaceitErrors.NOT_LOGGED_IN_TO_SCL };
    }
    return { error: String(error) };
  }
}

chrome.runtime.onMessage.addListener(
  (request: ServiceWorkerMessage, sender, sendResponse) => {
    onMessage(request, sender).then(sendResponse);
    return true;
  },
);

chrome.runtime.onInstalled.addListener(async () => {
  const { [INTRO_SHOWN_STORAGE_KEY]: introShown } =
    (await chrome.storage.local.get(INTRO_SHOWN_STORAGE_KEY)) as {
      [INTRO_SHOWN_STORAGE_KEY]?: true;
    };
  if (introShown) return;
  await chrome.storage.local.set({ [INTRO_SHOWN_STORAGE_KEY]: true });
  await chrome.tabs.create({ url: chrome.runtime.getURL("public/intro.html") });
});
