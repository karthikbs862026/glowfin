import type { QualityTier } from "../perf/quality";

export type GraphicsBootMode = "mobile-safe" | "standard";

export interface GraphicsBootSignals {
  userAgent: string;
  userAgentMobile: boolean | null;
  maxTouchPoints: number;
  viewportWidth: number;
  viewportHeight: number;
  devicePixelRatio: number;
}

export interface GraphicsBootProfile {
  mode: GraphicsBootMode;
  initialQuality: QualityTier;
  antialias: boolean;
  postProcessing: boolean;
  powerPreference: WebGLPowerPreference;
}

export function browserGraphicsBootSignals(): GraphicsBootSignals {
  const nav = navigator as Navigator & {
    userAgentData?: { mobile?: boolean };
  };
  return {
    userAgent: nav.userAgent,
    userAgentMobile: typeof nav.userAgentData?.mobile === "boolean"
      ? nav.userAgentData.mobile
      : null,
    maxTouchPoints: nav.maxTouchPoints ?? 0,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio || 1,
  };
}

/**
 * Mobile browsers receive a conservative drawing buffer before any GPU
 * allocation occurs. A narrow touch viewport is included so Android browsers
 * that reduce or freeze their user-agent string still select the safe path.
 */
export function selectGraphicsBootProfile(
  signals: Readonly<GraphicsBootSignals>,
): GraphicsBootProfile {
  const shortEdge = Math.min(signals.viewportWidth, signals.viewportHeight);
  const mobileUserAgent = /Android|iPhone|iPad|iPod|Mobile/i.test(
    signals.userAgent,
  );
  const touchPhoneViewport = signals.maxTouchPoints > 0 && shortEdge <= 820;
  const highDensityTouchViewport = signals.maxTouchPoints > 0 &&
    signals.devicePixelRatio > 1.5 && shortEdge <= 1024;
  const mobile = signals.userAgentMobile === true || mobileUserAgent ||
    touchPhoneViewport || highDensityTouchViewport;

  if (mobile) {
    return {
      mode: "mobile-safe",
      initialQuality: "low",
      antialias: false,
      postProcessing: false,
      powerPreference: "low-power",
    };
  }
  return {
    mode: "standard",
    initialQuality: "high",
    antialias: true,
    postProcessing: true,
    powerPreference: "default",
  };
}

/** Conservative render-target estimate used by the mobile boot audit. */
export function estimatedBootTargetBytes(
  cssWidth: number,
  cssHeight: number,
  devicePixelRatio: number,
  profile: Readonly<GraphicsBootProfile>,
): number {
  const cap = profile.initialQuality === "high"
    ? 2
    : profile.initialQuality === "medium"
      ? 1.5
      : 1;
  const ratio = Math.min(Math.max(1, devicePixelRatio), cap);
  const pixels = Math.ceil(cssWidth * ratio) * Math.ceil(cssHeight * ratio);
  // RGBA8 + depth24/32 for the drawing buffer. MSAA is conservatively modeled
  // as four stored samples. The standard composer adds two RGBA16F + depth
  // targets and the bloom mip chain adds about one extra RGBA16F surface.
  const drawingBuffer = pixels * 8 * (profile.antialias ? 4 : 1);
  const postProcessing = profile.postProcessing ? pixels * (24 + 8) : 0;
  return drawingBuffer + postProcessing;
}
