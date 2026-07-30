/**
 * Deterministic browser capture harness for the production-art fast/full tiers.
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
  beautyReview: {
    meanLuminance: number;
    nearBlackFraction: number;
    colourfulFraction: number;
    clippedHighlightFraction: number;
  };
}

function srgbToLinear(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045
    ? value / 12.92
    : Math.pow((value + 0.055) / 1.055, 2.4);
}

function analyseBeautyFrame(pixels: Uint8Array): BrowserCaptureBundle["beautyReview"] {
  const pixelCount = Math.max(1, pixels.length / 4);
  let luminanceTotal = 0;
  let nearBlack = 0;
  let colourful = 0;
  let clipped = 0;

  for (let index = 0; index < pixels.length; index += 4) {
    const red = pixels[index] ?? 0;
    const green = pixels[index + 1] ?? 0;
    const blue = pixels[index + 2] ?? 0;
    const luminance =
      srgbToLinear(red) * 0.2126 +
      srgbToLinear(green) * 0.7152 +
      srgbToLinear(blue) * 0.0722;
    luminanceTotal += luminance;
    if (luminance < 0.01) nearBlack += 1;
    if (Math.max(red, green, blue) - Math.min(red, green, blue) > 31) {
      colourful += 1;
    }
    if (luminance > 0.78) clipped += 1;
  }

  return {
    meanLuminance: luminanceTotal / pixelCount,
    nearBlackFraction: nearBlack / pixelCount,
    colourfulFraction: colourful / pixelCount,
    clippedHighlightFraction: clipped / pixelCount
  };
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
      {
        // A two-CSS-pixel inset clears the seam's antialiased boundary while
        // leaving a real interior sample even when the low tier renders at a
        // fractional pixel ratio.
        offsetPx: Math.max(1, Math.floor(2 * view.capturePixelRatio())),
        // Coverage is itself a release requirement. Sampling every framebuffer
        // scanline keeps a narrow but clearly visible low-tier contour from
        // collapsing to one or two measurements merely because DPR changed.
        rowStride: 1
      }
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
        obstacleId: "moon-garden-wall-fragments",
        ratios: report.ratios
      }]
    });
  }

  // Leave the framebuffer on a representative beauty render for the uploaded
  // PNG. The mask render above is evidence data, not a useful visual review.
  const previewState: EffectState = {
    momentum: "mid",
    bloom: true,
    caustics: true,
    quality: "high"
  };
  const previewSim = simulateToMomentum(cfg, previewState.momentum);
  view.resetTrail();
  view.setCaptureEffects(
    previewState.quality,
    previewState.bloom,
    previewState.caustics
  );
  // Warm the deterministic preview for one visual beat. A single reset frame
  // erased the ribbon and local reef response, so the downloadable "beauty"
  // image omitted two of the Art Bible's defining layers.
  for (let frame = 0; frame < 54; frame++) {
    const steering = Math.sin(frame / 18) * 0.12;
    stepSim(previewSim, steering, FIXED_DT_SEC, cfg);
    view.render(
      previewSim,
      [captureGate(previewSim)],
      1,
      previewSim.elapsedSec,
      FIXED_DT_SEC
    );
  }
  const beautyReview = analyseBeautyFrame(view.capturePixels().pixels);

  return { tier, captures, beautyReview };
}
