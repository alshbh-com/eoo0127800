// Detect whether the page is running inside a Median.co WebView wrapper.
// Median injects `window.median` and sets the user-agent to include "median".
interface MedianBridge {
  onesignal?: {
    externalUserId?: {
      set?: (id: string) => void;
      remove?: () => void;
    };
    register?: () => void;
  };
}

declare global {
  interface Window {
    median?: MedianBridge;
  }
}

export function isMedianApp(): boolean {
  if (typeof window === "undefined") return false;
  if (window.median) return true;
  const ua = navigator.userAgent || "";
  return /median|gonative/i.test(ua);
}

export function getMedianBridge(): MedianBridge | null {
  if (typeof window === "undefined") return null;
  return window.median ?? null;
}

// Wait briefly for the bridge to be injected (Median injects it slightly after load).
export function waitForMedianBridge(timeoutMs = 3000): Promise<MedianBridge | null> {
  return new Promise((resolve) => {
    if (!isMedianApp()) return resolve(null);
    const start = Date.now();
    const tick = () => {
      const b = getMedianBridge();
      if (b?.onesignal) return resolve(b);
      if (Date.now() - start > timeoutMs) return resolve(getMedianBridge());
      setTimeout(tick, 100);
    };
    tick();
  });
}
