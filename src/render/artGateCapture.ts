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
  MerfolkMaskComponentEvidence,
  MerfolkVisualReviewEvidence,
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

export function fullEffectStates(): EffectState[] {
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

function captureGate(
  sim: SimState,
  artVariant: NonNullable<Gate["artVariant"]> = 0
): Gate {
  return {
    distance: sim.forwardDistance + 38,
    gapLeft: -2,
    gapRight: 2,
    templateId: "art-gate-capture",
    tier: 0,
    artVariant
  };
}

const MASK = {
  guardianBody: 1,
  guardianIdentity: 2,
  guardianFace: 3,
  guardianEyes: 4,
  citizen: 5,
  swimmer: 6,
  herald: 7
} as const;

function maskClass(red: number, green: number, blue: number): number {
  const high = 176;
  const low = 92;
  if (red > high && green > high && blue > high) return MASK.guardianEyes;
  if (red > high && green > high && blue < low) return MASK.guardianIdentity;
  if (red < low && green > high && blue > high) return MASK.guardianFace;
  if (red > high && green < low && blue > high) return MASK.herald;
  if (red > high && green < low && blue < low) return MASK.guardianBody;
  if (red < low && green > high && blue < low) return MASK.citizen;
  if (red < low && green < low && blue > high) return MASK.swimmer;
  return 0;
}

interface CssMask {
  cells: Uint8Array;
  width: number;
  height: number;
}

function toCssMask(
  pixels: Uint8Array,
  width: number,
  height: number,
  pixelRatio: number
): CssMask {
  const cssWidth = Math.max(1, Math.round(width / Math.max(0.25, pixelRatio)));
  const cssHeight = Math.max(1, Math.round(height / Math.max(0.25, pixelRatio)));
  const cells = new Uint8Array(cssWidth * cssHeight);
  const counts = new Uint8Array(8);
  for (let y = 0; y < cssHeight; y++) {
    const startY = Math.floor(y * height / cssHeight);
    const endY = Math.max(startY + 1, Math.floor((y + 1) * height / cssHeight));
    for (let x = 0; x < cssWidth; x++) {
      counts.fill(0);
      const startX = Math.floor(x * width / cssWidth);
      const endX = Math.max(startX + 1, Math.floor((x + 1) * width / cssWidth));
      for (let sourceY = startY; sourceY < endY; sourceY++) {
        for (let sourceX = startX; sourceX < endX; sourceX++) {
          const offset = (sourceY * width + sourceX) * 4;
          const role = maskClass(
            pixels[offset] ?? 0,
            pixels[offset + 1] ?? 0,
            pixels[offset + 2] ?? 0
          );
          if (role > 0) counts[role] = (counts[role] ?? 0) + 1;
        }
      }
      let selected = 0;
      for (let role = 1; role < counts.length; role++) {
        if ((counts[role] ?? 0) > (counts[selected] ?? 0)) selected = role;
      }
      cells[y * cssWidth + x] = selected;
    }
  }
  return { cells, width: cssWidth, height: cssHeight };
}

interface Component {
  width: number;
  height: number;
  pixels: number;
  edgeClearance: number;
}

function largestComponent(mask: CssMask, accepted: readonly number[]): Component {
  const allowed = new Uint8Array(8);
  for (const role of accepted) allowed[role] = 1;
  const visited = new Uint8Array(mask.cells.length);
  const stack = new Int32Array(mask.cells.length);
  let best: Component = { width: 0, height: 0, pixels: 0, edgeClearance: 0 };

  for (let start = 0; start < mask.cells.length; start++) {
    if (visited[start] || !allowed[mask.cells[start] ?? 0]) continue;
    let stackSize = 1;
    stack[0] = start;
    visited[start] = 1;
    let pixels = 0;
    let minX = mask.width;
    let maxX = -1;
    let minY = mask.height;
    let maxY = -1;
    while (stackSize > 0) {
      const cell = stack[--stackSize] ?? 0;
      const x = cell % mask.width;
      const y = Math.floor(cell / mask.width);
      pixels += 1;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      for (let offsetY = -1; offsetY <= 1; offsetY++) {
        for (let offsetX = -1; offsetX <= 1; offsetX++) {
          if (offsetX === 0 && offsetY === 0) continue;
          const nextX = x + offsetX;
          const nextY = y + offsetY;
          if (
            nextX < 0 || nextX >= mask.width ||
            nextY < 0 || nextY >= mask.height
          ) continue;
          const next = nextY * mask.width + nextX;
          if (visited[next] || !allowed[mask.cells[next] ?? 0]) continue;
          visited[next] = 1;
          stack[stackSize++] = next;
        }
      }
    }
    if (pixels <= best.pixels) continue;
    best = {
      width: maxX - minX + 1,
      height: maxY - minY + 1,
      pixels,
      edgeClearance: Math.min(
        minX,
        minY,
        mask.width - 1 - maxX,
        mask.height - 1 - maxY
      )
    };
  }
  return best;
}

function componentEvidence(
  visible: CssMask,
  isolated: CssMask,
  accepted: readonly number[]
): MerfolkMaskComponentEvidence {
  const shown = largestComponent(visible, accepted);
  const whole = largestComponent(isolated, accepted);
  const occlusionFraction = whole.pixels <= 0
    ? 1
    : Math.max(0, Math.min(1, 1 - shown.pixels / whole.pixels));
  return {
    widthPixels: shown.width,
    heightPixels: shown.height,
    visiblePixels: shown.pixels,
    isolatedPixels: whole.pixels,
    occlusionFraction,
    edgeClearancePixels: shown.edgeClearance
  };
}

function analyseMerfolkReview(
  role: string,
  visiblePixels: Uint8Array,
  isolatedPixels: Uint8Array,
  width: number,
  height: number,
  pixelRatio: number
): MerfolkVisualReviewEvidence {
  const visible = toCssMask(visiblePixels, width, height, pixelRatio);
  const isolated = toCssMask(isolatedPixels, width, height, pixelRatio);
  return {
    guardianRole: role,
    guardian: componentEvidence(visible, isolated, [
      MASK.guardianBody,
      MASK.guardianIdentity,
      MASK.guardianFace,
      MASK.guardianEyes
    ]),
    identity: componentEvidence(visible, isolated, [MASK.guardianIdentity]),
    face: componentEvidence(visible, isolated, [MASK.guardianFace]),
    eyes: componentEvidence(visible, isolated, [MASK.guardianEyes]),
    population: [
      {
        role: "reef-citizen",
        component: componentEvidence(visible, isolated, [MASK.citizen])
      },
      {
        role: "current-swimmer",
        component: componentEvidence(visible, isolated, [MASK.swimmer])
      },
      {
        role: "conch-herald",
        component: componentEvidence(visible, isolated, [MASK.herald])
      }
    ]
  };
}

export interface BrowserCaptureBundle {
  tier: "fast" | "full";
  captures: SceneCapture[];
  castReviewAtlasDataUrl: string;
  beautyReview: {
    meanLuminance: number;
    nearBlackFraction: number;
    colourfulFraction: number;
    clippedHighlightFraction: number;
  };
}

function castReviewAtlas(
  frames: Array<{ pixels: Uint8Array; width: number; height: number }>
): string {
  if (frames.length !== 3) return "";
  const panelWidth = 390;
  const panelHeight = 844;
  const labelHeight = 44;
  const atlas = document.createElement("canvas");
  atlas.width = panelWidth * frames.length;
  atlas.height = panelHeight + labelHeight;
  const atlasContext = atlas.getContext("2d");
  if (!atlasContext) return "";
  const labels = ["TIDEKEEPER", "CORAL WARDEN", "ASTRAL ORACLE"];

  frames.forEach((frame, panel) => {
    const source = document.createElement("canvas");
    source.width = frame.width;
    source.height = frame.height;
    const context = source.getContext("2d");
    if (!context) return;
    const flipped = new Uint8ClampedArray(frame.pixels.length);
    const rowBytes = frame.width * 4;
    for (let row = 0; row < frame.height; row++) {
      const sourceStart = row * rowBytes;
      const targetStart = (frame.height - 1 - row) * rowBytes;
      flipped.set(
        frame.pixels.subarray(sourceStart, sourceStart + rowBytes),
        targetStart
      );
    }
    context.putImageData(
      new ImageData(flipped, frame.width, frame.height),
      0,
      0
    );
    atlasContext.drawImage(
      source,
      panel * panelWidth,
      labelHeight,
      panelWidth,
      panelHeight
    );
    atlasContext.fillStyle = "#06152d";
    atlasContext.fillRect(panel * panelWidth, 0, panelWidth, labelHeight);
    atlasContext.fillStyle = "#ecfbff";
    atlasContext.font = "700 18px system-ui, sans-serif";
    atlasContext.textAlign = "center";
    atlasContext.fillText(
      labels[panel] ?? "MERFOLK",
      panel * panelWidth + panelWidth / 2,
      29
    );
  });
  return atlas.toDataURL("image/png");
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
  const castFrames: Array<{
    pixels: Uint8Array;
    width: number;
    height: number;
  }> = [];
  const states = tier === "fast" ? FAST_STATES : fullEffectStates();

  for (const [index, state] of states.entries()) {
    const sim = simulateToMomentum(cfg, state.momentum);
    // The first three renders are also the cast-review atlas: Tidekeeper,
    // Coral Warden and Astral Oracle. Generic role arrays can no longer make a
    // render tier green when one of those identities never appears on screen.
    const reviewFamily = ([0, 2, 4] as const)[index % 3] ?? 0;
    const gate = captureGate(sim, reviewFamily);
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
    if (index < 3) {
      castFrames.push({
        pixels: beauty.pixels.slice(),
        width: beauty.width,
        height: beauty.height
      });
    }

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
        // Two CSS pixels clear the seam's normal antialias fringe. At 1x DPR,
        // the lowest tier needs one additional physical pixel to cross the
        // firmly classified context band beside the still-visible seven-pixel
        // contour. Three is the measured minimum; it remains inside the safe
        // gap and does not bridge a real obstacle-to-obstacle boundary.
        offsetPx: Math.max(3, Math.floor(2 * view.capturePixelRatio())),
        // Coverage is itself a release requirement. Sampling every framebuffer
        // scanline keeps a narrow but clearly visible low-tier contour from
        // collapsing to one or two measurements merely because DPR changed.
        rowStride: 1
      }
    );

    let merfolkVisualReview: MerfolkVisualReviewEvidence | undefined;
    if (index < 3) {
      view.setMerfolkMaskMode(true, false);
      view.renderMerfolkMask();
      const visibleMerfolk = view.capturePixels();
      view.setMerfolkMaskMode(false);

      view.setMerfolkMaskMode(true, true);
      view.renderMerfolkMask();
      const isolatedMerfolk = view.capturePixels();
      view.setMerfolkMaskMode(false);
      merfolkVisualReview = analyseMerfolkReview(
        view.activeHeroMerfolkRole(),
        visibleMerfolk.pixels,
        isolatedMerfolk.pixels,
        visibleMerfolk.width,
        visibleMerfolk.height,
        view.capturePixelRatio()
      );
    }

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
      heroMerfolkHeightPixels: artStats.heroMerfolkHeightPixels,
      heroMerfolkFaceHeightPixels: artStats.heroMerfolkFaceHeightPixels,
      heroMerfolkEyeDiameterPixels: artStats.heroMerfolkEyeDiameterPixels,
      ...(merfolkVisualReview ? { merfolkVisualReview } : {}),
      frameContrastRatios: report.ratios,
      obstacles: [{
        obstacleId: "moon-garden-wall-fragments",
        ratios: report.ratios
      }],
      contrastDiagnostics: {
        failureCount: report.failures.length,
        lowest: [...report.failures]
          .sort((left, right) => left.ratio - right.ratio)
          .slice(0, 24)
      }
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
      [captureGate(previewSim, 0)],
      1,
      previewSim.elapsedSec,
      FIXED_DT_SEC
    );
  }
  const beautyReview = analyseBeautyFrame(view.capturePixels().pixels);

  return {
    tier,
    captures,
    beautyReview,
    castReviewAtlasDataUrl: castReviewAtlas(castFrames)
  };
}
