/**
 * Tuning config loading and validation.
 *
 * Part 2 requires all tuning live as versioned data, editable without a code
 * change. Part 5.1 requires a non-programmer be able to edit it. That makes
 * validation load-bearing: a typo in tuning.json must fail loudly at startup
 * with a message naming the key and its allowed range — never silently
 * produce unfair gameplay, which would be a Core Design Principle violation
 * arriving through the back door.
 */
import rawTuning from "../../config/tuning.json";

export interface TuningConfig {
  version: number;
  momentum: {
    gainRate: number;
    ceiling: number;
    collisionRetainFraction: number;
    collisionFloor: number;
    stunDurationSec: number;
    invulnerabilityDurationSec: number;
  };
  speed: {
    forwardAtZeroMomentum: number;
    forwardAtMaxMomentum: number;
    lateralAtZeroMomentum: number;
    lateralAtMaxMomentum: number;
  };
  lane: { halfWidth: number; creatureRadius: number };
  readability: {
    visibleAheadUnits: number;
    minReactionWindowMs: number;
    minSolvabilityMarginFraction: number;
    maxLaneTraversalFraction: number;
    inputLatencyBudgetMs: number;
    minObstacleContrastRatio: number;
  };
  scoring: {
    nearMissClearanceUnits: number;
    nearMissCooldownSec: number;
    multiplierStart: number;
    multiplierGainPerNearMiss: number;
    multiplierCap: number;
    multiplierDecayPerSec: number;
    multiplierDecayGraceSec: number;
    nearMissSlowMoDurationSec: number;
    nearMissSlowMoTimeScale: number;
  };
  light: {
    max: number;
    costPerCollision: number;
    regenPerSec: number;
    regenDelayAfterCollisionSec: number;
  };
  audio: {
    masterGain: number;
    ambientGain: number;
    cueGain: number;
    momentumResponseSec: number;
    currentLayerStartMomentum: number;
    shimmerLayerStartMomentum: number;
    maxVoices: number;
    updateRateHz: number;
  };
  visual: {
    causticScaleFloor: number;
    causticScaleWall: number;
    causticIntensityFloor: number;
    causticIntensityWall: number;
    causticSharpness: number;
    causticSpeed: number;
    causticMagentaShiftAtMaxMomentum: number;
    obstacleEdgeStrength: number;
    obstacleEdgeWidthPixels: number;
    fogNearMultiplier: number;
    fogFarMultiplier: number;
    bloomStrength: number;
    bloomRadius: number;
    bloomThreshold: number;
  };
  environment: {
    buildingCount: number;
    buildingBandSpacing: number;
    buildingMinHeight: number;
    buildingMaxHeight: number;
    buildingLateralMin: number;
    buildingLateralMax: number;
    buildingBrightness: number;
    godRayCount: number;
    godRayBandSpacing: number;
    godRayIntensity: number;
    godRayWidth: number;
    godRayHeight: number;
    coralCount: number;
    coralBandSpacing: number;
    coralPulseRadiusUnits: number;
    coralPulseDecayPerSec: number;
    coralBaseGlow: number;
    coralPulseGlow: number;
  };
  creature: {
    bodyLength: number;
    bodyHeight: number;
    finFlutterHzAtZeroMomentum: number;
    finFlutterHzAtMaxMomentum: number;
    finFlutterAmplitude: number;
    tailSwayAmplitude: number;
    bankAngleMaxRadians: number;
    bankSmoothingHalfLifeSec: number;
    breathHz: number;
    breathAmount: number;
    eyeOffsetX: number;
    eyeOffsetY: number;
    eyeOffsetZ: number;
    eyeRadius: number;
    eyeHueCalm: number;
    eyeHueCruise: number;
    eyeHueFast: number;
    eyeHueMax: number;
    eyeSpeedInfluence: number;
    eyeResponseHalfLifeSec: number;
    rimStrength: number;
    rimPower: number;
    bodyGlowAtZeroLight: number;
    bodyGlowAtFullLight: number;
  };
  trail: {
    segmentCount: number;
    sampleIntervalSec: number;
    widthAtZeroMomentum: number;
    widthAtMaxMomentum: number;
    brightnessAtZeroMomentum: number;
    brightnessAtMaxMomentum: number;
    heightOffset: number;
  };
  camera: {
    distanceBehindAtZeroMomentum: number;
    distanceBehindAtMaxMomentum: number;
    height: number;
    lookHeight: number;
    lookAheadUnits: number;
    fovAtZeroMomentum: number;
    fovAtMaxMomentum: number;
    lateralFollowFraction: number;
  };
  input: {
    sensitivity: number;
    smoothingHalfLifeSec: number;
    deadZone: number;
    dragRangeFraction: number;
  };
}

interface Rule {
  min: number;
  max: number;
  note: string;
}

/**
 * Allowed range for every numeric tunable, keyed by dotted path.
 * Ranges are "will not break the game", not "is well tuned" — they exist to
 * catch typos and unit mistakes, not to enforce good design taste.
 */
const RULES: Record<string, Rule> = {
  "momentum.gainRate": { min: 0.01, max: 2, note: "asymptotic approach rate per second" },
  "momentum.ceiling": { min: 0.1, max: 1, note: "max momentum; speeds are lerped against this" },
  "momentum.collisionRetainFraction": { min: 0, max: 0.95, note: "fraction of momentum kept on collision" },
  "momentum.collisionFloor": { min: 0, max: 0.9, note: "momentum never drops below this (Part 2.4: never zeroes)" },
  "momentum.stunDurationSec": { min: 0, max: 5, note: "seconds after collision with no momentum gain" },
  "momentum.invulnerabilityDurationSec": { min: 0, max: 5, note: "i-frames preventing collision cascade" },

  "speed.forwardAtZeroMomentum": { min: 1, max: 200, note: "world units/sec at momentum 0" },
  "speed.forwardAtMaxMomentum": { min: 1, max: 200, note: "world units/sec at ceiling" },
  "speed.lateralAtZeroMomentum": { min: 1, max: 200, note: "steering speed at momentum 0" },
  "speed.lateralAtMaxMomentum": { min: 1, max: 200, note: "steering speed at ceiling" },

  "lane.halfWidth": { min: 1, max: 50, note: "playable lateral range is +/- this" },
  "lane.creatureRadius": { min: 0.05, max: 5, note: "collision radius" },

  "readability.visibleAheadUnits": { min: 5, max: 500, note: "how far ahead obstacles are visible" },
  "readability.minReactionWindowMs": { min: 100, max: 5000, note: "Core Design Principle: minimum reaction time" },
  "readability.minSolvabilityMarginFraction": { min: 0, max: 0.9, note: "required slack in solvability check" },
  "readability.maxLaneTraversalFraction": { min: 0.1, max: 1, note: "max lane fraction a gate transition may demand" },
  "readability.minObstacleContrastRatio": { min: 1.5, max: 21, note: "Part 3.4 hard requirement: minimum WCAG contrast between obstacle silhouette and whatever is behind it, with all effects on" },
  "readability.inputLatencyBudgetMs": { min: 10, max: 500, note: "Part 4.6: input-to-visible-response budget" },

  "scoring.nearMissClearanceUnits": { min: 0.01, max: 20, note: "clearance under which a pass counts as a near-miss" },
  "scoring.nearMissCooldownSec": { min: 0, max: 10, note: "prevents one cluster farming multiplier stacks" },
  "scoring.multiplierStart": { min: 1, max: 10, note: "multiplier at run start" },
  "scoring.multiplierGainPerNearMiss": { min: 0, max: 5, note: "flat gain per near-miss" },
  "scoring.multiplierCap": { min: 1, max: 100, note: "ceiling on multiplier" },
  "scoring.multiplierDecayPerSec": { min: 0, max: 5, note: "decay once grace elapses" },
  "scoring.multiplierDecayGraceSec": { min: 0, max: 30, note: "seconds before decay begins" },
  "scoring.nearMissSlowMoDurationSec": { min: 0, max: 2, note: "length of the near-miss slow-mo beat" },
  "scoring.nearMissSlowMoTimeScale": { min: 0.1, max: 1, note: "time scale during slow-mo; 1 disables it" },

  "light.max": { min: 1, max: 1000, note: "starting/maximum light (the run-end resource)" },
  "light.costPerCollision": { min: 0.1, max: 1000, note: "light lost per collision" },
  "light.regenPerSec": { min: 0, max: 100, note: "light regained per second while clean" },
  "light.regenDelayAfterCollisionSec": { min: 0, max: 30, note: "pause before regen resumes" },

  "audio.masterGain": { min: 0, max: 1, note: "final Web Audio output gain" },
  "audio.ambientGain": { min: 0, max: 1, note: "shared gain budget for the persistent underwater layers" },
  "audio.cueGain": { min: 0, max: 1, note: "shared gain for near-miss, collision, milestone and recovery cues" },
  "audio.momentumResponseSec": { min: 0.01, max: 2, note: "smoothing time for momentum-driven audio layers" },
  "audio.currentLayerStartMomentum": { min: 0, max: 1, note: "normalized momentum where the moving-current layer begins" },
  "audio.shimmerLayerStartMomentum": { min: 0, max: 1, note: "normalized momentum where the harmonic shimmer begins" },
  "audio.maxVoices": { min: 4, max: 32, note: "hard cap for transient Web Audio sources" },
  "audio.updateRateHz": { min: 4, max: 30, note: "maximum continuous-mix automation updates per second" },

  "visual.causticScaleFloor": { min: 0.05, max: 8, note: "caustic cycles per world unit on the floor" },
  "visual.causticScaleWall": { min: 0.05, max: 8, note: "caustic cycles per world unit on obstacle faces" },
  "visual.causticIntensityFloor": { min: 0, max: 6, note: "floor caustic brightness" },
  "visual.causticIntensityWall": { min: 0, max: 6, note: "obstacle caustic brightness; additive only, never darkens (Part 3.4)" },
  "visual.causticSharpness": { min: 1, max: 12, note: "higher = tighter, brighter bands with more dark between" },
  "visual.causticSpeed": { min: 0, max: 5, note: "animation rate" },
  "visual.causticMagentaShiftAtMaxMomentum": { min: 0, max: 1, note: "how far obstacle caustics shift cyan->magenta at ceiling (Part 3.4 palette range)" },
  "visual.obstacleEdgeStrength": { min: 0, max: 8, note: "brightness of the lit border on obstacle faces — this is what guarantees the Part 3.4 contrast floor" },
  "visual.obstacleEdgeWidthPixels": { min: 1, max: 40, note: "border thickness in SCREEN pixels — constant regardless of wall size or distance, which a UV-space width is not" },
  "visual.fogNearMultiplier": { min: 1.1, max: 6, note: "fog start as a multiple of visibleAheadUnits — MUST exceed (visibleAhead + camera distance) or fog erases obstacles inside the reaction window" },
  "visual.fogFarMultiplier": { min: 1.2, max: 10, note: "fog end as a multiple of visibleAheadUnits" },
  "visual.bloomStrength": { min: 0, max: 4, note: "bloom intensity; this is what makes emissive read as glowing" },
  "visual.bloomRadius": { min: 0, max: 2, note: "bloom spread" },
  "visual.bloomThreshold": { min: 0, max: 2, note: "luminance above which pixels bloom" },
  "environment.buildingCount": { min: 0, max: 200, note: "instanced, so this is 1 draw call regardless" },
  "environment.buildingBandSpacing": { min: 4, max: 200, note: "distance between building bands" },
  "environment.buildingMinHeight": { min: 0.5, max: 200, note: "shortest ruin" },
  "environment.buildingMaxHeight": { min: 0.5, max: 300, note: "tallest ruin" },
  "environment.buildingLateralMin": { min: 0, max: 200, note: "nearest a ruin may sit to the lane centre — must clear the lane or it becomes an obstacle the player cannot hit" },
  "environment.buildingLateralMax": { min: 0, max: 400, note: "furthest ruin" },
  "environment.buildingBrightness": { min: 0, max: 2, note: "kept low: background must never compete with obstacle silhouettes (Part 3.4)" },
  "environment.godRayCount": { min: 0, max: 40, note: "Part 3.2 asks for sparse and selective, not everywhere" },
  "environment.godRayBandSpacing": { min: 10, max: 500, note: "distance between shafts; large keeps them rare" },
  "environment.godRayIntensity": { min: 0, max: 2, note: "additive, so this can only brighten — never darkens an obstacle" },
  "environment.godRayWidth": { min: 0.5, max: 60, note: "shaft width" },
  "environment.godRayHeight": { min: 1, max: 120, note: "shaft height" },
  "environment.coralCount": { min: 0, max: 400, note: "instanced" },
  "environment.coralBandSpacing": { min: 1, max: 100, note: "distance between coral clusters" },
  "environment.coralPulseRadiusUnits": { min: 0.5, max: 60, note: "how close the creature must pass to trigger a pulse (Part 3.2 priority 5)" },
  "environment.coralPulseDecayPerSec": { min: 0.1, max: 20, note: "how fast a pulse fades" },
  "environment.coralBaseGlow": { min: 0, max: 3, note: "resting brightness" },
  "environment.coralPulseGlow": { min: 0, max: 8, note: "peak brightness when the creature passes" },
  "creature.bodyLength": { min: 0.5, max: 3, note: "body z scale; longer reads faster" },
  "creature.bodyHeight": { min: 0.3, max: 2, note: "body y scale; lower reads pudgier" },
  "creature.finFlutterHzAtZeroMomentum": { min: 0, max: 20, note: "fin beat rate at rest" },
  "creature.finFlutterHzAtMaxMomentum": { min: 0, max: 30, note: "fin beat rate at ceiling" },
  "creature.finFlutterAmplitude": { min: 0, max: 1.5, note: "fin beat angle, radians" },
  "creature.tailSwayAmplitude": { min: 0, max: 1.5, note: "tail sway angle, radians" },
  "creature.bankAngleMaxRadians": { min: 0, max: 1.2, note: "roll into a turn; reads as intent and helps the player see their own steering" },
  "creature.bankSmoothingHalfLifeSec": { min: 0, max: 0.4, note: "bank easing; too high and the creature lags the input the player gave" },
  "creature.breathHz": { min: 0, max: 5, note: "idle squash-and-stretch rate" },
  "creature.breathAmount": { min: 0, max: 0.4, note: "idle squash-and-stretch depth" },
  "creature.eyeOffsetX": { min: 0, max: 2, note: "lateral front-crown eye offset; eyes stay inside the external-gill fans" },
  "creature.eyeOffsetY": { min: -1, max: 2, note: "front-crown eye height; eyes sit above the body centre and clear of the gills" },
  "creature.eyeOffsetZ": { min: -2, max: 2, note: "eye depth offset; negative values place the eyes on the obstacle-facing front hemisphere" },
  "creature.eyeRadius": { min: 0.05, max: 1, note: "eye size as a multiple of creatureRadius" },
  "creature.eyeHueCalm": { min: 0, max: 1, note: "eye hue at rest (Part 3.1: calm blue)" },
  "creature.eyeHueCruise": { min: 0, max: 1, note: "eye hue at cruise speed (luminous cyan)" },
  "creature.eyeHueFast": { min: 0, max: 1, note: "eye hue at high speed (violet)" },
  "creature.eyeHueMax": { min: 0, max: 1, note: "eye hue at ceiling (Part 3.1: rose-violet)" },
  "creature.eyeSpeedInfluence": { min: 0, max: 1, note: "share of the eye-colour response driven by normalized forward speed" },
  "creature.eyeResponseHalfLifeSec": { min: 0, max: 1, note: "eye-colour smoothing half-life; prevents hue flicker without hiding acceleration" },
  "creature.rimStrength": { min: 0, max: 5, note: "fresnel rim; sells glowing from within (Part 3.2 priority 4)" },
  "creature.rimPower": { min: 0.5, max: 8, note: "rim tightness" },
  "creature.bodyGlowAtZeroLight": { min: 0, max: 3, note: "body brightness when light is depleted — dimming IS the danger signal (ADR-0006)" },
  "creature.bodyGlowAtFullLight": { min: 0, max: 4, note: "body brightness at full light" },
  "trail.segmentCount": { min: 4, max: 96, note: "ribbon segments; capped by budgets.pools.maxTrailSegments" },
  "trail.sampleIntervalSec": { min: 0.004, max: 0.2, note: "how often a ribbon point is recorded" },
  "trail.widthAtZeroMomentum": { min: 0.01, max: 6, note: "ribbon width at rest" },
  "trail.widthAtMaxMomentum": { min: 0.01, max: 6, note: "ribbon width at ceiling (Part 3.2)" },
  "trail.brightnessAtZeroMomentum": { min: 0, max: 8, note: "ribbon brightness at rest" },
  "trail.brightnessAtMaxMomentum": { min: 0, max: 8, note: "ribbon brightness at ceiling" },
  "trail.heightOffset": { min: -3, max: 3, note: "ribbon height relative to the creature" },
  "camera.distanceBehindAtZeroMomentum": { min: 1, max: 60, note: "camera distance behind the creature at rest" },
  "camera.distanceBehindAtMaxMomentum": { min: 1, max: 60, note: "camera pulls back with momentum (Part 2.2)" },
  "camera.height": { min: 0.5, max: 40, note: "camera height above the lane" },
  "camera.lookHeight": { min: 0, max: 20, note: "height of the camera's look target" },
  "camera.lookAheadUnits": { min: 1, max: 200, note: "how far ahead the camera aims" },
  "camera.fovAtZeroMomentum": { min: 30, max: 110, note: "vertical FOV at rest" },
  "camera.fovAtMaxMomentum": { min: 30, max: 110, note: "FOV widens with momentum to sell speed" },
  "camera.lateralFollowFraction": { min: 0, max: 1, note: "0 = camera fixed laterally, 1 = fully follows creature" },
  "input.sensitivity": { min: 0.05, max: 10, note: "steering responsiveness multiplier" },
  "input.smoothingHalfLifeSec": { min: 0, max: 0.5, note: "smoothing; higher adds latency (Part 2.1 warns against)" },
  "input.deadZone": { min: 0, max: 0.5, note: "ignore steering magnitudes below this" },
  "input.dragRangeFraction": { min: 0.05, max: 1, note: "fraction of screen width dragged for full deflection" }
};

function valueAt(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in acc) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

/**
 * Validate a raw config object. Collects *all* problems before throwing, so a
 * designer fixing tuning.json sees every mistake at once rather than
 * discovering them one reload at a time.
 */
export function validateTuning(raw: unknown): TuningConfig {
  const problems: string[] = [];

  for (const [path, rule] of Object.entries(RULES)) {
    const value = valueAt(raw, path);
    if (typeof value !== "number" || !Number.isFinite(value)) {
      problems.push(`${path}: missing or not a finite number (${rule.note})`);
      continue;
    }
    if (value < rule.min || value > rule.max) {
      problems.push(
        `${path}: ${value} is outside allowed range ${rule.min}..${rule.max} (${rule.note})`
      );
    }
  }

  // Cross-field invariants — individually valid values that are nonsense together.
  const speedMin = valueAt(raw, "speed.forwardAtZeroMomentum");
  const speedMax = valueAt(raw, "speed.forwardAtMaxMomentum");
  if (typeof speedMin === "number" && typeof speedMax === "number" && speedMin > speedMax) {
    problems.push("speed.forwardAtZeroMomentum must not exceed speed.forwardAtMaxMomentum");
  }

  const floor = valueAt(raw, "momentum.collisionFloor");
  const ceiling = valueAt(raw, "momentum.ceiling");
  if (typeof floor === "number" && typeof ceiling === "number" && floor >= ceiling) {
    problems.push("momentum.collisionFloor must be below momentum.ceiling");
  }

  const radius = valueAt(raw, "lane.creatureRadius");
  const halfWidth = valueAt(raw, "lane.halfWidth");
  if (typeof radius === "number" && typeof halfWidth === "number" && radius >= halfWidth) {
    problems.push("lane.creatureRadius must be smaller than lane.halfWidth");
  }

  const multStart = valueAt(raw, "scoring.multiplierStart");
  const multCap = valueAt(raw, "scoring.multiplierCap");
  if (typeof multStart === "number" && typeof multCap === "number" && multStart > multCap) {
    problems.push("scoring.multiplierStart must not exceed scoring.multiplierCap");
  }

  const lightCost = valueAt(raw, "light.costPerCollision");
  const lightMax = valueAt(raw, "light.max");
  if (typeof lightCost === "number" && typeof lightMax === "number" && lightCost > lightMax) {
    problems.push("light.costPerCollision must not exceed light.max (one hit would end the run)");
  }

  const currentLayerStart = valueAt(raw, "audio.currentLayerStartMomentum");
  const shimmerLayerStart = valueAt(raw, "audio.shimmerLayerStartMomentum");
  if (
    typeof currentLayerStart === "number" &&
    typeof shimmerLayerStart === "number" &&
    currentLayerStart >= shimmerLayerStart
  ) {
    problems.push(
      "audio.currentLayerStartMomentum must be below audio.shimmerLayerStartMomentum"
    );
  }

  const maxVoices = valueAt(raw, "audio.maxVoices");
  if (typeof maxVoices === "number" && !Number.isInteger(maxVoices)) {
    problems.push("audio.maxVoices must be a whole number");
  }

  const audioMasterGain = valueAt(raw, "audio.masterGain");
  const audioAmbientGain = valueAt(raw, "audio.ambientGain");
  if (
    typeof audioMasterGain === "number" &&
    typeof audioAmbientGain === "number" &&
    audioMasterGain * audioAmbientGain * 0.46 < 0.075
  ) {
    problems.push(
      "audio masterGain × ambientGain is below the phone-speaker calm-bed floor"
    );
  }

  const audioCueGain = valueAt(raw, "audio.cueGain");
  if (
    typeof audioMasterGain === "number" &&
    typeof audioCueGain === "number" &&
    audioMasterGain * audioCueGain < 0.22
  ) {
    problems.push(
      "audio masterGain × cueGain is below the phone-speaker cue floor"
    );
  }

  if (problems.length > 0) {
    throw new Error(
      `Invalid tuning config (${problems.length} problem${problems.length === 1 ? "" : "s"}):\n  - ` +
        problems.join("\n  - ")
    );
  }

  return raw as TuningConfig;
}

/** The validated, active tuning config. Throws at import time if invalid. */
export const tuning: TuningConfig = validateTuning(rawTuning);
