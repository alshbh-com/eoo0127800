// OneSignal helper — works in two environments:
// 1) Regular browser: uses OneSignal Web SDK (Service Worker push)
// 2) Inside a Median.co WebView: uses Median's native OneSignal bridge
import { isMedianApp, waitForMedianBridge } from "./median";

const APP_ID = "13096a2e-b5f2-4d42-a446-02b83d93bbc5";

declare global {
  interface Window {
    OneSignalDeferred?: Array<(os: OneSignalApi) => void>;
    OneSignal?: OneSignalApi;
  }
}

interface OneSignalApi {
  init: (opts: { appId: string; allowLocalhostAsSecureOrigin?: boolean; serviceWorkerPath?: string }) => Promise<void>;
  login: (externalId: string) => Promise<void>;
  logout: () => Promise<void>;
  Notifications: {
    requestPermission: () => Promise<boolean>;
    permission: boolean;
  };
}

let initialized = false;

export function initOneSignal() {
  if (typeof window === "undefined" || initialized) return;
  initialized = true;

  // Inside Median: native plugin handles init via the Median dashboard config.
  // Nothing to do client-side except make sure the bridge is ready.
  if (isMedianApp()) {
    waitForMedianBridge();
    return;
  }

  // Web browser path: init the Web SDK
  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(async (OneSignal) => {
    await OneSignal.init({ appId: APP_ID, allowLocalhostAsSecureOrigin: true });
    try { await OneSignal.Notifications.requestPermission(); } catch { /* ignore */ }
  });
}

export function osLogin(userId: string) {
  if (typeof window === "undefined") return;

  if (isMedianApp()) {
    waitForMedianBridge().then((bridge) => {
      try { bridge?.onesignal?.externalUserId?.set?.(userId); } catch { /* ignore */ }
    });
    return;
  }

  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(async (OneSignal) => {
    try { await OneSignal.login(userId); } catch { /* ignore */ }
  });
}

export function osLogout() {
  if (typeof window === "undefined") return;

  if (isMedianApp()) {
    waitForMedianBridge().then((bridge) => {
      try { bridge?.onesignal?.externalUserId?.remove?.(); } catch { /* ignore */ }
    });
    return;
  }

  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(async (OneSignal) => {
    try { await OneSignal.logout(); } catch { /* ignore */ }
  });
}
