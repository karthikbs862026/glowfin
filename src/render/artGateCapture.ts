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
import {
  classifyMerfolkMaskPixel,
  MERFOLK_MASK,
  MERFOLK_MASK_MAX_ID
} from "../art/merfolkMask";
import { MERFOLK_CITY_CONTRACT } from "../art/merfolkCharacter";

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
  const counts = new Uint8Array(MERFOLK_MASK_MAX_ID + 1);
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
          const role = classifyMerfolkMaskPixel(
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
  centreX: number;
  centreY: number;
}

function largestComponent(mask: CssMask, accepted: readonly number[]): Component {
  const allowed = new Uint8Array(MERFOLK_MASK_MAX_ID + 1);
  for (const role of accepted) allowed[role] = 1;
  const visited = new Uint8Array(mask.cells.length);
  const stack = new Int32Array(mask.cells.length);
  let best: Component = {
    width: 0,
    height: 0,
    pixels: 0,
    edgeClearance: 0,
    centreX: 0,
    centreY: 0
  };

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
      ),
      centreX: (minX + maxX) * 0.5,
      centreY: (minY + maxY) * 0.5
    };
  }
  return best;
}

function componentEdges(component: Component): {
  left: number;
  right: number;
  top: number;
  bottom: number;
} {
  return {
    left: component.centreX - (component.width - 1) * 0.5,
    right: component.centreX + (component.width - 1) * 0.5,
    top: component.centreY - (component.height - 1) * 0.5,
    bottom: component.centreY + (component.height - 1) * 0.5
  };
}

/**
 * One authored merperson is made from several separated volumes (hair, arms,
 * face, tail and fins). CSS downsampling can leave a few transparent pixels
 * between those volumes, so strict flood-fill alone mistakes one figure for
 * several people. Join only very close islands; genuinely stacked figures
 * still merge into one instance and therefore fail the required count.
 */
export function mergeNearbyMaskComponents(
  source: readonly Component[],
  maximumGapPixels = 6
): Component[] {
  const components = source.map((component) => ({ ...component }));
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let leftIndex = 0; leftIndex < components.length; leftIndex++) {
      const left = components[leftIndex];
      if (!left) continue;
      const leftEdges = componentEdges(left);
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < components.length;
        rightIndex++
      ) {
        const right = components[rightIndex];
        if (!right) continue;
        const rightEdges = componentEdges(right);
        const horizontalGap = Math.max(
          0,
          Math.max(leftEdges.left, rightEdges.left) -
            Math.min(leftEdges.right, rightEdges.right) - 1
        );
        const verticalGap = Math.max(
          0,
          Math.max(leftEdges.top, rightEdges.top) -
            Math.min(leftEdges.bottom, rightEdges.bottom) - 1
        );
        if (Math.hypot(horizontalGap, verticalGap) > maximumGapPixels) {
          continue;
        }
        const mergedLeft = Math.min(leftEdges.left, rightEdges.left);
        const mergedRight = Math.max(leftEdges.right, rightEdges.right);
        const mergedTop = Math.min(leftEdges.top, rightEdges.top);
        const mergedBottom = Math.max(leftEdges.bottom, rightEdges.bottom);
        components[leftIndex] = {
          width: Math.round(mergedRight - mergedLeft + 1),
          height: Math.round(mergedBottom - mergedTop + 1),
          pixels: left.pixels + right.pixels,
          edgeClearance: Math.min(left.edgeClearance, right.edgeClearance),
          centreX: (mergedLeft + mergedRight) * 0.5,
          centreY: (mergedTop + mergedBottom) * 0.5
        };
        components.splice(rightIndex, 1);
        changed = true;
        break outer;
      }
    }
  }
  return components.sort((left, right) => right.pixels - left.pixels);
}

function connectedComponents(
  mask: CssMask,
  accepted: readonly number[],
  minimumPixels = 3
): Component[] {
  const allowed = new Uint8Array(MERFOLK_MASK_MAX_ID + 1);
  for (const role of accepted) allowed[role] = 1;
  const visited = new Uint8Array(mask.cells.length);
  const stack = new Int32Array(mask.cells.length);
  const components: Component[] = [];

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
    if (pixels < minimumPixels) continue;
    components.push({
      width: maxX - minX + 1,
      height: maxY - minY + 1,
      pixels,
      edgeClearance: Math.min(
        minX,
        minY,
        mask.width - 1 - maxX,
        mask.height - 1 - maxY
      ),
      centreX: (minX + maxX) * 0.5,
      centreY: (minY + maxY) * 0.5
    });
  }
  return components.sort((left, right) => right.pixels - left.pixels);
}

/**
 * Measures the complete semantic silhouette rather than only its largest
 * connected island. Guardian regalia is deliberately composed from separated
 * crescents, coral branches, rings and crystals; treating those authored gaps
 * as missing geometry made the rendered-identity gate report the size of one
 * tiny ring fragment instead of the district signature a player sees.
 */
function maskBounds(mask: CssMask, accepted: readonly number[]): Component {
  const allowed = new Uint8Array(8);
  for (const role of accepted) allowed[role] = 1;
  let pixels = 0;
  let minX = mask.width;
  let maxX = -1;
  let minY = mask.height;
  let maxY = -1;
  for (let index = 0; index < mask.cells.length; index++) {
    if (!allowed[mask.cells[index] ?? 0]) continue;
    const x = index % mask.width;
    const y = Math.floor(index / mask.width);
    pixels += 1;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  if (pixels === 0) {
    return {
      width: 0,
      height: 0,
      pixels: 0,
      edgeClearance: 0,
      centreX: 0,
      centreY: 0
    };
  }
  return {
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    pixels,
    edgeClearance: Math.min(
      minX,
      minY,
      mask.width - 1 - maxX,
      mask.height - 1 - maxY
    ),
    centreX: (minX + maxX) * 0.5,
    centreY: (minY + maxY) * 0.5
  };
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
    edgeClearancePixels: shown.edgeClearance,
    centreXPixels: shown.centreX,
    centreYPixels: shown.centreY
  };
}

function silhouetteEvidence(
  visible: CssMask,
  isolated: CssMask,
  accepted: readonly number[]
): MerfolkMaskComponentEvidence {
  const shown = maskBounds(visible, accepted);
  const whole = maskBounds(isolated, accepted);
  const occlusionFraction = whole.pixels <= 0
    ? 1
    : Math.max(0, Math.min(1, 1 - shown.pixels / whole.pixels));
  return {
    widthPixels: shown.width,
    heightPixels: shown.height,
    visiblePixels: shown.pixels,
    isolatedPixels: whole.pixels,
    occlusionFraction,
    edgeClearancePixels: shown.edgeClearance,
    centreXPixels: shown.centreX,
    centreYPixels: shown.centreY
  };
}

function componentListEvidence(
  visible: CssMask,
  isolated: CssMask,
  accepted: readonly number[],
  minimumPixels = 8
): MerfolkMaskComponentEvidence[] {
  const shown = mergeNearbyMaskComponents(
    connectedComponents(visible, accepted, 3)
  ).filter((component) => component.pixels >= minimumPixels);
  const whole = mergeNearbyMaskComponents(
    connectedComponents(isolated, accepted, 3)
  ).filter((component) => component.pixels >= minimumPixels);
  return shown.map((component) => {
    const baseline = [...whole].sort((left, right) => {
      const leftDistance = Math.hypot(
        left.centreX - component.centreX,
        left.centreY - component.centreY
      );
      const rightDistance = Math.hypot(
        right.centreX - component.centreX,
        right.centreY - component.centreY
      );
      return leftDistance - rightDistance;
    })[0] ?? component;
    return {
      widthPixels: component.width,
      heightPixels: component.height,
      visiblePixels: component.pixels,
      isolatedPixels: baseline.pixels,
      occlusionFraction: baseline.pixels <= 0
        ? 1
        : Math.max(0, Math.min(1, 1 - component.pixels / baseline.pixels)),
      edgeClearancePixels: component.edgeClearance,
      centreXPixels: component.centreX,
      centreYPixels: component.centreY
    };
  });
}

function byHorizontalPosition(
  components: MerfolkMaskComponentEvidence[],
  count = components.length
): MerfolkMaskComponentEvidence[] {
  return [...components]
    .sort((left, right) => left.centreXPixels - right.centreXPixels)
    .slice(0, count);
}

function componentTravel(
  start: MerfolkMaskComponentEvidence[],
  end: MerfolkMaskComponentEvidence[]
): number[] {
  const orderedStart = byHorizontalPosition(start);
  const orderedEnd = byHorizontalPosition(end);
  return orderedStart.map((component, index) => {
    const later = orderedEnd[index];
    if (!later) return 0;
    return Math.hypot(
      later.centreXPixels - component.centreXPixels,
      later.centreYPixels - component.centreYPixels
    );
  });
}

function centreSeparation(
  components: MerfolkMaskComponentEvidence[]
): number {
  const ordered = byHorizontalPosition(components, 2);
  const first = ordered[0];
  const second = ordered[1];
  if (!first || !second) return 0;
  return Math.hypot(
    second.centreXPixels - first.centreXPixels,
    second.centreYPixels - first.centreYPixels
  );
}

function boxOverlapFraction(
  components: MerfolkMaskComponentEvidence[]
): number {
  const ordered = byHorizontalPosition(components, 2);
  const first = ordered[0];
  const second = ordered[1];
  if (!first || !second) return 1;
  const firstLeft = first.centreXPixels - first.widthPixels * 0.5;
  const firstRight = first.centreXPixels + first.widthPixels * 0.5;
  const firstTop = first.centreYPixels - first.heightPixels * 0.5;
  const firstBottom = first.centreYPixels + first.heightPixels * 0.5;
  const secondLeft = second.centreXPixels - second.widthPixels * 0.5;
  const secondRight = second.centreXPixels + second.widthPixels * 0.5;
  const secondTop = second.centreYPixels - second.heightPixels * 0.5;
  const secondBottom = second.centreYPixels + second.heightPixels * 0.5;
  const overlapWidth = Math.max(
    0,
    Math.min(firstRight, secondRight) - Math.max(firstLeft, secondLeft)
  );
  const overlapHeight = Math.max(
    0,
    Math.min(firstBottom, secondBottom) - Math.max(firstTop, secondTop)
  );
  const overlapArea = overlapWidth * overlapHeight;
  const smallerArea = Math.max(1, Math.min(
    first.widthPixels * first.heightPixels,
    second.widthPixels * second.heightPixels
  ));
  return overlapArea / smallerArea;
}

function analyseMerfolkReview(
  role: string,
  visiblePixels: Uint8Array,
  isolatedPixels: Uint8Array,
  motionVisiblePixels: Uint8Array,
  motionIsolatedPixels: Uint8Array,
  width: number,
  height: number,
  pixelRatio: number,
  motionSampleIntervalSec: number
): MerfolkVisualReviewEvidence {
  const visible = toCssMask(visiblePixels, width, height, pixelRatio);
  const isolated = toCssMask(isolatedPixels, width, height, pixelRatio);
  const motionVisible = toCssMask(
    motionVisiblePixels,
    width,
    height,
    pixelRatio
  );
  const motionIsolated = toCssMask(
    motionIsolatedPixels,
    width,
    height,
    pixelRatio
  );
  const population = (
    populationRole: string,
    body: number,
    face: number,
    eyes: number
  ) => {
    const instances = componentListEvidence(
      visible,
      isolated,
      [body, face, eyes],
      8
    ).slice(0, populationRole === "reef-citizen" ? 3 : 2);
    return {
      role: populationRole,
      component: instances[0] ?? componentEvidence(
        visible,
        isolated,
        [body, face, eyes]
      ),
      face: componentEvidence(visible, isolated, [face]),
      eyes: componentEvidence(visible, isolated, [eyes]),
      instances
    };
  };
  const swimmerMasks = [
    MERFOLK_MASK.swimmerBody.id,
    MERFOLK_MASK.swimmerFace.id,
    MERFOLK_MASK.swimmerEyes.id
  ];
  const heraldMasks = [
    MERFOLK_MASK.heraldBody.id,
    MERFOLK_MASK.heraldFace.id,
    MERFOLK_MASK.heraldEyes.id
  ];
  const swimmerStart = componentListEvidence(
    visible,
    isolated,
    swimmerMasks,
    8
  );
  const swimmerEnd = componentListEvidence(
    motionVisible,
    motionIsolated,
    swimmerMasks,
    8
  );
  const heraldStart = componentListEvidence(
    visible,
    isolated,
    heraldMasks,
    8
  );
  const heraldEnd = componentListEvidence(
    motionVisible,
    motionIsolated,
    heraldMasks,
    8
  );
  // Component lists are pixel-area sorted. Select the two authored figures
  // first, then order those two by side; sorting every tiny fin/hair island by
  // X recreated a false stacked pair at the frame edge.
  const swimmerStartPrimary = byHorizontalPosition(swimmerStart.slice(0, 2));
  const swimmerEndPrimary = byHorizontalPosition(swimmerEnd.slice(0, 2));
  const heraldStartPrimary = byHorizontalPosition(heraldStart.slice(0, 2));
  const heraldEndPrimary = byHorizontalPosition(heraldEnd.slice(0, 2));
  return {
    guardianRole: role,
    guardian: silhouetteEvidence(visible, isolated, [
      MERFOLK_MASK.guardianBody.id,
      MERFOLK_MASK.guardianIdentity.id,
      MERFOLK_MASK.guardianFace.id,
      MERFOLK_MASK.guardianEyes.id
    ]),
    identity: silhouetteEvidence(visible, isolated, [
      MERFOLK_MASK.guardianIdentity.id
    ]),
    face: componentEvidence(visible, isolated, [
      MERFOLK_MASK.guardianFace.id
    ]),
    eyes: componentEvidence(visible, isolated, [
      MERFOLK_MASK.guardianEyes.id
    ]),
    population: [
      population(
        "reef-citizen",
        MERFOLK_MASK.citizenBody.id,
        MERFOLK_MASK.citizenFace.id,
        MERFOLK_MASK.citizenEyes.id
      ),
      population(
        "current-swimmer",
        MERFOLK_MASK.swimmerBody.id,
        MERFOLK_MASK.swimmerFace.id,
        MERFOLK_MASK.swimmerEyes.id
      ),
      population(
        "conch-herald",
        MERFOLK_MASK.heraldBody.id,
        MERFOLK_MASK.heraldFace.id,
        MERFOLK_MASK.heraldEyes.id
      )
    ],
    motion: {
      sampleIntervalSec: motionSampleIntervalSec,
      swimmerStart: swimmerStartPrimary,
      swimmerEnd: swimmerEndPrimary,
      swimmerTravelPixels: componentTravel(
        swimmerStartPrimary,
        swimmerEndPrimary
      ).slice(0, 2),
      swimmerCentreSeparationPixels: [
        centreSeparation(swimmerStartPrimary),
        centreSeparation(swimmerEndPrimary)
      ],
      swimmerBoxOverlapFraction: [
        boxOverlapFraction(swimmerStartPrimary),
        boxOverlapFraction(swimmerEndPrimary)
      ],
      heraldTravelPixels: componentTravel(
        heraldStartPrimary,
        heraldEndPrimary
      ).slice(0, 2)
    }
  };
}

export interface BrowserCaptureBundle {
  tier: "fast" | "full";
  captures: SceneCapture[];
  castReviewAtlasDataUrl: string;
  merfolkMaskAtlasDataUrl: string;
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
  const swimmerDetailHeight = 200;
  const atlas = document.createElement("canvas");
  atlas.width = panelWidth * frames.length;
  atlas.height = panelHeight + labelHeight + swimmerDetailHeight;
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

    // A labelled, enlarged phone crop keeps the two horizontal faces in the
    // human review surface. The previous atlas technically contained them,
    // but at native gameplay scale reviewers had to zoom the entire 1170 px
    // strip and could easily approve body presence without judging expression.
    const detailTop = labelHeight + panelHeight;
    atlasContext.fillStyle = "#06152d";
    atlasContext.fillRect(
      panel * panelWidth,
      detailTop,
      panelWidth,
      swimmerDetailHeight
    );
    const cropWidth = Math.round(frame.width * 0.24);
    const cropHeight = Math.round(frame.height * 0.082);
    const cropY = Math.round(frame.height * 0.265);
    const detailGap = 6;
    const detailWidth = Math.floor((panelWidth - detailGap * 3) / 2);
    const detailImageTop = detailTop + 34;
    const detailImageHeight = swimmerDetailHeight - 42;
    for (const [sideIndex, cropX] of [
      0,
      frame.width - cropWidth
    ].entries()) {
      atlasContext.drawImage(
        source,
        cropX,
        cropY,
        cropWidth,
        cropHeight,
        panel * panelWidth + detailGap + sideIndex * (detailWidth + detailGap),
        detailImageTop,
        detailWidth,
        detailImageHeight
      );
    }
    atlasContext.fillStyle = "#9cecf4";
    atlasContext.font = "700 13px system-ui, sans-serif";
    atlasContext.textAlign = "center";
    atlasContext.fillText(
      "CURRENT SWIMMERS · PHONE FACE CROP",
      panel * panelWidth + panelWidth / 2,
      detailTop + 22
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
  const merfolkMaskFrames: Array<{
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
      merfolkMaskFrames.push({
        pixels: visibleMerfolk.pixels.slice(),
        width: visibleMerfolk.width,
        height: visibleMerfolk.height
      });

      view.setMerfolkMaskMode(true, true);
      view.renderMerfolkMask();
      const isolatedMerfolk = view.capturePixels();
      view.setMerfolkMaskMode(false);

      const motionSampleIntervalSec =
        MERFOLK_CITY_CONTRACT.visualReview.motionSampleIntervalSec;
      view.render(
        sim,
        [gate],
        1,
        sim.elapsedSec + motionSampleIntervalSec,
        FIXED_DT_SEC
      );
      view.setMerfolkMaskMode(true, false);
      view.renderMerfolkMask();
      const motionVisibleMerfolk = view.capturePixels();
      view.setMerfolkMaskMode(false);

      view.setMerfolkMaskMode(true, true);
      view.renderMerfolkMask();
      const motionIsolatedMerfolk = view.capturePixels();
      view.setMerfolkMaskMode(false);
      merfolkVisualReview = analyseMerfolkReview(
        view.activeHeroMerfolkRole(),
        visibleMerfolk.pixels,
        isolatedMerfolk.pixels,
        motionVisibleMerfolk.pixels,
        motionIsolatedMerfolk.pixels,
        visibleMerfolk.width,
        visibleMerfolk.height,
        view.capturePixelRatio(),
        motionSampleIntervalSec
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
    castReviewAtlasDataUrl: castReviewAtlas(castFrames),
    merfolkMaskAtlasDataUrl: castReviewAtlas(merfolkMaskFrames)
  };
}
