/**
 * Structural validation for configuration and evidence.
 *
 * Every missing value that would disable a check is a blocker. A malformed
 * object is never cast and allowed to drift into a false green result.
 */

import type {
  AssetManifest,
  Finding,
  GateConfig,
  GateInput,
  RuntimeObstacle,
  SceneCapture
} from "./types.ts";

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null
    ? value as UnknownRecord
    : null;
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function blocker(
  code: string,
  message: string,
  rule = "Art Bible §11 step 8",
  asset?: string
): Finding {
  return { code, severity: "blocker", message, rule, asset };
}

function requireFinite(
  root: UnknownRecord,
  path: string,
  findings: Finding[],
  code = "CONFIG_MALFORMED"
): void {
  const parts = path.split(".");
  let cursor: unknown = root;
  for (const part of parts) {
    const current = record(cursor);
    cursor = current?.[part];
  }
  if (!finite(cursor)) {
    findings.push(blocker(code, `Missing or non-numeric "${path}".`, "Phase 3A gate configuration"));
  }
}

export function validateGateConfig(raw: unknown): Finding[] {
  const findings: Finding[] = [];
  const cfg = record(raw);
  if (!cfg) return [blocker("CONFIG_MALFORMED", "Art-gate config is not an object.")];

  if (!nonEmptyString(cfg.configVersion)) {
    findings.push(blocker("CONFIG_MALFORMED", 'Missing "configVersion".'));
  }
  if (!nonEmptyString(cfg.sourceOfTruth)) {
    findings.push(blocker("CONFIG_MALFORMED", 'Missing "sourceOfTruth".'));
  }

  for (const path of [
    "scene.drawCalls.hard",
    "scene.drawCalls.minSpikeHeadroom",
    "scene.triangles.warning",
    "scene.triangles.hard",
    "scene.textureMemoryMB.warning",
    "scene.textureMemoryMB.hard",
    "scene.activeArtMaterials.hardMaxExclusive",
    "scene.compressedArtPayloadMB.hard",
    "scene.godRayMeshes.hard",
    "camera.forwardSpeedMax",
    "camera.visibleDistanceAhead",
    "camera.minReactionWindowMs",
    "lod.silhouetteToleranceWorldUnits",
    "colliderTruth.edgeAlignmentToleranceWorldUnits",
    "colliderTruth.straightnessToleranceWorldUnits",
    "colliderTruth.minimumSamplesPerEdge",
    "contrast.framePercentile",
    "contrast.frameMinRatio",
    "contrast.perObstaclePercentile",
    "contrast.perObstacleMinRatio",
    "creature.viewportWidthFractionMin",
    "creature.viewportWidthFractionMax",
    "creature.eyeGlowPixelsMin",
    "creature.eyeGlowPixelsMax",
    "creature.maxBones",
    "creature.maxMaterials",
    "creature.maxTextureSizePx",
    "trail.maxLaneWidthFractionAtMaxMomentum"
    ,"performance.minMedianFps"
    ,"performance.maxColdStartMs"
    ,"performance.maxInputToVisibleMs"
    ,"performance.maxSteadyStateHeapMB"
    ,"performance.maxSoakHeapGrowthMB"
    ,"performance.maxPools.gates"
    ,"performance.maxPools.stripes"
    ,"performance.maxPools.trailSegments"
    ,"performance.maxPools.particles"
  ]) requireFinite(cfg, path, findings);

  const lod = record(cfg.lod);
  const bands = lod?.bands;
  if (!Array.isArray(bands) || bands.length === 0) {
    findings.push(blocker("CONFIG_MALFORMED", 'Missing non-empty "lod.bands".'));
  } else {
    for (const [index, rawBand] of bands.entries()) {
      const band = record(rawBand);
      if (
        !band ||
        !finite(band.level) ||
        !finite(band.nearWorldUnits) ||
        !finite(band.farWorldUnits)
      ) {
        findings.push(blocker(
          "CONFIG_MALFORMED",
          `LOD band ${index} must provide numeric level/nearWorldUnits/farWorldUnits.`
        ));
      }
    }
  }

  const families = record(cfg.assetFamilies);
  if (!families || Object.keys(families).length === 0) {
    findings.push(blocker("CONFIG_MALFORMED", 'Missing non-empty "assetFamilies".'));
  } else {
    for (const [name, rawFamily] of Object.entries(families)) {
      const family = record(rawFamily);
      if (
        !family ||
        typeof family.collidable !== "boolean" ||
        !finite(family.maxMaterials) ||
        !nonEmptyString(family.strategy)
      ) {
        findings.push(blocker(
          "CONFIG_MALFORMED",
          `Asset family "${name}" is missing collidable/maxMaterials/strategy.`
        ));
      }
    }
  }

  const tiers = record(cfg.captureTiers);
  for (const name of ["structural", "fast", "full", "signoff"]) {
    const tier = record(tiers?.[name]);
    if (
      !tier ||
      typeof tier.requireCaptures !== "boolean" ||
      typeof tier.requireRealDevice !== "boolean" ||
      !finite(tier.requiredSoakMinutes) ||
      !Array.isArray(tier.acceptedSourceKinds) ||
      !Array.isArray(tier.devices) ||
      !Array.isArray(tier.expectedStates)
    ) {
      findings.push(blocker(
        "CONFIG_MALFORMED",
        `Capture tier "${name}" is incomplete.`
      ));
    }
  }

  return findings;
}

export function validateAssetManifest(
  raw: unknown,
  minimumSamples: number,
  source = "<unnamed>"
): Finding[] {
  const findings: Finding[] = [];
  const asset = record(raw);
  if (!asset) return [blocker("MANIFEST_MALFORMED", "Manifest is not an object.", undefined, source)];

  const name = nonEmptyString(asset.name) ? asset.name : source;
  const fail = (message: string, code = "MANIFEST_MALFORMED") =>
    findings.push(blocker(code, message, "Art Bible §11 step 8", name));

  if (!nonEmptyString(asset.name)) fail('Missing "name".');
  if (!nonEmptyString(asset.family)) fail('Missing "family".');
  if (typeof asset.collidable !== "boolean") fail('Missing "collidable".');
  if (!finite(asset.materials) || asset.materials < 0) fail('Invalid "materials".');
  if (!finite(asset.textureMemoryMB) || asset.textureMemoryMB < 0) {
    fail('Invalid "textureMemoryMB".');
  }

  if (!Array.isArray(asset.lods) || asset.lods.length === 0) {
    fail('Missing non-empty "lods".');
    return findings;
  }

  const levels = new Set<number>();
  for (const rawLod of asset.lods) {
    const lod = record(rawLod);
    if (!lod) {
      fail("LOD entry is not an object.");
      continue;
    }
    if (!finite(lod.level) || ![0, 1, 2].includes(lod.level)) {
      fail(`Invalid LOD level "${String(lod.level)}".`);
      continue;
    }
    if (levels.has(lod.level)) fail(`Duplicate LOD${lod.level}.`, "MANIFEST_DUPLICATE_LOD");
    levels.add(lod.level);
    if (!finite(lod.triangles) || lod.triangles < 0) {
      fail(`LOD${lod.level} has invalid "triangles".`);
    }

    if (lod.playableEdge !== undefined) {
      const edge = record(lod.playableEdge);
      if (!edge || !["x", "y", "z"].includes(String(edge.axis))) {
        fail(`LOD${lod.level} has invalid playable-edge axis.`);
        continue;
      }
      if (edge.gapDirection !== 1 && edge.gapDirection !== -1) {
        fail(`LOD${lod.level} playable-edge gapDirection must be 1 or -1.`);
      }
      if ("colliderPlane" in edge) {
        fail(
          `LOD${lod.level} carries colliderPlane in art evidence. Collider truth must come from runtime evidence.`,
          "MANIFEST_EMBEDS_COLLIDER_TRUTH"
        );
      }
      if (!Array.isArray(edge.samples)) {
        fail(`LOD${lod.level} playable edge has no sample array.`);
      } else {
        if (edge.samples.length < minimumSamples) {
          fail(
            `LOD${lod.level} has ${edge.samples.length} edge samples; at least ${minimumSamples} are required.`,
            "EDGE_SAMPLE_COVERAGE"
          );
        }
        for (const sample of edge.samples) {
          const point = record(sample);
          if (
            !point ||
            !finite(point.height) ||
            !finite(point.depth) ||
            !finite(point.visualPlane)
          ) {
            fail(`LOD${lod.level} has an invalid edge sample.`);
            break;
          }
        }
      }
    }
  }

  if (!levels.has(0)) fail("No LOD0 entry.", "MANIFEST_NO_LOD0");
  return findings;
}

export function validateRuntimeObstacle(raw: unknown): Finding[] {
  const obstacle = record(raw);
  if (!obstacle) return [blocker("RUNTIME_COLLIDER_MALFORMED", "Runtime obstacle is not an object.")];
  const id = nonEmptyString(obstacle.id) ? obstacle.id : "<unnamed>";
  const fail = (message: string) => blocker(
    "RUNTIME_COLLIDER_MALFORMED",
    `${id}: ${message}`,
    "Authoritative runtime collision evidence"
  );
  const findings: Finding[] = [];

  if (!nonEmptyString(obstacle.id)) findings.push(fail('Missing "id".'));
  if (!nonEmptyString(obstacle.family)) findings.push(fail('Missing "family".'));
  if (!["x", "y", "z"].includes(String(obstacle.axis))) findings.push(fail("Invalid axis."));
  if (obstacle.gapDirection !== 1 && obstacle.gapDirection !== -1) {
    findings.push(fail("gapDirection must be 1 or -1."));
  }
  if (!finite(obstacle.colliderPlane)) findings.push(fail("Invalid colliderPlane."));

  const envelope = record(obstacle.colliderEnvelope);
  if (
    !envelope ||
    !Array.isArray(envelope.min) ||
    !Array.isArray(envelope.max) ||
    envelope.min.length !== 3 ||
    envelope.max.length !== 3 ||
    ![...envelope.min, ...envelope.max].every(finite)
  ) {
    findings.push(fail("Invalid colliderEnvelope."));
  } else {
    const minimums = envelope.min as number[];
    const maximums = envelope.max as number[];
    if (minimums.some((value, index) => value > maximums[index]!)) {
      findings.push(fail("colliderEnvelope is inverted."));
    }
  }

  const source = record(obstacle.source);
  if (
    !source ||
    !nonEmptyString(source.module) ||
    !nonEmptyString(source.exportName) ||
    !nonEmptyString(source.runtimeRevision)
  ) {
    findings.push(fail("Missing independent runtime source metadata."));
  }
  return findings;
}

export function validateCapture(raw: unknown): Finding[] {
  const capture = record(raw);
  if (!capture) return [blocker("CAPTURE_MALFORMED", "Capture is not an object.")];
  const findings: Finding[] = [];
  const fail = (message: string) => findings.push(blocker(
    "CAPTURE_MALFORMED",
    message,
    "Art Bible §12 capture evidence"
  ));

  if (!finite(capture.seed)) fail("Capture seed is missing.");
  if (!nonEmptyString(capture.device)) fail("Capture device is missing.");
  const state = record(capture.state);
  if (
    !state ||
    !["low", "mid", "max"].includes(String(state.momentum)) ||
    typeof state.bloom !== "boolean" ||
    typeof state.caustics !== "boolean" ||
    !["high", "medium", "low"].includes(String(state.quality))
  ) fail("Capture effect state is incomplete.");

  for (const key of [
    "drawCalls",
    "triangles",
    "textureMemoryMB",
    "activeMaterials",
    "godRayMeshes"
  ]) {
    if (!finite(capture[key]) || (capture[key] as number) < 0) {
      fail(`Capture metric "${key}" is invalid.`);
    }
  }

  if (!Array.isArray(capture.frameContrastRatios)) {
    fail("frameContrastRatios must be an array.");
  }
  if (!Array.isArray(capture.obstacles)) {
    fail("obstacles must be an array.");
  } else {
    for (const rawObstacle of capture.obstacles) {
      const obstacle = record(rawObstacle);
      if (
        !obstacle ||
        !nonEmptyString(obstacle.obstacleId) ||
        !Array.isArray(obstacle.ratios)
      ) {
        fail("Obstacle contrast entry is incomplete.");
        break;
      }
    }
  }

  const source = record(capture.source);
  if (
    !source ||
    !["ci-emulated", "real-device", "static-analysis"].includes(String(source.kind)) ||
    !nonEmptyString(source.browser) ||
    !nonEmptyString(source.platform) ||
    !nonEmptyString(source.evidenceId)
  ) fail("Capture source metadata is incomplete.");

  return findings;
}

export function validateGateInput(
  raw: unknown,
  cfg: GateConfig
): { findings: Finding[]; input: GateInput | null } {
  const findings: Finding[] = [];
  const input = record(raw);
  if (!input) return {
    findings: [blocker("INPUT_MALFORMED", "Gate input is not an object.")],
    input: null
  };

  if (!nonEmptyString(input.evidenceVersion)) {
    findings.push(blocker("INPUT_MALFORMED", 'Missing "evidenceVersion".'));
  }
  if (!nonEmptyString(input.runtimeRevision)) {
    findings.push(blocker("INPUT_MALFORMED", 'Missing "runtimeRevision".'));
  }
  if (!Array.isArray(input.assets)) {
    findings.push(blocker("INPUT_MALFORMED", '"assets" must be an array.'));
  }
  if (!Array.isArray(input.runtimeObstacles)) {
    findings.push(blocker("INPUT_MALFORMED", '"runtimeObstacles" must be an array.'));
  }
  if (!Array.isArray(input.captures)) {
    findings.push(blocker("INPUT_MALFORMED", '"captures" must be an array.'));
  }

  if (Array.isArray(input.assets)) {
    for (const asset of input.assets) {
      findings.push(...validateAssetManifest(
        asset,
        cfg.colliderTruth.minimumSamplesPerEdge
      ));
    }
  }
  if (Array.isArray(input.runtimeObstacles)) {
    for (const obstacle of input.runtimeObstacles) {
      findings.push(...validateRuntimeObstacle(obstacle));
    }
  }
  if (Array.isArray(input.captures)) {
    for (const capture of input.captures) {
      findings.push(...validateCapture(capture));
    }
  }

  const evidence = record(input.renderEvidence);
  const trail = record(evidence?.trail);
  if (
    !trail ||
    !nonEmptyString(trail.implementation) ||
    typeof trail.particleReplacementUsed !== "boolean" ||
    !finite(trail.laneWidthFractionAtMaxMomentum)
  ) {
    findings.push(blocker(
      "RENDER_EVIDENCE_MALFORMED",
      "Trail implementation, particle use and max-momentum width are required.",
      "Art Bible §8"
    ));
  }

  if (
    input.compressedArtPayloadMB !== undefined &&
    (
      !finite(input.compressedArtPayloadMB) ||
      input.compressedArtPayloadMB < 0
    )
  ) {
    findings.push(blocker(
      "INPUT_MALFORMED",
      "compressedArtPayloadMB must be a non-negative number."
    ));
  }
  if (
    input.soakMinutes !== undefined &&
    (!finite(input.soakMinutes) || input.soakMinutes < 0)
  ) {
    findings.push(blocker(
      "INPUT_MALFORMED",
      "soakMinutes must be a non-negative number."
    ));
  }

  if (input.performanceEvidence !== undefined) {
    const performance = record(input.performanceEvidence);
    const pools = record(performance?.peakPools);
    const values = [
      performance?.medianFps,
      performance?.coldStartMs,
      performance?.inputToVisibleMs,
      performance?.steadyStateHeapMB,
      performance?.soakHeapGrowthMB,
      pools?.gates,
      pools?.stripes,
      pools?.trailSegments,
      pools?.particles
    ];
    if (!performance || !pools || !values.every(finite)) {
      findings.push(blocker(
        "PERFORMANCE_EVIDENCE_MALFORMED",
        "Performance evidence must include FPS, load, input, heap and every pool peak.",
        "Master prompt §4.3 / §4.6"
      ));
    }
  }

  return {
    findings,
    input: findings.some((finding) => finding.code === "INPUT_MALFORMED")
      ? null
      : raw as GateInput
  };
}

export function asConfig(raw: unknown): GateConfig {
  return raw as GateConfig;
}

export function asAsset(raw: unknown): AssetManifest {
  return raw as AssetManifest;
}

export function asRuntimeObstacle(raw: unknown): RuntimeObstacle {
  return raw as RuntimeObstacle;
}

export function asCapture(raw: unknown): SceneCapture {
  return raw as SceneCapture;
}
