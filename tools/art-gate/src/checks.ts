/**
 * Non-collider Phase 3A checks: budgets, creature, trail, capture coverage,
 * contrast, reaction window and sign-off performance evidence.
 */

import type {
  AssetManifest,
  CaptureTierConfig,
  EffectState,
  Finding,
  GateConfig,
  GateInput,
  PerformanceEvidence,
  RangeBudget,
  SceneCapture
} from "./types.ts";

function result(
  code: string,
  severity: Finding["severity"],
  message: string,
  rule: string,
  extra: Partial<Finding> = {}
): Finding {
  return { code, severity, message, rule, ...extra };
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0]!;
  const rank = (p / 100) * (sorted.length - 1);
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  if (low === high) return sorted[low]!;
  return sorted[low]! + (sorted[high]! - sorted[low]!) * (rank - low);
}

export function checkAssetBudget(
  asset: AssetManifest,
  family: RangeBudget
): Finding[] {
  const findings: Finding[] = [];
  if (asset.materials > family.maxMaterials) {
    findings.push(result(
      "MATERIAL_COUNT_EXCEEDED",
      "blocker",
      `${asset.materials} materials against a budget of ${family.maxMaterials}.`,
      "Art Bible §10",
      { asset: asset.name, observed: asset.materials, limit: family.maxMaterials }
    ));
  }

  const ranges = [family.lod0, family.lod1, family.lod2];
  if (!asset.baselineProcedural) {
    for (const [level, range] of ranges.entries()) {
      if (range && !asset.lods.some((lod) => lod.level === level)) {
        findings.push(result(
          "LOD_REQUIRED_MISSING",
          "blocker",
          `Family "${asset.family}" requires LOD${level} evidence.`,
          "Art Bible §10 / §11 step 3",
          { asset: asset.name, lod: level }
        ));
      }
    }
  }
  for (const lod of asset.lods) {
    const range = ranges[lod.level];
    if (!range) {
      findings.push(result(
        "LOD_NOT_BUDGETED",
        "blocker",
        `LOD${lod.level} exists but family "${asset.family}" has no approved budget for it.`,
        "Art Bible §10",
        { asset: asset.name, lod: lod.level }
      ));
      continue;
    }
    const [minimum, maximum] = range;
    if (lod.triangles > maximum) {
      findings.push(result(
        "TRIANGLE_BUDGET_EXCEEDED",
        "blocker",
        `LOD${lod.level} has ${lod.triangles} triangles; ceiling ${maximum}.`,
        "Art Bible §10",
        { asset: asset.name, lod: lod.level, observed: lod.triangles, limit: maximum }
      ));
    } else if (lod.triangles < minimum) {
      findings.push(result(
        "TRIANGLE_BUDGET_UNDERRUN",
        "warning",
        `LOD${lod.level} is below the silhouette-readability planning floor; inspect before accepting.`,
        "Art Bible §10",
        { asset: asset.name, lod: lod.level, observed: lod.triangles, limit: minimum }
      ));
    }
  }

  const ordered = [...asset.lods].sort((a, b) => a.level - b.level);
  for (let index = 1; index < ordered.length; index++) {
    const previous = ordered[index - 1]!;
    const current = ordered[index]!;
    if (current.triangles >= previous.triangles) {
      findings.push(result(
        "LOD_NOT_DECREASING",
        "blocker",
        `LOD${current.level} is not lighter than LOD${previous.level}.`,
        "Art Bible §11 step 3",
        { asset: asset.name, lod: current.level }
      ));
    }
  }
  return findings;
}

export function checkCreature(
  asset: AssetManifest,
  cfg: GateConfig["creature"]
): Finding[] {
  if (asset.family !== "glowfin") return [];
  const findings: Finding[] = [];
  const missingNumber = (
    key: keyof Pick<AssetManifest, "bones" | "maxTextureSizePx" | "viewportWidthFraction" | "eyeGlowPixels">,
    code: string
  ) => {
    if (asset[key] === undefined) {
      findings.push(result(
        code,
        "blocker",
        `Glowfin manifest omits required "${key}" evidence.`,
        "Art Bible §5.2–§5.4",
        { asset: asset.name }
      ));
    }
  };
  missingNumber("bones", "BONE_COUNT_NOT_MEASURED");
  missingNumber("maxTextureSizePx", "TEXTURE_SIZE_NOT_MEASURED");
  missingNumber("viewportWidthFraction", "CREATURE_SCREEN_SIZE_NOT_MEASURED");
  missingNumber("eyeGlowPixels", "EYE_GLOW_SIZE_NOT_MEASURED");

  if (asset.bones !== undefined && asset.bones > cfg.maxBones) {
    findings.push(result(
      "BONE_COUNT_EXCEEDED", "blocker",
      `${asset.bones} bones against ${cfg.maxBones}.`, "Art Bible §5.4",
      { asset: asset.name, observed: asset.bones, limit: cfg.maxBones }
    ));
  }
  if (
    asset.maxTextureSizePx !== undefined &&
    asset.maxTextureSizePx > cfg.maxTextureSizePx
  ) {
    findings.push(result(
      "TEXTURE_SIZE_EXCEEDED", "blocker",
      `${asset.maxTextureSizePx}px texture against ${cfg.maxTextureSizePx}px.`,
      "Art Bible §5.4",
      { asset: asset.name, observed: asset.maxTextureSizePx, limit: cfg.maxTextureSizePx }
    ));
  }
  if (
    asset.viewportWidthFraction !== undefined &&
    (
      asset.viewportWidthFraction < cfg.viewportWidthFractionMin ||
      asset.viewportWidthFraction > cfg.viewportWidthFractionMax
    )
  ) {
    findings.push(result(
      "CREATURE_SCREEN_SIZE_OUTSIDE_RANGE", "blocker",
      "Glowfin does not occupy the approved fraction of portrait viewport width.",
      "Art Bible §5.2",
      {
        asset: asset.name,
        observed: asset.viewportWidthFraction,
        limit: `${cfg.viewportWidthFractionMin}–${cfg.viewportWidthFractionMax}`
      }
    ));
  }
  if (
    asset.eyeGlowPixels !== undefined &&
    (asset.eyeGlowPixels < cfg.eyeGlowPixelsMin || asset.eyeGlowPixels > cfg.eyeGlowPixelsMax)
  ) {
    findings.push(result(
      "EYE_GLOW_SIZE_OUTSIDE_RANGE", "blocker",
      "Eye glow is outside the approved mobile readability range.",
      "Art Bible §5.2",
      {
        asset: asset.name,
        observed: asset.eyeGlowPixels,
        limit: `${cfg.eyeGlowPixelsMin}–${cfg.eyeGlowPixelsMax}`
      }
    ));
  }

  const clips = asset.clips ?? [];
  const missingClips = cfg.requiredClips.filter((clip) => !clips.includes(clip));
  if (missingClips.length > 0) {
    findings.push(result(
      "CLIPS_MISSING", "blocker",
      `Missing clips: ${missingClips.join(", ")}.`, "Art Bible §5.4",
      { asset: asset.name }
    ));
  }
  const states = asset.observedStates ?? [];
  const missingStates = cfg.requiredStates.filter((state) => !states.includes(state));
  if (missingStates.length > 0) {
    findings.push(result(
      "CREATURE_STATES_MISSING", "blocker",
      `Missing observed states: ${missingStates.join(", ")}.`, "Art Bible §5.3",
      { asset: asset.name }
    ));
  }
  if (asset.animationDriver === undefined) {
    findings.push(result(
      "ANIMATION_DRIVER_NOT_DECLARED", "blocker",
      "Glowfin manifest omits its animation driver.", "Art Bible §5.3",
      { asset: asset.name }
    ));
  } else if (asset.animationDriver !== cfg.animationDriver) {
    findings.push(result(
      "ANIMATION_WALL_CLOCK", "blocker",
      "Animation is not driven by deterministic simulation state.", "Art Bible §5.3",
      { asset: asset.name, observed: asset.animationDriver, limit: cfg.animationDriver }
    ));
  }
  return findings;
}

export function checkTrail(
  input: GateInput,
  cfg: GateConfig["trail"]
): Finding[] {
  const trail = input.renderEvidence.trail;
  const findings: Finding[] = [];
  if (trail.implementation !== cfg.implementation) {
    findings.push(result(
      "TRAIL_IMPLEMENTATION_MISMATCH", "blocker",
      `Trail uses "${trail.implementation}", expected "${cfg.implementation}".`,
      "Art Bible §8"
    ));
  }
  if (trail.particleReplacementUsed && !cfg.particleReplacementAllowed) {
    findings.push(result(
      "TRAIL_PARTICLE_REPLACEMENT", "blocker",
      "Particle trail replaces the approved mesh ribbon.", "Art Bible §8"
    ));
  }
  if (
    trail.laneWidthFractionAtMaxMomentum >
    cfg.maxLaneWidthFractionAtMaxMomentum
  ) {
    findings.push(result(
      "TRAIL_TOO_WIDE", "blocker",
      "Max-momentum trail obscures too much of the playable lane.", "Art Bible §8",
      {
        observed: trail.laneWidthFractionAtMaxMomentum,
        limit: cfg.maxLaneWidthFractionAtMaxMomentum
      }
    ));
  }
  return findings;
}

function stateKey(device: string, state: EffectState): string {
  return [
    device,
    state.momentum,
    state.bloom ? "bloom" : "plain",
    state.caustics ? "caustics" : "no-caustics",
    state.quality
  ].join("|");
}

function fullMatrix(devices: string[]): Array<EffectState & { device: string }> {
  const states: Array<EffectState & { device: string }> = [];
  for (const device of devices) {
    for (const momentum of ["low", "mid", "max"] as const) {
      for (const bloom of [true, false]) {
        for (const caustics of [true, false]) {
          for (const quality of ["high", "medium", "low"] as const) {
            states.push({ device, momentum, bloom, caustics, quality });
          }
        }
      }
    }
  }
  return states;
}

function expectedStates(tier: CaptureTierConfig) {
  return tier.expectedStates.length > 0
    ? tier.expectedStates
    : fullMatrix(tier.devices);
}

export function checkCaptureCoverage(
  captures: SceneCapture[],
  tierName: string,
  tier: CaptureTierConfig
): Finding[] {
  if (!tier.requireCaptures) return [];
  if (captures.length === 0) {
    return [result(
      "NO_CAPTURES", "blocker",
      `Capture tier "${tierName}" received no render evidence.`,
      "Art Bible §12"
    )];
  }

  const findings: Finding[] = [];
  const seen = new Map<string, number>();
  for (const capture of captures) {
    const key = stateKey(capture.device, capture.state);
    seen.set(key, (seen.get(key) ?? 0) + 1);
    if (!tier.devices.includes(capture.device)) {
      findings.push(result(
        "UNEXPECTED_CAPTURE_DEVICE", "blocker",
        `"${capture.device}" is not approved for tier "${tierName}".`,
        "Master prompt §4.7"
      ));
    }
    if (!tier.acceptedSourceKinds.includes(capture.source.kind)) {
      findings.push(result(
        "CAPTURE_SOURCE_NOT_ACCEPTED", "blocker",
        `${capture.source.kind} evidence is not accepted for tier "${tierName}".`,
        "Master prompt §4.7"
      ));
    }
    if (tier.requireRealDevice && capture.source.kind !== "real-device") {
      findings.push(result(
        "REAL_DEVICE_EVIDENCE_REQUIRED", "blocker",
        "Sign-off cannot use desktop emulation as device evidence.",
        "Master prompt §4.7"
      ));
    }
  }
  for (const [key, count] of seen) {
    if (count > 1) {
      findings.push(result(
        "DUPLICATE_CAPTURE_STATE", "blocker",
        `${key} appears ${count} times; evidence must be unambiguous.`,
        "Art Bible §12"
      ));
    }
  }

  const expected = expectedStates(tier);
  const expectedKeys = new Set(expected.map((state) =>
    stateKey(state.device, state)
  ));
  const unexpected = [...seen.keys()].filter((key) => !expectedKeys.has(key));
  if (unexpected.length > 0) {
    findings.push(result(
      "UNEXPECTED_CAPTURE_STATE", "blocker",
      `${unexpected.length} unapproved render states were supplied. First: ${unexpected[0]}`,
      "Art Bible §12"
    ));
  }
  const missing = expected.filter((state) =>
    !seen.has(stateKey(state.device, state))
  );
  if (missing.length > 0) {
    findings.push(result(
      "MATRIX_COVERAGE_INCOMPLETE", "blocker",
      `${missing.length} of ${expected.length} required states are missing. First: ${stateKey(missing[0]!.device, missing[0]!)}`,
      "Art Bible §12",
      { observed: `${expected.length - missing.length}/${expected.length}`, limit: `${expected.length}/${expected.length}` }
    ));
  }
  return findings;
}

export function checkCapture(
  capture: SceneCapture,
  cfg: GateConfig
): Finding[] {
  const findings: Finding[] = [];
  const where = `${capture.device} ${stateKey(capture.device, capture.state)}`;
  if (capture.drawCalls > cfg.scene.drawCalls.hard) {
    findings.push(result(
      "DRAW_CALLS_OVER_HARD", "blocker", `${capture.drawCalls} draw calls at ${where}.`,
      "Art Bible §10", { observed: capture.drawCalls, limit: cfg.scene.drawCalls.hard }
    ));
  } else if (
    cfg.scene.drawCalls.hard - capture.drawCalls <
    cfg.scene.drawCalls.minSpikeHeadroom
  ) {
    findings.push(result(
      "DRAW_CALL_HEADROOM_LOST", "warning",
      `Only ${cfg.scene.drawCalls.hard - capture.drawCalls} draw calls of spike headroom at ${where}.`,
      "Art Bible §10"
    ));
  }
  if (capture.triangles > cfg.scene.triangles.hard) {
    findings.push(result(
      "TRIANGLES_OVER_HARD", "blocker", `${capture.triangles} triangles at ${where}.`,
      "Art Bible §10", { observed: capture.triangles, limit: cfg.scene.triangles.hard }
    ));
  } else if (capture.triangles > cfg.scene.triangles.warning) {
    findings.push(result(
      "TRIANGLES_OVER_WARNING", "warning", `${capture.triangles} triangles at ${where}.`,
      "Art Bible §10"
    ));
  }
  if (capture.textureMemoryMB > cfg.scene.textureMemoryMB.hard) {
    findings.push(result(
      "TEXTURE_MEMORY_OVER_HARD", "blocker",
      `${capture.textureMemoryMB} MB resident art textures at ${where}.`,
      "Art Bible §10",
      { observed: capture.textureMemoryMB, limit: cfg.scene.textureMemoryMB.hard }
    ));
  } else if (capture.textureMemoryMB > cfg.scene.textureMemoryMB.warning) {
    findings.push(result(
      "TEXTURE_MEMORY_OVER_WARNING", "warning",
      `${capture.textureMemoryMB} MB resident art textures at ${where}.`,
      "Art Bible §10"
    ));
  }
  if (capture.activeMaterials >= cfg.scene.activeArtMaterials.hardMaxExclusive) {
    findings.push(result(
      "ACTIVE_MATERIALS_EXCEEDED", "blocker",
      `${capture.activeMaterials} active materials at ${where}.`,
      "Art Bible §10",
      { observed: capture.activeMaterials, limit: `< ${cfg.scene.activeArtMaterials.hardMaxExclusive}` }
    ));
  }
  if (capture.godRayMeshes > cfg.scene.godRayMeshes.hard) {
    findings.push(result(
      "GOD_RAY_CAP_EXCEEDED", "blocker",
      `${capture.godRayMeshes} god-ray instances at ${where}.`,
      "Art Bible §8 / §10",
      { observed: capture.godRayMeshes, limit: cfg.scene.godRayMeshes.hard }
    ));
  }

  const frameRatios = capture.frameContrastRatios.filter(Number.isFinite);
  if (frameRatios.length !== capture.frameContrastRatios.length || frameRatios.length === 0) {
    findings.push(result(
      "CONTRAST_NOT_SAMPLED", "blocker",
      `Frame contrast evidence is empty or invalid at ${where}.`,
      "Art Bible §12"
    ));
  } else if (frameRatios.length < cfg.contrast.minimumFrameSamples) {
    findings.push(result(
      "CONTRAST_SAMPLE_COVERAGE_INSUFFICIENT", "blocker",
      `Frame has only ${frameRatios.length} contrast samples at ${where}.`,
      "Art Bible §12",
      { observed: frameRatios.length, limit: cfg.contrast.minimumFrameSamples }
    ));
  } else {
    const value = percentile(frameRatios, cfg.contrast.framePercentile);
    if (value < cfg.contrast.frameMinRatio) {
      findings.push(result(
        "FRAME_CONTRAST_BELOW_FLOOR", "blocker",
        `Frame p${cfg.contrast.framePercentile} is ${value.toFixed(2)}:1 at ${where}.`,
        "Art Bible §12",
        { observed: Number(value.toFixed(2)), limit: cfg.contrast.frameMinRatio }
      ));
    }
  }

  if (capture.obstacles.length === 0) {
    findings.push(result(
      "NO_OBSTACLES_SAMPLED", "blocker",
      `No per-obstacle evidence at ${where}. Unmeasured cannot pass.`,
      "Art Bible §12"
    ));
  }
  for (const obstacle of capture.obstacles) {
    const ratios = obstacle.ratios.filter(Number.isFinite);
    if (ratios.length !== obstacle.ratios.length || ratios.length === 0) {
      findings.push(result(
        "OBSTACLE_CONTRAST_NOT_SAMPLED", "blocker",
        `${obstacle.obstacleId} has empty or invalid contrast evidence at ${where}.`,
        "Art Bible §12"
      ));
      continue;
    }
    if (ratios.length < cfg.contrast.minimumPerObstacleSamples) {
      findings.push(result(
        "OBSTACLE_SAMPLE_COVERAGE_INSUFFICIENT", "blocker",
        `${obstacle.obstacleId} has only ${ratios.length} contrast samples at ${where}.`,
        "Art Bible §12",
        { observed: ratios.length, limit: cfg.contrast.minimumPerObstacleSamples }
      ));
      continue;
    }
    const value = percentile(ratios, cfg.contrast.perObstaclePercentile);
    if (value < cfg.contrast.perObstacleMinRatio) {
      findings.push(result(
        "OBSTACLE_CONTRAST_BELOW_FLOOR", "blocker",
        `${obstacle.obstacleId} p${cfg.contrast.perObstaclePercentile} is ${value.toFixed(2)}:1 at ${where}.`,
        "Art Bible §12",
        { observed: Number(value.toFixed(2)), limit: cfg.contrast.perObstacleMinRatio }
      ));
    }
  }
  return findings;
}

export interface ReactionAnalysis {
  reactionDistanceWorldUnits: number;
  totalLeadTimeMs: number;
  decisionLod: number | null;
}

export function analyseReaction(cfg: GateConfig): ReactionAnalysis {
  const reactionDistanceWorldUnits =
    cfg.camera.forwardSpeedMax * cfg.camera.minReactionWindowMs / 1000;
  const totalLeadTimeMs =
    cfg.camera.visibleDistanceAhead / cfg.camera.forwardSpeedMax * 1000;
  const decision = cfg.lod.bands.find((band) =>
    reactionDistanceWorldUnits >= band.nearWorldUnits &&
    reactionDistanceWorldUnits < band.farWorldUnits
  );
  return {
    reactionDistanceWorldUnits,
    totalLeadTimeMs,
    decisionLod: decision?.level ?? null
  };
}

export function checkReaction(cfg: GateConfig): Finding[] {
  const findings: Finding[] = [];
  const analysis = analyseReaction(cfg);
  if (analysis.totalLeadTimeMs < cfg.camera.minReactionWindowMs) {
    findings.push(result(
      "LEAD_TIME_BELOW_MINIMUM", "blocker",
      "Visible distance does not provide the minimum reaction time at maximum momentum.",
      "Master prompt §1.3 / §4.5",
      { observed: Math.round(analysis.totalLeadTimeMs), limit: cfg.camera.minReactionWindowMs }
    ));
  }
  const bands = [...cfg.lod.bands].sort(
    (a, b) => a.nearWorldUnits - b.nearWorldUnits
  );
  for (let index = 1; index < bands.length; index++) {
    if (bands[index]!.nearWorldUnits !== bands[index - 1]!.farWorldUnits) {
      findings.push(result(
        "LOD_BANDS_NOT_CONTIGUOUS", "blocker",
        "LOD bands contain a gap or overlap.", "Art Bible §10"
      ));
    }
  }
  if (bands[0]?.nearWorldUnits !== 0) {
    findings.push(result(
      "LOD_BANDS_DO_NOT_START_AT_ZERO", "blocker",
      "LOD coverage does not begin at the camera.", "Art Bible §10"
    ));
  }
  if (
    !bands.at(-1) ||
    bands.at(-1)!.farWorldUnits < cfg.camera.visibleDistanceAhead
  ) {
    findings.push(result(
      "LOD_BANDS_DO_NOT_COVER_VIEW", "blocker",
      "LOD bands do not cover the full required view distance.", "Art Bible §10"
    ));
  }
  if (analysis.decisionLod === null) {
    findings.push(result(
      "DECISION_POINT_UNBANDED", "blocker",
      "The maximum-momentum decision point falls in no LOD band.",
      "Master prompt §1.3"
    ));
  } else if (analysis.decisionLod > 0) {
    findings.push(result(
      "DECISION_POINT_IN_SIMPLIFIED_LOD", "warning",
      `The player commits while reading LOD${analysis.decisionLod}; that LOD is fairness-critical.`,
      "Master prompt §1.3"
    ));
  }
  return findings;
}

function checkPerformanceEvidence(
  evidence: PerformanceEvidence,
  cfg: GateConfig["performance"]
): Finding[] {
  const findings: Finding[] = [];
  const maximums: Array<{
    key: keyof Pick<
      PerformanceEvidence,
      "coldStartMs" | "inputToVisibleMs" | "steadyStateHeapMB" | "soakHeapGrowthMB"
    >;
    limit: number;
    code: string;
  }> = [
    { key: "coldStartMs", limit: cfg.maxColdStartMs, code: "COLD_START_OVER_BUDGET" },
    { key: "inputToVisibleMs", limit: cfg.maxInputToVisibleMs, code: "INPUT_LATENCY_OVER_BUDGET" },
    { key: "steadyStateHeapMB", limit: cfg.maxSteadyStateHeapMB, code: "HEAP_OVER_BUDGET" },
    { key: "soakHeapGrowthMB", limit: cfg.maxSoakHeapGrowthMB, code: "HEAP_GROWTH_OVER_BUDGET" }
  ];
  if (evidence.medianFps < cfg.minMedianFps) {
    findings.push(result(
      "FPS_BELOW_FLOOR", "blocker", "Median frame rate is below the Phase 3 floor.",
      "Master prompt §4.6",
      { observed: evidence.medianFps, limit: cfg.minMedianFps }
    ));
  }
  for (const entry of maximums) {
    if (evidence[entry.key] > entry.limit) {
      findings.push(result(
        entry.code, "blocker", `${entry.key} exceeds its release budget.`,
        "Master prompt §4.3 / §4.6",
        { observed: evidence[entry.key], limit: entry.limit }
      ));
    }
  }
  for (const [pool, limit] of Object.entries(cfg.maxPools)) {
    const observed = evidence.peakPools[pool as keyof PerformanceEvidence["peakPools"]];
    if (observed > limit) {
      findings.push(result(
        "POOL_CAP_EXCEEDED", "blocker", `${pool} pool peak exceeds its hard cap.`,
        "Master prompt §4.3 / §4.6",
        { observed, limit }
      ));
    }
  }
  return findings;
}

export function checkTierSignoff(
  input: GateInput,
  tierName: string,
  tier: CaptureTierConfig,
  cfg: GateConfig
): Finding[] {
  const findings: Finding[] = [];
  if (
    tier.requiredSoakMinutes > 0 &&
    (input.soakMinutes === undefined || input.soakMinutes < tier.requiredSoakMinutes)
  ) {
    findings.push(result(
      "SIGNOFF_SOAK_INSUFFICIENT", "blocker",
      "Repeated spawn/dispose soak has not met the release duration.",
      "Art Bible §12",
      { observed: input.soakMinutes ?? "not run", limit: tier.requiredSoakMinutes }
    ));
  }
  if (tierName === "signoff") {
    if (!input.performanceEvidence) {
      findings.push(result(
        "PERFORMANCE_EVIDENCE_MISSING", "blocker",
        "Release sign-off requires FPS, load, input, heap and pool evidence.",
        "Master prompt §4.3 / §4.6"
      ));
    } else {
      findings.push(...checkPerformanceEvidence(input.performanceEvidence, cfg.performance));
    }
  }
  return findings;
}

export function checkPayload(
  input: GateInput,
  tier: CaptureTierConfig,
  cfg: GateConfig
): Finding[] {
  if (input.compressedArtPayloadMB === undefined) {
    return tier.requireCaptures
      ? [result(
        "PAYLOAD_NOT_MEASURED", "blocker",
        "Compressed art payload is required for capture tiers.",
        "Art Bible §10"
      )]
      : [];
  }
  if (input.compressedArtPayloadMB > cfg.scene.compressedArtPayloadMB.hard) {
    return [result(
      "PAYLOAD_OVER_HARD", "blocker",
      "Compressed art payload exceeds the approved mobile budget.",
      "Art Bible §10",
      {
        observed: input.compressedArtPayloadMB,
        limit: cfg.scene.compressedArtPayloadMB.hard
      }
    )];
  }
  return [];
}
