import type { CapacitorConfig } from "@capacitor/cli";

type ProcessEnvironment = Record<string, string | undefined>;
const environment = (globalThis as typeof globalThis & {
  process?: { env?: ProcessEnvironment };
}).process?.env ?? {};
const nativeDebug = environment["GLOWFIN_NATIVE_DEBUG"] === "1";

/**
 * Store-wrapper contract established in Version 39 and retained by Version 43.
 *
 * Gameplay continues to load from the sealed Vite `dist` artifact. Native
 * projects may add presentation-only services (lifecycle and haptics), but
 * they never own simulation, score, replay, rewards, or save truth.
 */
const config: CapacitorConfig = {
  appId: "com.karthikbs862026.glowfin",
  appName: "Glowfin",
  webDir: "dist",
  backgroundColor: "#04060f",
  loggingBehavior: nativeDebug ? "debug" : "none",
  zoomEnabled: false,
  android: {
    allowMixedContent: false,
    webContentsDebuggingEnabled: nativeDebug
  },
  ios: {
    contentInset: "never",
    scrollEnabled: false,
    allowsLinkPreview: false,
    preferredContentMode: "mobile",
    webContentsDebuggingEnabled: nativeDebug
  },
  server: {
    androidScheme: "https"
  },
  plugins: {
    SystemBars: {
      insetsHandling: "css",
      style: "DARK",
      hidden: false,
      animation: "NONE"
    }
  }
};

export default config;
