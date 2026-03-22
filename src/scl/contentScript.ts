// MAIN world content script for scl.gg
// Intercepts fetch/XHR calls to faceit-import/check to track demo import status
// and updates the "Import FACEIT Demo" dialog.

let statusElement: HTMLElement | null = null;

function parseMapId(mapId: string): { map: string; team1: string; team2: string } | null {
  // mapId format: "159900-3-de_overpass-TeamA-TeamB"
  const match = mapId.match(/^\d+-\d+-([^-]+)-(.+)-(.+)$/);
  if (match) {
    return { map: match[1], team1: match[2], team2: match[3] };
  }
  return null;
}

function updateDialog(status: string, mapId?: string) {
  const dialog = document.querySelector('[role="alertdialog"]');
  if (!dialog) return;

  const title = dialog.querySelector('[data-slot="alert-dialog-title"]');
  if (!title?.textContent?.includes("Import FACEIT Demo")) return;

  if (!statusElement) {
    statusElement = document.createElement("div");
    statusElement.id = "__faceit-to-scl-status";
    statusElement.style.cssText =
      "padding: 10px 14px; border-radius: 8px; margin-top: 8px; font-size: 13px; font-weight: 600; text-align: center; transition: all 0.3s ease;";

    const footer = dialog.querySelector('[data-slot="alert-dialog-footer"]');
    if (footer) {
      footer.parentElement?.insertBefore(statusElement, footer);
    }
  }

  if (status === "completed") {
    let label = "Demo is ready";
    if (mapId) {
      const parsed = parseMapId(mapId);
      if (parsed) {
        label = `${parsed.map} ${parsed.team1} vs ${parsed.team2} imported`;
      }
    }

    statusElement.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; gap: 8px;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgb(34 197 94)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;">
          <path d="M20 6 9 17l-5-5"/>
        </svg>
        <span>${label} — click <strong>Retry</strong> to play</span>
      </div>
    `;
    statusElement.style.backgroundColor = "rgb(22 163 74 / 0.12)";
    statusElement.style.color = "rgb(34 197 94)";
    statusElement.style.border = "1px solid rgb(34 197 94 / 0.3)";

    // Highlight the Retry button
    const buttons = dialog.querySelectorAll("button");
    buttons.forEach((btn) => {
      if (btn.textContent?.trim() === "Retry") {
        btn.style.backgroundColor = "rgb(34 197 94)";
        btn.style.color = "white";
        btn.style.borderColor = "rgb(34 197 94)";
        btn.style.transition = "all 0.3s ease";
      }
    });
  } else if (status === "pending") {
    statusElement.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; gap: 6px;">
        <span style="display: inline-block; animation: __scl-spin 1s linear infinite; width: 14px; height: 14px; border: 2px solid rgb(234 179 8 / 0.3); border-top-color: rgb(234 179 8); border-radius: 50%;"></span>
        <span>Waiting for demo — upload it from FACEIT using the extension</span>
      </div>
    `;
    statusElement.style.backgroundColor = "rgb(234 179 8 / 0.08)";
    statusElement.style.color = "rgb(234 179 8)";
    statusElement.style.border = "1px solid rgb(234 179 8 / 0.25)";

    // Inject keyframes if not already
    if (!document.getElementById("__scl-ext-styles")) {
      const style = document.createElement("style");
      style.id = "__scl-ext-styles";
      style.textContent = `@keyframes __scl-spin { to { transform: rotate(360deg); } }`;
      document.head.appendChild(style);
    }
  }
}

function handleCheckResponse(url: string, responseText: string) {
  if (!url.includes("faceit-import/check")) return;
  try {
    const data = JSON.parse(responseText);
    updateDialog(data.status, data.mapId);
  } catch {
    // Ignore
  }
}

// Intercept fetch
const originalFetch = window.fetch;
window.fetch = async function (...args: Parameters<typeof fetch>) {
  const url = (args[0] as string)?.toString?.() || "";
  const response = await originalFetch.apply(this, args);

  if (url.includes("faceit-import/check")) {
    try {
      const cloned = response.clone();
      const data = await cloned.json();
      updateDialog(data.status, data.mapId);
    } catch {
      // Ignore
    }
  }

  return response;
};

// Intercept XMLHttpRequest
const originalXHROpen = XMLHttpRequest.prototype.open;
const originalXHRSend = XMLHttpRequest.prototype.send;

XMLHttpRequest.prototype.open = function (
  method: string,
  url: string | URL,
  ...rest: any[]
) {
  (this as any).__sclUrl = url.toString();
  return originalXHROpen.apply(this, [method, url, ...rest] as any);
};

XMLHttpRequest.prototype.send = function (...args: any[]) {
  const url = (this as any).__sclUrl as string;
  if (url?.includes("faceit-import/check")) {
    this.addEventListener("load", function () {
      handleCheckResponse(url, this.responseText);
    });
  }
  return originalXHRSend.apply(this, args as any);
};

// Reset status element when dialog is removed/recreated
const observer = new MutationObserver(() => {
  if (statusElement && !document.contains(statusElement)) {
    statusElement = null;
  }
});
observer.observe(document.body, { childList: true, subtree: true });
