import type { PerfSample } from "../perf/metrics";
import type { QualityTier } from "../perf/quality";
import type { GlowfinNativeRuntime } from "../native/capacitorBridge";
import type { TelemetryPayload } from "../telemetry/telemetry";

export interface DeviceHealthInputs {
  runtime: GlowfinNativeRuntime;
  viewportWidth: number;
  viewportHeight: number;
  deviceMemoryGb?: number | null;
  hardwareConcurrency?: number | null;
  online: boolean;
  quality: QualityTier;
  sample: PerfSample;
}

function screenClass(width: number, height: number): string {
  const shortEdge = Math.max(0, Math.min(width, height));
  if (shortEdge < 360) return "compact";
  if (shortEdge < 430) return "standard";
  return "large";
}

function memoryClass(value: number | null | undefined): string {
  if (!Number.isFinite(value)) return "unknown";
  if (Number(value) <= 4) return "4gb-or-less";
  if (Number(value) <= 8) return "5-to-8gb";
  return "over-8gb";
}

function coreClass(value: number | null | undefined): string {
  if (!Number.isFinite(value)) return "unknown";
  if (Number(value) <= 4) return "4-or-less";
  if (Number(value) <= 8) return "5-to-8";
  return "over-8";
}

function bucket(value: number, size: number, maximum: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(maximum, Math.max(0, Math.round(value / size) * size));
}

/**
 * Coarse consent-gated health segments only. Raw GPU, user agent, model,
 * resolution, IP and persistent device identifiers are deliberately excluded.
 */
export function deviceHealthPayload(inputs: DeviceHealthInputs): TelemetryPayload {
  return {
    nativeWrapper: inputs.runtime.isNative,
    platform: inputs.runtime.platform,
    screenClass: screenClass(inputs.viewportWidth, inputs.viewportHeight),
    memoryClass: memoryClass(inputs.deviceMemoryGb),
    coreClass: coreClass(inputs.hardwareConcurrency),
    online: inputs.online,
    quality: inputs.quality,
    frameMedianMs: bucket(inputs.sample.frameTimeMsMedian, 2, 100),
    frameWorstMs: bucket(inputs.sample.frameTimeMsWorst, 5, 250),
    drawCalls: bucket(inputs.sample.drawCalls, 5, 200),
    triangles: bucket(inputs.sample.triangles, 5000, 250000),
    heapMb: inputs.sample.heapMb === null ? -1 : bucket(inputs.sample.heapMb, 16, 512)
  };
}
