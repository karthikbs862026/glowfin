/**
 * Runtime performance sampling (Part 6.8, 6.10).
 *
 * Collects the numbers the Part 4.6 budgets are written against, so a violation
 * is something we observe rather than something a player reports.
 */
import budgets from "../../config/budgets.json";

export interface PerfSample {
  fps: number;
  frameTimeMsMedian: number;
  frameTimeMsWorst: number;
  drawCalls: number;
  triangles: number;
  /** JS heap in MB, or null where the browser does not expose it (Safari). */
  heapMb: number | null;
  gpu: string;
}

export interface BudgetViolation {
  metric: string;
  value: number;
  budget: number;
}

/** Chrome-only heap API. Absent in Safari and Firefox, which is why it is optional. */
interface PerformanceMemory {
  usedJSHeapSize: number;
}

function readHeapMb(): number | null {
  const memory = (performance as Performance & { memory?: PerformanceMemory }).memory;
  if (!memory || typeof memory.usedJSHeapSize !== "number") return null;
  return memory.usedJSHeapSize / (1024 * 1024);
}

/**
 * Read the real GPU string rather than trusting a device-name guess.
 * Requires the WEBGL_debug_renderer_info extension, which some browsers gate.
 */
export function readGpuName(gl: WebGLRenderingContext | WebGL2RenderingContext): string {
  try {
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    if (!ext) return "unknown (debug_renderer_info unavailable)";
    const renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
    return typeof renderer === "string" ? renderer : "unknown";
  } catch {
    return "unknown (blocked)";
  }
}

export class PerfMonitor {
  private frameTimesMs: number[] = [];
  private readonly windowSize = 60;

  record(frameTimeMs: number): void {
    if (!Number.isFinite(frameTimeMs) || frameTimeMs <= 0) return;
    this.frameTimesMs.push(frameTimeMs);
    if (this.frameTimesMs.length > this.windowSize) this.frameTimesMs.shift();
  }

  sample(drawCalls: number, triangles: number, gpu: string): PerfSample {
    const sorted = [...this.frameTimesMs].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
    const worst = sorted[sorted.length - 1] ?? 0;
    return {
      fps: median > 0 ? 1000 / median : 0,
      frameTimeMsMedian: median,
      frameTimeMsWorst: worst,
      drawCalls,
      triangles,
      heapMb: readHeapMb(),
      gpu
    };
  }
}

/** Compare a sample against the Part 4.6 budgets. Empty array means all clear. */
export function checkBudgets(sample: PerfSample): BudgetViolation[] {
  const violations: BudgetViolation[] = [];

  if (sample.frameTimeMsMedian > budgets.frameRate.frameBudgetMsMidRange) {
    violations.push({
      metric: "frameTimeMs",
      value: sample.frameTimeMsMedian,
      budget: budgets.frameRate.frameBudgetMsMidRange
    });
  }
  if (sample.drawCalls > budgets.scene.maxDrawCalls) {
    violations.push({ metric: "drawCalls", value: sample.drawCalls, budget: budgets.scene.maxDrawCalls });
  }
  if (sample.triangles > budgets.scene.maxTriangles) {
    violations.push({ metric: "triangles", value: sample.triangles, budget: budgets.scene.maxTriangles });
  }
  if (sample.heapMb !== null && sample.heapMb > budgets.memory.steadyStateHeapMb) {
    violations.push({ metric: "heapMb", value: sample.heapMb, budget: budgets.memory.steadyStateHeapMb });
  }
  return violations;
}
