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

/**
 * Hero-merfolk checks are deliberately separate from generic ambient life.
 * A triangle-valid silhouette cannot satisfy this contract without a readable
 * face, articulated character parts and deterministic character behaviours.
 */
export function checkMerfolk(
  asset: AssetManifest,
  cfg: GateConfig["merfolk"]
): Finding[] {
  if (asset.family !== "heroMerfolk") return [];
  const findings: Finding[] = [];
  const missing = (code: string, message: string) => findings.push(result(
    code,
    "blocker",
    message,
    "Phase 3B Merfolk Character Pass",
    { asset: asset.name }
  ));

  if (asset.recognitionLabel !== cfg.requiredRecognitionLabel) {
    missing(
      "MERFOLK_RECOGNITION_LABEL_MISSING",
      `Hero must be explicitly recognizable as "${cfg.requiredRecognitionLabel}".`
    );
  }
  const castRoles = asset.castRoles ?? [];
  const missingCastRoles = cfg.requiredGuardianRoles.filter(
    (role) => !castRoles.includes(role)
  );
  if (missingCastRoles.length > 0) {
    missing(
      "MERFOLK_GUARDIAN_ROLES_MISSING",
      `Missing district guardian roles: ${missingCastRoles.join(", ")}.`
    );
  }
  const populationRoles = asset.populationRoles ?? [];
  const missingPopulationRoles = cfg.requiredPopulationRoles.filter(
    (role) => !populationRoles.includes(role)
  );
  if (missingPopulationRoles.length > 0) {
    missing(
      "MERFOLK_POPULATION_ROLES_MISSING",
      `Missing inhabited-city roles: ${missingPopulationRoles.join(", ")}.`
    );
  }
  if (asset.readableHeightPixels === undefined) {
    missing(
      "MERFOLK_PHONE_HEIGHT_NOT_MEASURED",
      "Hero manifest omits portrait gameplay height evidence."
    );
  } else if (asset.readableHeightPixels < cfg.minimumReadableHeightPixels) {
    findings.push(result(
      "MERFOLK_PHONE_HEIGHT_BELOW_FLOOR",
      "blocker",
      "Hero is too small to read as a character in portrait gameplay.",
      "Phase 3B Merfolk Character Pass",
      {
        asset: asset.name,
        observed: asset.readableHeightPixels,
        limit: cfg.minimumReadableHeightPixels
      }
    ));
  }
  if (asset.readableFaceHeightPixels === undefined) {
    missing(
      "MERFOLK_FACE_HEIGHT_NOT_MEASURED",
      "Hero manifest omits portrait face-height evidence."
    );
  } else if (
    asset.readableFaceHeightPixels < cfg.minimumFaceHeightPixels
  ) {
    findings.push(result(
      "MERFOLK_FACE_HEIGHT_BELOW_FLOOR",
      "blocker",
      "Hero face is too small to remain legible in portrait gameplay.",
      "Phase 3B Merfolk Character Pass",
      {
        asset: asset.name,
        observed: asset.readableFaceHeightPixels,
        limit: cfg.minimumFaceHeightPixels
      }
    ));
  }
  if (asset.readableEyeDiameterPixels === undefined) {
    missing(
      "MERFOLK_EYE_SIZE_NOT_MEASURED",
      "Hero manifest omits portrait eye-size evidence."
    );
  } else if (
    asset.readableEyeDiameterPixels < cfg.minimumEyeDiameterPixels
  ) {
    findings.push(result(
      "MERFOLK_EYE_SIZE_BELOW_FLOOR",
      "blocker",
      "Hero eyes are too small to remain distinct from the face and hair.",
      "Phase 3B Merfolk Character Pass",
      {
        asset: asset.name,
        observed: asset.readableEyeDiameterPixels,
        limit: cfg.minimumEyeDiameterPixels
      }
    ));
  }
  if (asset.articulatedJoints === undefined) {
    missing(
      "MERFOLK_JOINT_COUNT_NOT_MEASURED",
      "Hero manifest omits articulated-joint evidence."
    );
  } else if (
    asset.articulatedJoints <= 0 ||
    asset.articulatedJoints > cfg.maxArticulatedJoints
  ) {
    findings.push(result(
      "MERFOLK_JOINT_COUNT_OUTSIDE_BUDGET",
      "blocker",
      "Hero joint count is invalid or exceeds the mobile budget.",
      "Phase 3B Merfolk Character Pass",
      {
        asset: asset.name,
        observed: asset.articulatedJoints,
        limit: cfg.maxArticulatedJoints
      }
    ));
  }
  if (asset.materials > cfg.maxMaterials) {
    findings.push(result(
      "MERFOLK_MATERIAL_COUNT_EXCEEDED",
      "blocker",
      "Hero uses more materials than the shared Moon-Garden budget allows.",
      "Phase 3B Merfolk Character Pass",
      {
        asset: asset.name,
        observed: asset.materials,
        limit: cfg.maxMaterials
      }
    ));
  }

  const parts = asset.parts ?? [];
  const missingParts = cfg.requiredParts.filter((part) => !parts.includes(part));
  if (missingParts.length > 0) {
    missing(
      "MERFOLK_CHARACTER_PARTS_MISSING",
      `Missing hero parts: ${missingParts.join(", ")}.`
    );
  }
  const clips = asset.clips ?? [];
  const missingClips = cfg.requiredClips.filter((clip) => !clips.includes(clip));
  if (missingClips.length > 0) {
    missing(
      "MERFOLK_ANIMATION_CLIPS_MISSING",
      `Missing hero behaviours: ${missingClips.join(", ")}.`
    );
  }
  const states = asset.observedStates ?? [];
  const missingStates = cfg.requiredStates.filter((state) => !states.includes(state));
  if (missingStates.length > 0) {
    missing(
      "MERFOLK_ANIMATION_STATES_MISSING",
      `Missing observed hero states: ${missingStates.join(", ")}.`
    );
  }
  if (asset.animationDriver !== cfg.animationDriver) {
    missing(
      "MERFOLK_ANIMATION_DRIVER_MISMATCH",
      "Hero animation must be driven by deterministic simulation state."
    );
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

/**
 * Structural premium-world gate. Performance can remain green while authored
 * districts, reef species or inhabitants disappear; this contract makes that
 * regression a release blocker instead of a subjective review note.
 */
export function checkWorldQuality(
  input: GateInput,
  cfg: GateConfig["worldQuality"]
): Finding[] {
  const findings: Finding[] = [];
  const categories = [
    ["gate family", input.worldQuality.gateFamilies, cfg.requiredGateFamilies],
    ["architecture", input.worldQuality.architecture, cfg.requiredArchitecture],
    ["reef", input.worldQuality.reef, cfg.requiredReef],
    ["ambient life", input.worldQuality.life, cfg.requiredLife],
    ["prop", input.worldQuality.props, cfg.requiredProps],
    ["material role", input.worldQuality.materials, cfg.requiredMaterials]
  ] as const;
  for (const [label, observed, required] of categories) {
    const available = new Set(observed);
    for (const signature of required) {
      if (available.has(signature)) continue;
      findings.push(result(
        "PREMIUM_WORLD_FAMILY_MISSING",
        "blocker",
        `Required ${label} "${signature}" is absent from production evidence.`,
        "Phase 3B premium world contract",
        { observed: observed.length, limit: required.length }
      ));
    }
  }

  const minimums = [
    [
      "visible gate families",
      new Set(input.worldQuality.gateFamilies).size,
      cfg.minimumDistinctVisibleGateFamilies
    ],
    [
      "reef families",
      new Set(input.worldQuality.reef).size,
      cfg.minimumDistinctReefFamilies
    ],
    [
      "ambient-life families",
      new Set(input.worldQuality.life).size,
      cfg.minimumAmbientLifeFamilies
    ],
    [
      "prop families",
      new Set(input.worldQuality.props).size,
      cfg.minimumPropFamilies
    ]
  ] as const;
  for (const [label, observed, minimum] of minimums) {
    if (observed >= minimum) continue;
    findings.push(result(
      "PREMIUM_WORLD_DIVERSITY_BELOW_FLOOR",
      "blocker",
      `${label} provide ${observed} distinct signatures; at least ${minimum} are required.`,
      "Phase 3B premium world contract",
      { observed, limit: minimum }
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

export function checkMerfolkVisualReviews(
  captures: SceneCapture[],
  cfg: GateConfig["merfolk"],
  required: boolean
): Finding[] {
  if (!required) return [];
  const findings: Finding[] = [];
  const reviews = captures
    .map((capture) => capture.merfolkVisualReview)
    .filter((review) => review !== undefined);
  const fail = (
    code: string,
    message: string,
    observed?: number | string,
    limit?: number | string
  ) => findings.push(result(
    code,
    "blocker",
    message,
    "Phase 3B Merfolk rendered-identity contract",
    { observed, limit }
  ));

  if (reviews.length === 0) {
    fail(
      "MERFOLK_VISUAL_REVIEW_MISSING",
      "No role-specific pixel-mask evidence was captured from the chase camera."
    );
    return findings;
  }

  for (const role of cfg.requiredGuardianRoles) {
    if (!reviews.some((review) => review.guardianRole === role)) {
      fail(
        "MERFOLK_GUARDIAN_NOT_RENDERED",
        `${role} never appears in the rendered cast review.`
      );
    }
  }

  for (const review of reviews) {
    const label = review.guardianRole;
    const guardian = review.guardian;
    if (guardian.heightPixels < cfg.minimumReadableHeightPixels) {
      fail(
        "MERFOLK_RENDERED_HEIGHT_BELOW_FLOOR",
        `${label} is only ${guardian.heightPixels}px tall in the visible mask.`,
        guardian.heightPixels,
        cfg.minimumReadableHeightPixels
      );
    }
    if (guardian.visiblePixels < cfg.minimumGuardianVisiblePixels) {
      fail(
        "MERFOLK_RENDERED_AREA_BELOW_FLOOR",
        `${label} does not retain enough visible silhouette area on a phone.`,
        guardian.visiblePixels,
        cfg.minimumGuardianVisiblePixels
      );
    }
    if (review.face.heightPixels < cfg.minimumFaceHeightPixels) {
      fail(
        "MERFOLK_RENDERED_FACE_BELOW_FLOOR",
        `${label}'s actually visible face is too small.`,
        review.face.heightPixels,
        cfg.minimumFaceHeightPixels
      );
    }
    if (review.eyes.heightPixels < cfg.minimumEyeDiameterPixels) {
      fail(
        "MERFOLK_RENDERED_EYES_BELOW_FLOOR",
        `${label}'s eyes disappear in the rendered mask.`,
        review.eyes.heightPixels,
        cfg.minimumEyeDiameterPixels
      );
    }
    const identitySpan = Math.max(
      review.identity.widthPixels,
      review.identity.heightPixels
    );
    if (identitySpan < cfg.minimumGuardianIdentitySpanPixels) {
      fail(
        "MERFOLK_IDENTITY_REGALIA_BELOW_FLOOR",
        `${label}'s district identity feature is not large enough to distinguish.`,
        identitySpan,
        cfg.minimumGuardianIdentitySpanPixels
      );
    }
    if (guardian.occlusionFraction > cfg.maximumGuardianOcclusionFraction) {
      fail(
        "MERFOLK_GUARDIAN_OCCLUDED",
        `${label} loses ${(guardian.occlusionFraction * 100).toFixed(1)}% of its silhouette behind the city.`,
        guardian.occlusionFraction,
        cfg.maximumGuardianOcclusionFraction
      );
    }
    if (guardian.edgeClearancePixels < cfg.minimumGuardianEdgeClearancePixels) {
      fail(
        "MERFOLK_GUARDIAN_FRAME_CLIPPED",
        `${label} is clipped or too close to the portrait-frame edge.`,
        guardian.edgeClearancePixels,
        cfg.minimumGuardianEdgeClearancePixels
      );
    }

    for (const role of cfg.requiredPopulationRoles) {
      const population = review.population.find((entry) => entry.role === role);
      if (!population) {
        fail(
          "MERFOLK_POPULATION_NOT_RENDERED",
          `${role} has no role-specific rendered evidence beside ${label}.`
        );
        continue;
      }
      const component = population.component;
      const minimumSpan = role === "current-swimmer"
        ? cfg.minimumSwimmerWidthPixels
        : role === "conch-herald"
          ? cfg.minimumHeraldHeightPixels
          : cfg.minimumCitizenHeightPixels;
      const observedSpan = role === "current-swimmer"
        ? component.widthPixels
        : component.heightPixels;
      const minimumPixels = role === "current-swimmer"
        ? cfg.minimumSwimmerVisiblePixels
        : role === "conch-herald"
          ? cfg.minimumHeraldVisiblePixels
          : cfg.minimumCitizenVisiblePixels;
      if (observedSpan < minimumSpan) {
        fail(
          "MERFOLK_POPULATION_SPAN_BELOW_FLOOR",
          `${role} is not large enough to identify in the ${label} frame.`,
          observedSpan,
          minimumSpan
        );
      }
      if (component.visiblePixels < minimumPixels) {
        fail(
          "MERFOLK_POPULATION_AREA_BELOW_FLOOR",
          `${role} collapses into a phone-scale speck in the ${label} frame.`,
          component.visiblePixels,
          minimumPixels
        );
      }
      if (
        component.occlusionFraction >
        cfg.maximumPopulationOcclusionFraction
      ) {
        fail(
          "MERFOLK_POPULATION_OCCLUDED",
          `${role} is materially hidden by architecture in the ${label} frame.`,
          component.occlusionFraction,
          cfg.maximumPopulationOcclusionFraction
        );
      }
      if (population.face.heightPixels < cfg.minimumPopulationFaceHeightPixels) {
        fail(
          "MERFOLK_POPULATION_FACE_BELOW_FLOOR",
          `${role} still has no phone-readable facial plane in the ${label} frame.`,
          population.face.heightPixels,
          cfg.minimumPopulationFaceHeightPixels
        );
      }
      if (population.eyes.heightPixels < cfg.minimumPopulationEyeHeightPixels) {
        fail(
          "MERFOLK_POPULATION_EYES_BELOW_FLOOR",
          `${role} eyes disappear or merge into the face in the ${label} frame.`,
          population.eyes.heightPixels,
          cfg.minimumPopulationEyeHeightPixels
        );
      }
      if (
        population.instances.length <
        cfg.minimumPopulationInstancesPerRole
      ) {
        fail(
          "MERFOLK_POPULATION_INSTANCE_COUNT_BELOW_FLOOR",
          `${role} has only ${population.instances.length} separately readable figures beside ${label}.`,
          population.instances.length,
          cfg.minimumPopulationInstancesPerRole
        );
      }
      for (const [index, instance] of population.instances.entries()) {
        const aspect = role === "current-swimmer"
          ? instance.widthPixels / Math.max(1, instance.heightPixels)
          : instance.heightPixels / Math.max(1, instance.widthPixels);
        const aspectFloor = role === "current-swimmer"
          ? cfg.minimumSwimmerHorizontalAspectRatio
          : cfg.minimumUprightAspectRatio;
        if (aspect < aspectFloor) {
          fail(
            role === "current-swimmer"
              ? "MERFOLK_SWIMMER_POSE_NOT_HORIZONTAL"
              : "MERFOLK_RESIDENT_POSE_NOT_UPRIGHT",
            `${role} instance ${index + 1} has the wrong portrait pose beside ${label}.`,
            aspect,
            aspectFloor
          );
        }
      }
    }

    const motion = review.motion;
    if (Math.abs(
      motion.sampleIntervalSec - cfg.motionSampleIntervalSec
    ) > 0.001) {
      fail(
        "MERFOLK_MOTION_INTERVAL_INVALID",
        `${label} motion evidence used the wrong sampling interval.`,
        motion.sampleIntervalSec,
        cfg.motionSampleIntervalSec
      );
    }
    if (
      motion.swimmerStart.length < cfg.minimumPopulationInstancesPerRole ||
      motion.swimmerEnd.length < cfg.minimumPopulationInstancesPerRole
    ) {
      fail(
        "MERFOLK_SWIMMER_TIMELAPSE_INCOMPLETE",
        `${label} does not retain two identifiable swimmers across the motion sample.`
      );
    }
    for (const separation of motion.swimmerCentreSeparationPixels) {
      if (separation < cfg.minimumSwimmerCentreSeparationPixels) {
        fail(
          "MERFOLK_SWIMMERS_STACKED",
          `${label} swimmers are staged too close together and read as a body stack.`,
          separation,
          cfg.minimumSwimmerCentreSeparationPixels
        );
      }
    }
    for (const overlap of motion.swimmerBoxOverlapFraction) {
      if (overlap > cfg.maximumSwimmerBoxOverlapFraction) {
        fail(
          "MERFOLK_SWIMMERS_OVERLAP",
          `${label} swimmers overlap one another in the portrait frame.`,
          overlap,
          cfg.maximumSwimmerBoxOverlapFraction
        );
      }
    }
    if (motion.swimmerTravelPixels.length < 2) {
      fail(
        "MERFOLK_SWIMMER_MOTION_MISSING",
        `${label} lacks two independently tracked swimmer paths.`
      );
    } else {
      for (const [index, travel] of motion.swimmerTravelPixels.entries()) {
        if (travel < cfg.minimumSwimmerTravelPixels) {
          fail(
            "MERFOLK_SWIMMER_FROZEN",
            `${label} swimmer ${index + 1} moves only ${travel.toFixed(1)}px.`,
            travel,
            cfg.minimumSwimmerTravelPixels
          );
        }
      }
      if (
        Math.abs(
          (motion.swimmerTravelPixels[0] ?? 0) -
          (motion.swimmerTravelPixels[1] ?? 0)
        ) < cfg.minimumSwimmerTravelDifferencePixels
      ) {
        fail(
          "MERFOLK_SWIMMER_MOTION_SYNCHRONIZED",
          `${label} swimmers use visibly identical travel rather than independent paths.`,
          Math.abs(
            (motion.swimmerTravelPixels[0] ?? 0) -
            (motion.swimmerTravelPixels[1] ?? 0)
          ),
          cfg.minimumSwimmerTravelDifferencePixels
        );
      }
    }
    if (
      motion.heraldTravelPixels.length <
      cfg.minimumPopulationInstancesPerRole
    ) {
      fail(
        "MERFOLK_UPRIGHT_TIMELAPSE_INCOMPLETE",
        `${label} lacks the paired upright herald anchors.`
      );
    }
    for (const travel of motion.heraldTravelPixels) {
      if (travel > cfg.maximumAnchoredTravelPixels) {
        fail(
          "MERFOLK_UPRIGHT_RESIDENT_DRIFT",
          `${label} ceremonial residents drift instead of remaining vertically anchored.`,
          travel,
          cfg.maximumAnchoredTravelPixels
        );
      }
    }
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
  if (
    capture.heroMerfolkHeightPixels <
    cfg.merfolk.minimumReadableHeightPixels
  ) {
    findings.push(result(
      "MERFOLK_PHONE_HEIGHT_BELOW_FLOOR",
      "blocker",
      `Hero merfolk is ${capture.heroMerfolkHeightPixels.toFixed(1)}px tall at ${where}.`,
      "Phase 3B Merfolk Character Pass",
      {
        observed: capture.heroMerfolkHeightPixels,
        limit: cfg.merfolk.minimumReadableHeightPixels
      }
    ));
  }
  if (
    capture.heroMerfolkFaceHeightPixels <
    cfg.merfolk.minimumFaceHeightPixels
  ) {
    findings.push(result(
      "MERFOLK_FACE_HEIGHT_BELOW_FLOOR",
      "blocker",
      `Hero face is ${capture.heroMerfolkFaceHeightPixels.toFixed(1)}px tall at ${where}.`,
      "Phase 3B Merfolk Character Pass",
      {
        observed: capture.heroMerfolkFaceHeightPixels,
        limit: cfg.merfolk.minimumFaceHeightPixels
      }
    ));
  }
  if (
    capture.heroMerfolkEyeDiameterPixels <
    cfg.merfolk.minimumEyeDiameterPixels
  ) {
    findings.push(result(
      "MERFOLK_EYE_SIZE_BELOW_FLOOR",
      "blocker",
      `Hero eyes are ${capture.heroMerfolkEyeDiameterPixels.toFixed(1)}px tall at ${where}.`,
      "Phase 3B Merfolk Character Pass",
      {
        observed: capture.heroMerfolkEyeDiameterPixels,
        limit: cfg.merfolk.minimumEyeDiameterPixels
      }
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
