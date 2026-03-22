import useTurnstileCaptcha from "./useTurnstile";
import React, { useEffect, useRef, useState } from "react";

// Inject keyframe styles once via textContent (avoids innerHTML)
function useInjectStyles() {
  useEffect(() => {
    if (document.getElementById("__csn-scl-keyframes")) return;
    const style = document.createElement("style");
    style.id = "__csn-scl-keyframes";
    style.textContent = `
      @keyframes csn-shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(350%); } }
      @keyframes csn-gradient { 0%,100% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } }
      @keyframes csn-pulse { 0%,100% { opacity: 0.4; } 50% { opacity: 1; } }
    `;
    document.head.appendChild(style);
  }, []);
}
import {
  FaceitErrors,
  ServiceWorkerMessage,
  ServiceWorkerMessageType,
} from "../messages";
import FaceitToast from "./FaceitToast";
import { ProcessedMatch, UploadProgress } from "../storage";
import { sendMessage } from "../helpers";

function getFaceitMatchId() {
  const regex = /https:\/\/(?:www\.)?faceit\.com\/.+\/cs.+\/room\/([^?/]*)/;
  const match = regex.exec(location.href);
  const id = match?.[1];
  if (!id) throw new Error("Could not get FACEIT match ID from URL");
  return id;
}

interface DemoInfo {
  url: string;
  label: string;
  index: number;
}

interface DemoUploadState {
  loading: boolean;
  uploaded: boolean;
  existsOnScl: boolean;
  error?: string;
  showLoginButton: boolean;
}

// ── Perceived progress hook ──
// Uses research-backed UX patterns:
// - Endowed progress: starts at 12% so users feel momentum immediately
// - Smooth interpolation: never jumps, always animates toward target
// - Auto-creep: slowly advances even between updates to avoid "stuck" feeling
// - Acceleration: moves faster near the end (goal gradient effect)
// - Deceleration near phase boundaries to smooth transitions

function usePerceivedProgress(realProgress: number | null, isActive: boolean) {
  const [display, setDisplay] = useState(0);
  const targetRef = useRef(0);
  const displayRef = useRef(0);
  const rafRef = useRef<number>();

  useEffect(() => {
    if (!isActive) {
      displayRef.current = 0;
      setDisplay(0);
      return;
    }

    // Map real 0-100 to perceived 12-100 (endowed progress)
    const perceived = realProgress !== null ? 12 + realProgress * 0.88 : 12;
    targetRef.current = Math.max(targetRef.current, perceived); // Never go backwards
  }, [realProgress, isActive]);

  useEffect(() => {
    if (!isActive) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }

    let lastTime = performance.now();

    function tick(now: number) {
      const dt = Math.min(now - lastTime, 100) / 1000; // seconds, capped
      lastTime = now;

      const target = targetRef.current;
      const current = displayRef.current;
      const gap = target - current;

      // Speed increases as we get closer to 100% (goal gradient)
      const baseSpeed = 8 + (current / 100) * 15;

      // Smooth interpolation toward target
      let advance = gap * baseSpeed * dt;

      // Auto-creep: always advance slowly to avoid "stuck" feeling
      // Faster creep early (0.5%/sec), slower near end (0.1%/sec)
      if (Math.abs(gap) < 2 && current < 95) {
        const creepRate = current < 50 ? 0.5 : current < 80 ? 0.3 : 0.15;
        advance = Math.max(advance, creepRate * dt);
      }

      const next = Math.min(current + Math.max(advance, 0), 100);
      displayRef.current = next;
      setDisplay(next);

      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isActive]);

  return Math.round(display);
}

function useUploadProgress(faceitId: string | undefined) {
  const [progress, setProgress] = useState<UploadProgress | null>(null);

  useEffect(() => {
    if (!faceitId) return;

    function onProgress(event: Event) {
      const detail = (event as CustomEvent).detail as UploadProgress | undefined;
      if (detail && detail.faceitId === faceitId) {
        setProgress(detail);
      } else if (!detail) {
        setProgress(null);
      }
    }

    document.addEventListener("faceitToScl__progress", onProgress);
    return () =>
      document.removeEventListener("faceitToScl__progress", onProgress);
  }, [faceitId]);

  return progress;
}

function getPhaseLabel(phase: string, displayProgress: number): string {
  if (phase === "download") return `DOWNLOADING... ${displayProgress}%`;
  if (phase === "upload") return `UPLOADING TO SCL... ${displayProgress}%`;
  if (phase === "processing") return `PROCESSING ON SCL... ${displayProgress}%`;
  return `COMPLETE!`;
}

function DemoUploadButton({
  demo,
  state,
  onUpload,
  isMultiple,
  activeFaceitId,
}: {
  demo: DemoInfo;
  state: DemoUploadState;
  onUpload: () => void;
  isMultiple: boolean;
  activeFaceitId: string | undefined;
}) {
  useInjectStyles();
  const rawProgress = useUploadProgress(activeFaceitId);
  const displayProgress = usePerceivedProgress(
    rawProgress?.progress ?? null,
    state.loading,
  );

  const label = isMultiple ? `UPLOAD TO SCL: ${demo.label}` : "UPLOAD TO SCL";
  const uploadedLabel = isMultiple ? `UPLOADED: ${demo.label}` : "UPLOADED TO SCL";
  const existsLabel = isMultiple ? `ON SCL: ${demo.label}` : "ALREADY ON SCL";

  if (state.showLoginButton) {
    return (
      <a
        className="csn:bg-scl csn:drop-shadow-glow csn:mt-2.5 csn:mb-2.5 csn:block csn:h-8 csn:w-full csn:rounded-sm csn:px-6 csn:py-2 csn:text-center csn:font-bold csn:text-white csn:brightness-100 csn:transition-all csn:duration-100 csn:hover:brightness-125"
        href="https://scl.gg"
        target="_blank"
        rel="noreferrer"
      >
        LOG IN TO SCL
      </a>
    );
  }

  if (state.loading) {
    const phase = rawProgress?.phase ?? "download";
    const isComplete = phase === "completed";

    return (
      <>
        <div className="csn:drop-shadow-glow csn:relative csn:mt-2.5 csn:mb-2.5 csn:h-8 csn:w-full csn:overflow-hidden csn:rounded-sm csn:bg-scl/20">
          {/* Animated gradient fill */}
          <div
            className="csn:absolute csn:inset-y-0 csn:left-0"
            style={{
              width: `${displayProgress}%`,
              background: isComplete
                ? "rgb(34 197 94)"
                : undefined,
              backgroundImage: isComplete
                ? undefined
                : "linear-gradient(90deg, #0891d1, #0BAEEA, #38bdf8, #0BAEEA, #0891d1)",
              backgroundSize: isComplete ? undefined : "200% 100%",
              animation: isComplete ? undefined : "csn-gradient 2s ease-in-out infinite",
              transition: "width 0.15s linear",
            }}
          />
          {/* Shimmer sweep */}
          {!isComplete && (
            <div
              className="csn:absolute csn:inset-y-0 csn:left-0 csn:overflow-hidden"
              style={{ width: `${displayProgress}%` }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "40%",
                  height: "100%",
                  background:
                    "linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)",
                  animation: "csn-shimmer 1.2s ease-in-out infinite",
                }}
              />
            </div>
          )}
          {/* Pulsing edge glow */}
          {!isComplete && displayProgress > 5 && (
            <div
              className="csn:absolute csn:inset-y-0"
              style={{
                left: `${displayProgress - 1}%`,
                width: "6px",
                background: "radial-gradient(ellipse at center, rgba(56,189,248,0.6), transparent)",
                animation: "csn-pulse 1.5s ease-in-out infinite",
              }}
            />
          )}
          {/* Label */}
          <div className="csn:relative csn:z-10 csn:flex csn:h-full csn:items-center csn:justify-center">
            <span className="csn:font-bold csn:text-white csn:text-xs csn:drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">
              {isComplete
                ? "COMPLETE!"
                : getPhaseLabel(phase, displayProgress)}
            </span>
          </div>
        </div>
        {state.error && (
          <p className="csn:mb-2 csn:text-center csn:text-xs csn:text-red-400">
            {state.error}
          </p>
        )}
      </>
    );
  }

  if (state.uploaded || state.existsOnScl) {
    return (
      <div className="csn:!bg-scl csn:drop-shadow-glow csn:mt-2.5 csn:mb-2.5 csn:flex csn:h-8 csn:w-full csn:items-center csn:justify-center csn:gap-2 csn:rounded-sm csn:px-6 csn:py-2 csn:font-bold csn:text-white csn:brightness-75">
        {state.uploaded ? uploadedLabel : existsLabel}
      </div>
    );
  }

  return (
    <>
      <button
        className="csn:bg-scl csn:drop-shadow-glow csn:mt-2.5 csn:mb-2.5 csn:block csn:h-8 csn:w-full csn:cursor-pointer csn:rounded-sm csn:border-0 csn:px-6 csn:py-2 csn:font-bold csn:text-white csn:brightness-100 csn:transition-all csn:duration-100 csn:hover:brightness-125"
        onClick={onUpload}
      >
        {label}
      </button>
      {state.error && (
        <p className="csn:mb-2 csn:text-center csn:text-xs csn:text-red-400">
          {state.error}
        </p>
      )}
    </>
  );
}

export default function FaceitToSclButton() {
  const { component: Captcha, getToken } = useTurnstileCaptcha("scl");

  const [demos, setDemos] = useState<DemoInfo[]>([]);
  const [demoStates, setDemoStates] = useState<Record<number, DemoUploadState>>({});
  const [activeFaceitIds, setActiveFaceitIds] = useState<Record<number, string>>({});
  const [globalError, setGlobalError] = useState<string>();
  const [showToast, setShowToast] = useState(false);

  function updateDemoState(index: number, update: Partial<DemoUploadState>) {
    setDemoStates((prev) => ({
      ...prev,
      [index]: { ...prev[index], ...update },
    }));
  }

  function getDefaultState(): DemoUploadState {
    return { loading: false, uploaded: false, existsOnScl: false, showLoginButton: false };
  }

  useEffect(() => {
    (async () => {
      const id = getFaceitMatchId();

      try {
        const response = await fetch(
          `https://www.faceit.com/api/match/v2/match/${id}`,
        );
        if (!response.ok) {
          setGlobalError("Could not get FACEIT match details. Is FACEIT down?");
          return;
        }
        const matchDetails = await response.json();
        const demoURLs: string[] = matchDetails.payload.demoURLs ?? [];

        if (demoURLs.length === 0) {
          setGlobalError("No demo URLs found for this match.");
          return;
        }

        let mapNames: string[] = [];
        try {
          const voting = matchDetails.payload.voting;
          if (voting?.map?.pick) {
            mapNames = Array.isArray(voting.map.pick) ? voting.map.pick : [voting.map.pick];
          } else if (voting?.map?.entities) {
            mapNames = voting.map.entities.map((e: any) => e.game_map_id || e.name || e.class_name);
          }
        } catch {}

        const demoInfos: DemoInfo[] = demoURLs.map((url, i) => ({
          url, label: mapNames[i] || `Map ${i + 1}`, index: i,
        }));

        setDemos(demoInfos);

        const initialStates: Record<number, DemoUploadState> = {};
        demoInfos.forEach((d) => { initialStates[d.index] = getDefaultState(); });
        setDemoStates(initialStates);

        for (const demo of demoInfos) {
          const demoFaceitId = `${id}_map${demo.index + 1}`;
          const processed: ProcessedMatch | undefined = await sendMessage({
            type: ServiceWorkerMessageType.GET_PROCESSED_DEMO,
            payload: { faceitId: demoFaceitId },
          } satisfies ServiceWorkerMessage);

          if (processed) {
            initialStates[demo.index] = { ...getDefaultState(), uploaded: true };
            continue;
          }

          const sclStatus: { status: string; mapId?: string } = await sendMessage({
            type: ServiceWorkerMessageType.CHECK_SCL_STATUS,
            payload: { matchId: id, mapIndex: demo.index },
          } satisfies ServiceWorkerMessage);

          if (sclStatus?.status === "completed") {
            initialStates[demo.index] = { ...getDefaultState(), existsOnScl: true };
          }
        }
        setDemoStates({ ...initialStates });
      } catch (error) {
        console.error(error);
        setGlobalError("Failed to load match details.");
      }
    })();
  }, []);

  async function handleUpload(demo: DemoInfo) {
    const id = getFaceitMatchId();
    const faceitId = `${id}_map${demo.index + 1}`;

    setActiveFaceitIds((prev) => ({ ...prev, [demo.index]: faceitId }));
    updateDemoState(demo.index, { loading: true, error: undefined });

    try {
      const token = await getToken();

      const faceitDemoResponse = await fetch(
        `https://www.faceit.com/api/download/v2/demos/download-url`,
        {
          method: "POST",
          body: JSON.stringify({ resource_url: demo.url, captcha_token: token }),
        },
      );
      if (!faceitDemoResponse.ok) {
        updateDemoState(demo.index, { loading: false, error: "Could not get demo URL. Is FACEIT down?" });
        return;
      }

      const faceitDemoData = await faceitDemoResponse.json();
      const url = faceitDemoData.payload.download_url;

      const response: { error: string } | { id: string } = await sendMessage({
        type: ServiceWorkerMessageType.SEND_TO_SCL,
        payload: { url, faceitId },
      } satisfies ServiceWorkerMessage);

      if (!response || "error" in response) {
        if (!response) {
          updateDemoState(demo.index, { loading: false, error: "No response from extension" });
        } else if (response.error === FaceitErrors.NOT_LOGGED_IN_TO_SCL) {
          updateDemoState(demo.index, { loading: false, error: "Please log in to SCL and refresh.", showLoginButton: true });
        } else {
          throw new Error(response.error);
        }
        return;
      }

      updateDemoState(demo.index, { loading: false, uploaded: true });
      setShowToast(true);
    } catch (error) {
      console.error(error);
      updateDemoState(demo.index, { loading: false, error: error.toString() });
    }
  }

  useEffect(() => {
    if (showToast) {
      const timeout = setTimeout(() => setShowToast(false), 5_000);
      return () => clearTimeout(timeout);
    }
  }, [showToast]);

  const isMultiple = demos.length > 1;

  return (
    <>
      {globalError && (
        <p className="csn:mb-5 csn:text-center csn:text-red-400">{globalError}</p>
      )}

      {demos.map((demo) => (
        <DemoUploadButton
          key={demo.index}
          demo={demo}
          state={demoStates[demo.index] ?? getDefaultState()}
          onUpload={() => handleUpload(demo)}
          isMultiple={isMultiple}
          activeFaceitId={activeFaceitIds[demo.index]}
        />
      ))}

      {showToast && (
        <FaceitToast>
          <div className="csn:px-1.5 csn:py-2 csn:text-left csn:font-bold">
            <h2 className="csn:m-0 csn:pb-2">Demo uploaded to SCL</h2>
            <p className="csn:m-0">Demo has been uploaded and parsed successfully.</p>
          </div>
          <button
            className="csn:w-8 csn:rounded-sm csn:border-0 csn:bg-transparent csn:p-1 csn:text-white/60 csn:transition-colors csn:hover:bg-[#484848]/80"
            onClick={() => setShowToast(false)}
          >
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" height="24" width="24">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z" fill="currentColor" />
            </svg>
          </button>
        </FaceitToast>
      )}

      <Captcha />
    </>
  );
}
