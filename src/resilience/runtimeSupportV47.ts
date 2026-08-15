/** V47 capability gate retained by forward builds without a second GPU probe. */

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
  // GameView owns the one real context-creation attempt and reports its exact
  // failure. Creating an off-DOM probe first can overlap the production
  // allocation on mobile Chromium and consume the context budget being tested.
  return typeof WebGL2RenderingContext !== "undefined";
}

export function detectRuntimeSupport(
  probe: WebGl2Probe = browserProbe,
): RuntimeSupportResult {
  try {
    if (!probe()) {
      return {
        supported: false,
        reason: "webgl2-unavailable",
        detail: "This browser or device does not provide the WebGL2 graphics support Glowfin needs.",
      };
    }
  } catch {
    return {
      supported: false,
      reason: "webgl2-probe-failed",
      detail: "The browser blocked Glowfin from starting its graphics system.",
    };
  }

  return {
    supported: true,
    reason: "supported",
    detail: "WebGL2 graphics support is available.",
  };
}
