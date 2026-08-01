import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildVerticalSliceEvidence } from "../integration/verticalSliceEvidence.ts";
import type {
  EffectState,
  SceneCapture
} from "../src/types.ts";

const here = dirname(fileURLToPath(import.meta.url));
const revision = "fixture-runtime-revision";

const fastStates: EffectState[] = [
  { momentum: "low", bloom: false, caustics: true, quality: "high" },
  { momentum: "mid", bloom: true, caustics: true, quality: "medium" },
  { momentum: "max", bloom: true, caustics: true, quality: "high" },
  { momentum: "max", bloom: false, caustics: false, quality: "low" }
];

function captures(lowContrast = false): SceneCapture[] {
  const guardianRoles = ["tidekeeper", "coral-warden", "astral-oracle"];
  const component = (
    widthPixels: number,
    heightPixels: number,
    visiblePixels: number,
    isolatedPixels = Math.round(visiblePixels * 1.08),
    edgeClearancePixels = 12
  ) => ({
    widthPixels,
    heightPixels,
    visiblePixels,
    isolatedPixels,
    occlusionFraction: 1 - visiblePixels / isolatedPixels,
    edgeClearancePixels
  });
  return fastStates.map((state, index) => ({
    seed: 20260730 + index,
    device: "ci-chromium",
    source: {
      kind: "ci-emulated",
      browser: "Chromium fixture",
      platform: "linux",
      evidenceId: `fixture-${index}`
    },
    state,
    drawCalls: 66,
    triangles: 4200,
    textureMemoryMB: 0,
    activeMaterials: 9,
    godRayMeshes: 3,
    heroMerfolkHeightPixels: 104,
    heroMerfolkFaceHeightPixels: 27,
    heroMerfolkEyeDiameterPixels: 6.5,
    ...(index < 3 ? {
      merfolkVisualReview: {
        guardianRole: guardianRoles[index]!,
        guardian: component(62, 104, 1_420),
        face: component(24, 27, 420),
        eyes: component(20, 7, 82),
        identity: component(38, 43, 260),
        population: [
          { role: "reef-citizen", component: component(18, 33, 142) },
          { role: "current-swimmer", component: component(39, 19, 134) },
          { role: "conch-herald", component: component(23, 37, 176) }
        ]
      }
    } : {}),
    frameContrastRatios: Array.from({ length: 20 }, () => 4.2),
    obstacles: [{
      obstacleId: "procedural-gate-pair",
      ratios: Array.from(
        { length: 20 },
        () => lowContrast && index === 2 ? 1.8 : 4.1
      )
    }]
  }));
}

const pass = buildVerticalSliceEvidence(revision, captures());
const reject = buildVerticalSliceEvidence(revision, captures(true));
const rejectedLeft = reject.assets[0]!;
rejectedLeft.collidable = false;
for (const sample of rejectedLeft.lods[0]!.playableEdge!.samples.slice(1, 4)) {
  sample.visualPlane -= 0.3;
}

mkdirSync(here, { recursive: true });
writeFileSync(join(here, "gate-input.pass.json"), `${JSON.stringify(pass, null, 2)}\n`);
writeFileSync(join(here, "gate-input.reject.json"), `${JSON.stringify(reject, null, 2)}\n`);
console.log("art-gate fixtures written");
