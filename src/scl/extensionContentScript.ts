// Extension-context content script for scl.gg
// Shows real-time upload progress for multiple demos from the service worker.

import { UPLOAD_PROGRESS_KEY, UploadProgress, UploadProgressMap } from "../storage";

const BRAND = "#0BAEEA";
const BRAND_RGB = "11,174,234";

interface DemoEntry {
  faceitId: string;
  progress: UploadProgress;
  displayValue: number;
  targetValue: number;
}

let container: HTMLElement | null = null;
let headerEl: HTMLElement | null = null;
let entriesEl: HTMLElement | null = null;
let closeBtn: HTMLElement | null = null;
let entries: Map<string, DemoEntry> = new Map();
let rafId: number | null = null;
let hideTimeout: ReturnType<typeof setTimeout> | null = null;

function injectStyles() {
  if (document.getElementById("__scl-progress-styles")) return;
  const style = document.createElement("style");
  style.id = "__scl-progress-styles";
  style.textContent = `
    @keyframes __scl-shimmer {
      0% { transform: translateX(-100%); }
      100% { transform: translateX(350%); }
    }
    @keyframes __scl-gradient {
      0%, 100% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
    }
    @keyframes __scl-pulse {
      0%, 100% { opacity: 0.4; }
      50% { opacity: 1; }
    }
    @keyframes __scl-fade-in {
      from { opacity: 0; transform: translateY(16px) scale(0.97); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    @keyframes __scl-fade-out {
      from { opacity: 1; transform: translateY(0) scale(1); }
      to { opacity: 0; transform: translateY(16px) scale(0.97); }
    }
    #__faceit-to-scl-progress .scl-close:hover { background: rgba(255,255,255,0.1) !important; }
  `;
  document.head.appendChild(style);
}

function formatFileName(name?: string): string {
  if (!name) return "Demo";
  return name.replace(/\.dem\.zst$/, "").replace(/\.dem$/, "");
}

function getPhaseText(phase: string): string {
  if (phase === "download") return "Downloading";
  if (phase === "upload") return "Uploading";
  if (phase === "processing") return "Processing";
  return "Complete";
}

function destroyContainer() {
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  if (hideTimeout) { clearTimeout(hideTimeout); hideTimeout = null; }
  container?.remove();
  container = null;
  headerEl = null;
  entriesEl = null;
  closeBtn = null;
  entries.clear();
}

function createContainer() {
  if (container) return;
  injectStyles();

  container = document.createElement("div");
  container.id = "__faceit-to-scl-progress";
  container.style.cssText = `
    position: fixed; bottom: 20px; right: 20px; width: 340px;
    background: linear-gradient(145deg, #111827, #0d1117);
    border: 1px solid rgba(${BRAND_RGB},0.25);
    border-radius: 14px; padding: 14px 16px; z-index: 99999;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5), 0 0 24px rgba(${BRAND_RGB},0.08);
    animation: __scl-fade-in 0.35s ease-out;
    max-height: 420px; overflow-y: auto;
  `;

  // Header with title and close button
  headerEl = document.createElement("div");
  headerEl.style.cssText = "display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;";

  const titleEl = document.createElement("div");
  titleEl.style.cssText = `display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700; color: ${BRAND}; letter-spacing: 0.6px; text-transform: uppercase;`;
  titleEl.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${BRAND}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
    FACEIT → SCL
  `;

  closeBtn = document.createElement("button");
  closeBtn.className = "scl-close";
  closeBtn.style.cssText = `
    background: none; border: none; color: #6b7280; cursor: pointer;
    padding: 2px; border-radius: 4px; display: flex; align-items: center;
    justify-content: center; transition: background 0.15s, color 0.15s;
    display: none;
  `;
  closeBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>`;
  closeBtn.addEventListener("click", () => {
    if (container) {
      container.style.animation = "__scl-fade-out 0.25s ease-in forwards";
      setTimeout(destroyContainer, 250);
    }
  });

  headerEl.appendChild(titleEl);
  headerEl.appendChild(closeBtn);

  entriesEl = document.createElement("div");
  entriesEl.style.cssText = "display: flex; flex-direction: column; gap: 6px;";

  container.appendChild(headerEl);
  container.appendChild(entriesEl);
  document.body.appendChild(container);
}

function renderEntry(entry: DemoEntry): HTMLElement {
  const isComplete = entry.progress.phase === "completed";
  const perceived = Math.round(12 + entry.displayValue * 0.88);

  const el = document.createElement("div");
  el.style.cssText = `
    background: ${isComplete ? "rgba(34,197,94,0.06)" : `rgba(${BRAND_RGB},0.04)`};
    border: 1px solid ${isComplete ? "rgba(34,197,94,0.15)" : `rgba(${BRAND_RGB},0.1)`};
    border-radius: 8px; padding: 8px 10px;
    transition: all 0.3s ease;
  `;

  const label = document.createElement("div");
  label.style.cssText = "display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;";

  const nameEl = document.createElement("span");
  nameEl.style.cssText = `font-size: 11px; color: ${isComplete ? "#4ade80" : "#d1d5db"}; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 200px;`;
  nameEl.textContent = isComplete
    ? `✓ ${formatFileName(entry.progress.fileName)}`
    : formatFileName(entry.progress.fileName);

  const statusEl = document.createElement("span");
  statusEl.style.cssText = `font-size: 10px; color: ${isComplete ? "#4ade80" : "#9ca3af"}; font-weight: 600; white-space: nowrap; font-variant-numeric: tabular-nums;`;
  statusEl.textContent = isComplete ? "Done" : `${getPhaseText(entry.progress.phase)} ${perceived}%`;

  label.appendChild(nameEl);
  label.appendChild(statusEl);

  const track = document.createElement("div");
  track.style.cssText = `width: 100%; height: 5px; background: ${isComplete ? "rgba(34,197,94,0.1)" : `rgba(${BRAND_RGB},0.08)`}; border-radius: 3px; overflow: hidden; position: relative;`;

  // Animated gradient fill (same as FACEIT button)
  const fill = document.createElement("div");
  if (isComplete) {
    fill.style.cssText = `width: ${perceived}%; height: 100%; border-radius: 3px; background: linear-gradient(90deg, #22c55e, #4ade80); position: absolute; top: 0; left: 0;`;
  } else {
    fill.style.cssText = `width: ${perceived}%; height: 100%; border-radius: 3px; background-image: linear-gradient(90deg, #0891d1, ${BRAND}, #38bdf8, ${BRAND}, #0891d1); background-size: 200% 100%; animation: __scl-gradient 2s ease-in-out infinite; transition: width 0.1s linear; position: absolute; top: 0; left: 0;`;
  }
  track.appendChild(fill);

  if (!isComplete) {
    // Shimmer sweep
    const shimmerClip = document.createElement("div");
    shimmerClip.style.cssText = `position: absolute; top: 0; left: 0; width: ${perceived}%; height: 100%; overflow: hidden;`;
    const shimmer = document.createElement("div");
    shimmer.style.cssText = `position: absolute; top: 0; left: 0; width: 40%; height: 100%; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent); animation: __scl-shimmer 1.2s ease-in-out infinite;`;
    shimmerClip.appendChild(shimmer);
    track.appendChild(shimmerClip);

    // Pulsing edge glow
    if (perceived > 8) {
      const glow = document.createElement("div");
      glow.style.cssText = `position: absolute; top: 0; left: ${perceived - 1}%; width: 4px; height: 100%; background: radial-gradient(ellipse at center, rgba(56,189,248,0.7), transparent); animation: __scl-pulse 1.5s ease-in-out infinite;`;
      track.appendChild(glow);
    }
  }

  el.appendChild(label);
  el.appendChild(track);
  return el;
}

function renderAll() {
  if (!entriesEl) return;
  entriesEl.innerHTML = "";

  const active = [...entries.values()].filter(e => e.progress.phase !== "completed");
  const completed = [...entries.values()].filter(e => e.progress.phase === "completed");

  for (const entry of active) entriesEl.appendChild(renderEntry(entry));
  for (const entry of completed) entriesEl.appendChild(renderEntry(entry));

  // Show close button when all done
  const allDone = active.length === 0 && completed.length > 0;
  if (closeBtn) {
    closeBtn.style.display = allDone ? "flex" : "none";
    closeBtn.style.color = allDone ? "#9ca3af" : "#6b7280";
  }
}

function startAnimation() {
  if (rafId) return;
  let lastTime = performance.now();

  function tick(now: number) {
    const dt = Math.min(now - lastTime, 100) / 1000;
    lastTime = now;

    for (const entry of entries.values()) {
      if (entry.progress.phase === "completed") {
        entry.displayValue = entry.progress.progress;
        continue;
      }

      const target = Math.max(entry.progress.progress, entry.targetValue);
      entry.targetValue = target;

      const gap = target - entry.displayValue;
      const baseSpeed = 8 + (entry.displayValue / 100) * 15;
      let advance = gap * baseSpeed * dt;

      if (Math.abs(gap) < 2 && entry.displayValue < 95) {
        const creepRate = entry.displayValue < 50 ? 0.5 : entry.displayValue < 80 ? 0.3 : 0.15;
        advance = Math.max(advance, creepRate * dt);
      }

      entry.displayValue = Math.min(entry.displayValue + Math.max(advance, 0), 100);
    }

    renderAll();

    if (entries.size > 0) {
      rafId = requestAnimationFrame(tick);
    } else {
      rafId = null;
    }
  }

  rafId = requestAnimationFrame(tick);
}

function handleProgressMap(progressMap: UploadProgressMap) {
  if (hideTimeout) { clearTimeout(hideTimeout); hideTimeout = null; }

  const hasEntries = Object.keys(progressMap).length > 0;
  if (!hasEntries && entries.size === 0) return;

  createContainer();

  for (const [faceitId, progress] of Object.entries(progressMap)) {
    const existing = entries.get(faceitId);
    if (existing) {
      existing.progress = progress;
      existing.targetValue = Math.max(existing.targetValue, progress.progress);
    } else {
      entries.set(faceitId, {
        faceitId, progress,
        displayValue: 12,
        targetValue: progress.progress,
      });
    }
  }

  for (const [faceitId, entry] of entries) {
    if (!progressMap[faceitId] && entry.progress.phase !== "completed") {
      entry.progress = { ...entry.progress, phase: "completed", progress: 100 };
    }
  }

  startAnimation();

  const allDone = [...entries.values()].every(e => e.progress.phase === "completed");
  if (allDone && entries.size > 0) {
    if (container) container.style.borderColor = "rgba(34, 197, 94, 0.25)";

    hideTimeout = setTimeout(() => {
      if (container) {
        container.style.animation = "__scl-fade-out 0.4s ease-in forwards";
        setTimeout(destroyContainer, 400);
      }
    }, 10000);
  }
}

chrome.storage.onChanged.addListener((changes) => {
  if (changes[UPLOAD_PROGRESS_KEY]) {
    const newValue = changes[UPLOAD_PROGRESS_KEY].newValue as UploadProgressMap | undefined;
    handleProgressMap(newValue ?? {});
  }
});

(async () => {
  const { [UPLOAD_PROGRESS_KEY]: existing } =
    await chrome.storage.local.get(UPLOAD_PROGRESS_KEY);
  if (existing && Object.keys(existing).length > 0) {
    handleProgressMap(existing as UploadProgressMap);
  }
})();
