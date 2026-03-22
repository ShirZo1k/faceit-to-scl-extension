import { UPLOAD_PROGRESS_KEY, UploadProgressMap } from "../storage";

console.log("Loaded FACEIT to SCL extension for FACEIT injection");

(async () => {
  // Page <-> extension proxy
  window.addEventListener("message", async (event) => {
    if (event.data && event.data.type == "fromPage") {
      const response = await chrome.runtime.sendMessage(event.data.payload);
      window.postMessage({ type: "fromExtension", payload: response });
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
        for (const progress of Object.values(progressMap)) {
          document.dispatchEvent(
            new CustomEvent("faceitToScl__progress", {
              detail: progress,
            }),
          );
        }
      }
    }
  });
})();
