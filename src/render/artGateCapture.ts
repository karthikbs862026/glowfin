/**
 * Deterministic browser capture harness for the Phase 3A fast/full tiers.
 *
 * It renders one known gate pair so every capture necessarily has a local
 * obstacle sample. The harness is CI-emulated evidence only; real Android/iOS
 * sign-off is ingested separately and the gate rejects this source for release.
 */

import type { TuningConfig } from "../core/config";
import { FIXED_DT_SEC } from "../core/timestep";
import { createSimState, stepSim, type SimState } from "../sim/state";
import type { Gate } from "../sim/course";
import type {
  EffectState,
  SceneCapture
} from "../../tools/art-gate/src/types";
import { analyseContrast } from "./contrastAnalysis";
import type { GameView } from "./gameView";

const CAPTURE_SEED = 20260730;

const FAST_STATES: EffectState[] = [
  { momentum: "low", bloom: false, caustics: true, quality: "high" },
  { momentum: "mid", bloom: true, caustics: true, quality: "medium" },
  { momentum: "max", bloom: true, caustics: true, quality: "high" },
  { momentum: "max", bloom: false, caustics: false, quality: "low" }
];

function fullStates(): EffectState[] {
  const states: EffectState[] = [];
  for (const momentum of ["low", "mid", "max"] as const) {
    for (const bloom of [true, false]) {
      for (const caustics of [true, false]) {
        for (const quality of ["high", "medium", "low"] as const) {
          states.push({ momentum, bloom, caustics, quality });
        }
      }
    }
  }
  return states;
}
function simulateToMomentum(
  cfg: TuningConfig,
  momentum: EffectState["momentum"]
): SimState {
  const state = createSimState();
  const fraction = momentum === "low" ? 0.05 : momentum === "mid" ? 0.5 : 0.999;
  const target = cfg.momentum.ceiling * fraction;
  let guard = 0;
  while (state.momentum < target && guard < 200_000) {
    stepSim(state, 0, FIXED_DT_SEC, cfg);
    guard += 1;
  }
  return state;
}

function captureGate(sim: SimState): Gate {
  return {
    distance: sim.forwardDistance + 38,
    gapLeft: -2,
    gapRight: 2,
    templateId: "art-gate-capture",
    tier: 0
  };
}

export interface BrowserCaptureBundle {
  tier: "fast" | "full";
  captures: SceneCapture[];
}

export function runArtGateCapture(
  view: GameView,
  cfg: TuningConfig,
  tier: "fast" | "full",
  device: string
): BrowserCaptureBundle {
  const captures: SceneCapture[] = [];
  const states = tier === "fast" ? FAST_STATES : fullStates();

  for (const [index, state] of states.entries()) {
    const sim = simulateToMomentum(cfg, state.momentum);
    const gate = captureGate(sim);
    view.resetTrail();
    view.setCaptureEffects(
      state.quality,
      state.bloom,
      state.caustics
    );
    view.render(sim, [gate], 1, sim.elapsedSec, FIXED_DT_SEC);
    const renderStats = view.stats();
    const artStats = view.artStats();
    const beauty = view.capturePixels();

    view.setMaskMaxDepth(
      cfg.readability.visibleAheadUnits +
      cfg.camera.distanceBehindAtMaxMomentum +
      5
    );
    view.setMaskMode(true);
    view.renderMask();
    const mask = view.capturePixels();
    view.setMaskMode(false);

    const report = analyseContrast(
      {
        beauty: beauty.pixels,
        mask: mask.pixels,
        width: beauty.width,
        height: beauty.height
      },
      cfg.readability.minObstacleContrastRatio,
      { rowStride: 4 }
    );

    captures.push({
      seed: CAPTURE_SEED + index,
      device,
      source: {
        kind: "ci-emulated",
        browser: navigator.userAgent,
        platform: navigator.platform,
        evidenceId: `${tier}-${CAPTURE_SEED}-${index}`
      },
      state,
      drawCalls: renderStats.drawCalls,
      triangles: renderStats.triangles,
      textureMemoryMB: artStats.textureMemoryMB,
      activeMaterials: artStats.activeMaterials,
      godRayMeshes: artStats.godRayMeshes,
      frameContrastRatios: report.ratios,
      obstacles: [{
        obstacleId: "procedural-gate-pair",
        ratios: report.ratios
      }]
    });
  }

  return { tier, captures };
}
