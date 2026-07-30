/**
 * On-device contrast probe (Part 3.4 / 6.5).
 *
 * Runs in the app rather than headless desktop Chrome on purpose: Part 6.5 asks
 * for cross-device capture precisely because desktop never surfaces driver
 * differences, and the two available phones have different GPU vendors.
 *
 * DIAGNOSTIC MODE — measures each scene twice, with and without bloom.
 *
 * That comparison exists because raising obstacle edge brightness repeatedly
 * failed to improve measured contrast, and the reason turned out to be
 * self-inflicted: a bright edge sits above the bloom threshold, so it glows
 * outward onto the very pixels sampled as "background" a few pixels away.
 * Lifting the background lowers the ratio without the obstacle being any harder
 * to see. Measuring both isolates that from a genuine contrast problem, instead
 * of guessing which one is in play.
 *
 *   bloom much worse than no-bloom  -> bleed artefact, adjust bloom or sampling
 *   both similarly bad              -> real contrast problem, adjust the art
 */
import type { TuningConfig } from "../core/config";
import type { GameView } from "./gameView";
import { createSimState, stepSim, type SimState } from "../sim/state";
import { CourseGenerator } from "../sim/course";
import { FIXED_DT_SEC } from "../core/timestep";
import { analyseContrast, describeReport, type ContrastReport } from "./contrastAnalysis";

const PROBE_SEED = 20260730;

function simulateToMomentum(cfg: TuningConfig, targetFraction: number): SimState {
  const state = createSimState();
  const target = cfg.momentum.ceiling * targetFraction;
  let guard = 0;
  while (state.momentum < target && guard < 200_000) {
    stepSim(state, 0, FIXED_DT_SEC, cfg);
    guard++;
  }
  return state;
}

export interface ProbeResult {
  lines: string[];
  allPassed: boolean;
}

export function runContrastProbe(view: GameView, cfg: TuningConfig): ProbeResult {
  const minimum = cfg.readability.minObstacleContrastRatio;
  const lines: string[] = [
    `floor ${minimum}:1 — ${view.gpuName}`,
    ""
  ];
  let allPassed = true;

  for (const [label, fraction] of [
    ["low", 0.05],
    ["mid", 0.5],
    ["max", 0.999]
  ] as const) {
    const sim = simulateToMomentum(cfg, fraction);

    // Place the first gate a fixed distance ahead of wherever the creature ended
    // up. Without this, the low-momentum case barely travels and the nearest gate
    // can fall outside the measured range entirely — the Reno reported NO SAMPLES
    // while the S22 scraped n=4, purely because of resolution and FOV differences.
    // A fixed offset makes the three momentum levels actually comparable.
    const course = new CourseGenerator(PROBE_SEED, cfg, {
      firstGateDistance: sim.forwardDistance + 38
    });
    course.ensureGeneratedTo(sim.forwardDistance + cfg.readability.visibleAheadUnits * 2);

    const measure = (withBloom: boolean): ContrastReport => {
      // Each render() call appends a trail sample. Calling it twice per momentum
      // level meant the second (plain) pass had a visible ribbon the first did
      // not, so the two measurements were not of the same image. Reset first.
      view.resetTrail();

      if (withBloom) {
        view.render(sim, course.gates, 1, sim.elapsedSec, FIXED_DT_SEC);
      } else {
        view.render(sim, course.gates, 1, sim.elapsedSec, FIXED_DT_SEC);
        view.renderWithoutBloom();
      }
      const beauty = view.capturePixels();

      view.setMaskMaxDepth(
        cfg.readability.visibleAheadUnits + cfg.camera.distanceBehindAtMaxMomentum + 5
      );
      view.setMaskMode(true);
      view.renderMask();
      const mask = view.capturePixels();
      view.setMaskMode(false);

      return analyseContrast(
        { beauty: beauty.pixels, mask: mask.pixels, width: beauty.width, height: beauty.height },
        minimum,
        { rowStride: 8 }
      );
    };

    const withBloom = measure(true);
    const withoutBloom = measure(false);

    lines.push(describeReport(`${label} bloom `, withBloom, minimum));
    lines.push(describeReport(`${label} plain `, withoutBloom, minimum));

    const bleedCost = withoutBloom.medianRatio - withBloom.medianRatio;
    if (bleedCost > 0.4) {
      lines.push(`   ^ bloom costs ${bleedCost.toFixed(2)} of median contrast here`);
    }
    lines.push("");

    if (!withBloom.passed) allPassed = false;
  }

  return { lines, allPassed };
}

export function showProbeResult(result: ProbeResult): void {
  const panel = document.createElement("div");
  panel.style.cssText = [
    "position:fixed",
    "inset:0",
    "z-index:99999",
    "background:rgba(4,6,15,0.96)",
    "color:" + (result.allPassed ? "#8fffc4" : "#ff9db4"),
    "font:11px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace",
    "padding:18px 14px",
    "white-space:pre-wrap",
    "overflow:auto"
  ].join(";");
  panel.textContent =
    `CONTRAST PROBE — ${result.allPassed ? "PASS" : "FAIL"}\n\n` + result.lines.join("\n");
  document.body.appendChild(panel);
}
