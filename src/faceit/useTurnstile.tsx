import { defer, retry } from "../helpers";

import React, { useCallback, useEffect, useMemo, useRef } from "react";

interface TurnstileCaptcha {
  component: React.ComponentType;
  getToken(): Promise<string>;
}

export default function useTurnstile(id: string): TurnstileCaptcha {
  const widgetId = `faceit-to-scl__turnstile__${id}`;
  const turnstileSiteKeyPromiseRef = useRef(defer<string>());
  const siteKeySearchedRef = useRef(false);

  const getToken = useCallback(async () => {
    const siteKey = await turnstileSiteKeyPromiseRef.current;
    // Wait up to 3s for Turnstile to load
    await retry(
      () => {
        if (!window.turnstile) {
          throw new Error("Could not find Turnstile loaded");
        }
      },
      30,
      100,
    );

    return new Promise<string>((resolve) => {
      window.turnstile!.render(`#${widgetId}`, {
        sitekey: siteKey,
        action: "matchroomFinished_downloadDemos",
        callback: (token) => {
          resolve(token);
        },
      });
    });
  }, [widgetId]);

  // Extract site key from bundle (only once)
  useEffect(() => {
    if (siteKeySearchedRef.current) return;
    siteKeySearchedRef.current = true;

    (async () => {
      const faceitChunkScripts = [
        ...document.querySelectorAll("script"),
      ].filter((script) =>
        /https:\/\/cdn-frontend\.faceit-cdn\.net\/web-next\/.*\/chunks\/[0-9]+.*\.js/.test(
          script.src,
        ),
      );

      const searchScript = async (chunkScript: HTMLScriptElement) => {
        try {
          const response = await fetch(chunkScript.src);
          if (!response.ok) return null;

          const text = await response.text();

          const patterns = [/"(0x4AAA[a-zA-Z0-9]{18})"/];

          for (const pattern of patterns) {
            const match = pattern.exec(text);
            if (match) {
              const siteKey = match[1];
              return siteKey;
            }
          }
          return null;
        } catch (error) {
          console.error("Unknown error trying to search script", chunkScript);
          return null;
        }
      };

      const searchPromises = faceitChunkScripts.map((script) =>
        searchScript(script),
      );

      const results = await Promise.allSettled(searchPromises);
      for (const result of results) {
        if (result.status === "fulfilled" && result.value) {
          turnstileSiteKeyPromiseRef.current.resolve(result.value);
          return;
        }
      }
    })();
  });

  const component = useCallback(() => <div id={widgetId} />, [widgetId]);

  return useMemo(
    () => ({
      component,
      getToken,
    }),
    [component, getToken],
  );
}

// Turnstile types

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

interface Turnstile {
  render: (
    container?: string | HTMLElement,
    params?: RenderOptions,
  ) => string | undefined;
  execute: (container?: string | HTMLElement, params?: RenderOptions) => void;
  reset: (id?: string) => void;
  remove: (id?: string) => void;
  getResponse: (id?: string) => string | undefined;
  isExpired: (id?: string) => boolean;
}

interface RenderOptions {
  sitekey: string;
  action?: string;
  cData?: string;
  callback?: (token: string) => void;
  "error-callback"?: () => void;
  execution?: "render" | "execute";
  "expired-callback"?: () => void;
  "before-interactive-callback"?: () => void;
  "after-interactive-callback"?: () => void;
  "unsupported-callback"?: () => void;
  theme?: "light" | "dark" | "auto";
  language?: string;
  tabindex?: number;
  "response-field"?: boolean;
  "response-field-name"?: string;
  size?: "normal" | "compact";
  retry?: "auto" | "never";
  "retry-interval"?: number;
  "refresh-expired"?: "auto" | "manual" | "never";
  appearance?: "always" | "execute" | "interaction-only";
}
