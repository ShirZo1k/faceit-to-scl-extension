import { UPLOAD_PROGRESS_KEY, UploadProgressMap } from "../storage";

console.log("Loaded FACEIT to SCL extension for FACEIT injection");

(async () => {
  // Send message to background with retries (Firefox event page may need time to wake)
  async function sendToBackground(payload: any, retries = 3): Promise<any> {
    for (let i = 0; i < retries; i++) {
      try {
        return await chrome.runtime.sendMessage(payload);
      } catch (err) {
        if (i < retries - 1) {
          await new Promise((r) => setTimeout(r, 500 * (i + 1)));
        } else {
          throw err;
        }
      }
    }
  }

  // Page <-> extension proxy
  window.addEventListener("message", async (event) => {
    if (event.data && event.data.type == "fromPage") {
      try {
        const response = await sendToBackground(event.data.payload);
        window.postMessage({ type: "fromExtension", payload: response });
      } catch (err) {
        console.error("FACEIT to SCL: failed to send message to background", err);
        window.postMessage({ type: "fromExtension", payload: { error: String(err) } });
      }
    }
  });

  // Forward upload progress changes to the page
  chrome.storage.onChanged.addListener((changes) => {
    if (changes[UPLOAD_PROGRESS_KEY]) {
      const progressMap = changes[UPLOAD_PROGRESS_KEY].newValue as
        | UploadProgressMap
        | undefined;
      if (progressMap) {
        // Dispatch individual progress events for each faceitId
        // JSON-stringify detail to avoid Firefox Xray wrapper issues
        // (CustomEvent.detail doesn't use structured cloning across worlds)
        for (const progress of Object.values(progressMap)) {
          document.dispatchEvent(
            new CustomEvent("faceitToScl__progress", {
              detail: JSON.stringify(progress),
            }),
          );
        }
      }
    }
  });
})();
