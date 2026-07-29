/**
 * Debug/perf overlay (Part 6.10).
 *
 * SHIPS DISABLED IN PRODUCTION. Gated on `import.meta.env.DEV`, which Vite
 * replaces with a literal at build time so the whole class is tree-shaken out
 * of a production bundle. Part 6.10 calls a shipped debug menu "a real
 * incident", and requires an automated check — see scripts/check-no-debug.mjs.
 */
import type { PerfSample, BudgetViolation } from "../perf/metrics";
import type { QualityTier } from "../perf/quality";

export class DebugOverlay {
  private readonly root: HTMLElement | null = null;

  constructor() {
    if (!import.meta.env.DEV) return;

    const element = document.createElement("div");
    element.id = "glowfin-debug-overlay";
    element.style.cssText = [
      "position:fixed",
      "right:8px",
      "bottom:8px",
      "z-index:9999",
      "pointer-events:none",
      "font:11px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace",
      "color:#9fe8ff",
      "background:rgba(4,6,15,0.78)",
      "border:1px solid rgba(53,208,255,0.25)",
      "border-radius:6px",
      "padding:7px 9px",
      "white-space:pre",
      "text-align:right"
    ].join(";");
    document.body.appendChild(element);
    this.root = element;
  }

  update(sample: PerfSample, tier: QualityTier, violations: readonly BudgetViolation[]): void {
    if (!this.root) return;

    const heap = sample.heapMb === null ? "n/a" : `${sample.heapMb.toFixed(0)}MB`;
    const lines = [
      `${sample.fps.toFixed(0)} fps   ${sample.frameTimeMsMedian.toFixed(1)}ms`,
      `worst ${sample.frameTimeMsWorst.toFixed(1)}ms`,
      `draws ${sample.drawCalls}  tris ${sample.triangles}`,
      `heap ${heap}   quality ${tier}`,
      sample.gpu.slice(0, 38)
    ];

    if (violations.length > 0) {
      lines.push(
        ...violations.map((v) => `OVER ${v.metric} ${v.value.toFixed(0)}/${v.budget}`)
      );
      this.root.style.color = "#ff9db4";
      this.root.style.borderColor = "rgba(255,120,150,0.45)";
    } else {
      this.root.style.color = "#9fe8ff";
      this.root.style.borderColor = "rgba(53,208,255,0.25)";
    }

    this.root.textContent = lines.join("\n");
  }

  dispose(): void {
    this.root?.remove();
  }
}
