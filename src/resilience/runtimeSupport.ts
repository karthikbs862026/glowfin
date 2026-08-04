/** WebGL2 capability probe kept separate from renderer construction. */

export type RuntimeSupportReason =
  | "supported"
  | "webgl2-unavailable"
  | "webgl2-probe-failed";

export interface RuntimeSupportResult {
  supported: boolean;
  reason: RuntimeSupportReason;
  detail: string;
}

export type WebGl2Probe = () => boolean;

function browserProbe(): boolean {
  const probe = document.createElement("canvas");
  return Boolean(probe.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    failIfMajorPerformanceCaveat: false,
    powerPreference: "low-power",
    preserveDrawingBuffer: false,
    stencil: false
  }));
}

export function detectRuntimeSupport(
  probe: WebGl2Probe = browserProbe
): RuntimeSupportResult {
  try {
    if (!probe()) {
      return {
        supported: false,
        reason: "webgl2-unavailable",
        detail: "This browser or device does not provide the WebGL2 graphics support Glowfin needs."
      };
    }
  } catch {
    return {
      supported: false,
      reason: "webgl2-probe-failed",
      detail: "The browser blocked Glowfin from starting its graphics system."
    };
  }

  return {
    supported: true,
    reason: "supported",
    detail: "WebGL2 graphics support is available."
  };
}
