import type { GraphicsBootProfile } from "./bootProfile";

export type GraphicsContextMode =
  | "selected-attributes"
  | "browser-default"
  | "unavailable";

export interface GraphicsContextAcquisition {
  context: WebGL2RenderingContext | null;
  mode: GraphicsContextMode;
  attempts: readonly string[];
  actualAttributes: WebGLContextAttributes | null;
}

export interface WebGL2Canvas {
  getContext(
    contextId: "webgl2",
    options?: WebGLContextAttributes,
  ): WebGL2RenderingContext | null;
}

function attemptContext(
  canvas: WebGL2Canvas,
  label: string,
  attempts: string[],
  options?: WebGLContextAttributes,
): WebGL2RenderingContext | null {
  try {
    const context = canvas.getContext("webgl2", options);
    attempts.push(`${label}:${context ? "ready" : "rejected"}`);
    return context;
  } catch (error: unknown) {
    const name = error instanceof Error ? error.name : "unknown";
    attempts.push(`${label}:threw-${name}`);
    return null;
  }
}

/**
 * Acquire the one context that Three.js will own.
 *
 * Three.js probes the browser-default attributes after a selected-attribute
 * failure, but then throws even when that probe succeeds. Some Android GPU
 * drivers reject a power preference or exact attribute combination while
 * accepting the browser default. We retain that valid fallback context and
 * pass it into WebGLRenderer instead of abandoning it.
 */
export function acquireWebGL2Context(
  canvas: WebGL2Canvas,
  profile: Readonly<GraphicsBootProfile>,
): GraphicsContextAcquisition {
  const attempts: string[] = [];
  const selected = attemptContext(canvas, "selected", attempts, {
    alpha: false,
    antialias: profile.antialias,
    depth: true,
    failIfMajorPerformanceCaveat: false,
    powerPreference: profile.powerPreference,
    premultipliedAlpha: true,
    preserveDrawingBuffer: false,
    stencil: false,
  });
  if (selected) {
    return {
      context: selected,
      mode: "selected-attributes",
      attempts,
      actualAttributes: selected.getContextAttributes(),
    };
  }

  const compatible = attemptContext(canvas, "browser-default", attempts);
  if (compatible) {
    return {
      context: compatible,
      mode: "browser-default",
      attempts,
      actualAttributes: compatible.getContextAttributes(),
    };
  }

  return {
    context: null,
    mode: "unavailable",
    attempts,
    actualAttributes: null,
  };
}

/** A failed canvas is never reused by the final compatibility attempt. */
export function replaceGraphicsCanvas(
  canvas: HTMLCanvasElement,
): HTMLCanvasElement {
  const replacement = canvas.cloneNode(false) as HTMLCanvasElement;
  canvas.replaceWith(replacement);
  return replacement;
}
