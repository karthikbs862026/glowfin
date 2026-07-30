/**
 * Shared Phase 3A art-gate contracts.
 *
 * These types intentionally have no runtime dependencies. The validator runs
 * before npm install in CI and consumes evidence emitted independently by the
 * game runtime and the art pipeline.
 */

export type Severity = "blocker" | "warning" | "info";

export interface Finding {
  code: string;
  severity: Severity;
  message: string;
  rule: string;
  asset?: string;
  lod?: number;
  observed?: number | string;
  limit?: number | string;
}

export type AssetFamily =
  | "glowfin"
  | "brokenTower"
  | "collapsedArchPair"
  | "spire"
  | "wallFragment"
  | "heroCoral"
  | "mediumCoral"
  | "smallProp"
  | "ribbonKelp"
  | "godRayMesh";

export interface Aabb {
  min: [number, number, number];
  max: [number, number, number];
}

export interface EdgeSample {
  height: number;
  depth: number;
  visualPlane: number;
}

/**
 * Visual evidence emitted by the asset pipeline. It deliberately contains no
 * collider plane: copying collision truth into an art manifest would only
 * prove that the manifest agrees with itself.
 */
export interface PlayableEdge {
  axis: "x" | "y" | "z";
  gapDirection: 1 | -1;
  samples: EdgeSample[];
}

export interface LodEntry {
  level: 0 | 1 | 2;
  triangles: number;
  playableEdge?: PlayableEdge;
}

export interface AssetManifest {
  name: string;
  family: AssetFamily;
  /** Pipeline declaration; enforced against family config, never trusted. */
  collidable: boolean;
  /** Legacy marker used only by rejection fixtures and unfinished migrations. */
  baselineProcedural?: boolean;
  /** Required for every family configured as collidable. */
  runtimeObstacleId?: string;
  materials: number;
  textureMemoryMB: number;
  lods: LodEntry[];
  maxReliefDepth?: number;
  contour?: "collision-cyan" | "none" | "decorative";
  bones?: number;
  maxTextureSizePx?: number;
  clips?: string[];
  animationDriver?: "simulation" | "wallClock";
  observedStates?: string[];
  viewportWidthFraction?: number;
  eyeGlowPixels?: number;
}

/**
 * Collision evidence emitted from the runtime collision path. This is the
 * independent source that visual meshes are checked against.
 */
export interface RuntimeObstacle {
  id: string;
  family: AssetFamily;
  axis: "x" | "y" | "z";
  gapDirection: 1 | -1;
  colliderPlane: number;
  colliderEnvelope: Aabb;
  source: {
    module: string;
    exportName: string;
    runtimeRevision: string;
  };
}

export type Momentum = "low" | "mid" | "max";
export type Quality = "high" | "medium" | "low";

export interface EffectState {
  momentum: Momentum;
  bloom: boolean;
  caustics: boolean;
  quality: Quality;
}

export interface ObstacleContrast {
  obstacleId: string;
  ratios: number[];
}

export type CaptureSourceKind =
  | "ci-emulated"
  | "real-device"
  | "static-analysis";

export interface CaptureSource {
  kind: CaptureSourceKind;
  browser: string;
  platform: string;
  evidenceId: string;
}

export interface SceneCapture {
  seed: number;
  device: string;
  source: CaptureSource;
  state: EffectState;
  drawCalls: number;
  triangles: number;
  textureMemoryMB: number;
  activeMaterials: number;
  godRayMeshes: number;
  frameContrastRatios: number[];
  obstacles: ObstacleContrast[];
}

export interface RenderEvidence {
  trail: {
    implementation: string;
    particleReplacementUsed: boolean;
    laneWidthFractionAtMaxMomentum: number;
  };
}

export interface PerformanceEvidence {
  medianFps: number;
  coldStartMs: number;
  inputToVisibleMs: number;
  steadyStateHeapMB: number;
  soakHeapGrowthMB: number;
  peakPools: {
    gates: number;
    stripes: number;
    trailSegments: number;
    particles: number;
  };
}

export interface GateInput {
  evidenceVersion: string;
  runtimeRevision: string;
  assets: AssetManifest[];
  runtimeObstacles: RuntimeObstacle[];
  captures: SceneCapture[];
  renderEvidence: RenderEvidence;
  performanceEvidence?: PerformanceEvidence;
  compressedArtPayloadMB?: number;
  soakMinutes?: number;
}

export interface RangeBudget {
  lod0: [number, number] | null;
  lod1: [number, number] | null;
  lod2: [number, number] | null;
  maxMaterials: number;
  strategy: string;
  collidable: boolean;
}

export interface ExpectedCaptureState extends EffectState {
  device: string;
}

export interface CaptureTierConfig {
  requireCaptures: boolean;
  acceptedSourceKinds: CaptureSourceKind[];
  devices: string[];
  expectedStates: ExpectedCaptureState[];
  requireRealDevice: boolean;
  requiredSoakMinutes: number;
}

export interface GateConfig {
  configVersion: string;
  sourceOfTruth: string;
  scene: {
    drawCalls: { hard: number; minSpikeHeadroom: number };
    triangles: { warning: number; hard: number };
    textureMemoryMB: { warning: number; hard: number };
    activeArtMaterials: { hardMaxExclusive: number };
    compressedArtPayloadMB: { hard: number };
    godRayMeshes: { hard: number };
  };
  camera: {
    forwardSpeedMax: number;
    visibleDistanceAhead: number;
    minReactionWindowMs: number;
  };
  lod: {
    bands: Array<{
      level: number;
      nearWorldUnits: number;
      farWorldUnits: number;
    }>;
    silhouetteToleranceWorldUnits: number;
  };
  colliderTruth: {
    edgeAlignmentToleranceWorldUnits: number;
    straightnessToleranceWorldUnits: number;
    minimumSamplesPerEdge: number;
    allowFalseClearance: boolean;
    allowGapProtrusion: boolean;
    contourReservedForCollidable: boolean;
  };
  contrast: {
    minimumFrameSamples: number;
    minimumPerObstacleSamples: number;
    framePercentile: number;
    frameMinRatio: number;
    perObstaclePercentile: number;
    perObstacleMinRatio: number;
  };
  creature: {
    viewportWidthFractionMin: number;
    viewportWidthFractionMax: number;
    eyeGlowPixelsMin: number;
    eyeGlowPixelsMax: number;
    maxBones: number;
    maxMaterials: number;
    maxTextureSizePx: number;
    requiredStates: string[];
    requiredClips: string[];
    animationDriver: string;
  };
  trail: {
    maxLaneWidthFractionAtMaxMomentum: number;
    implementation: string;
    particleReplacementAllowed: boolean;
  };
  performance: {
    minMedianFps: number;
    maxColdStartMs: number;
    maxInputToVisibleMs: number;
    maxSteadyStateHeapMB: number;
    maxSoakHeapGrowthMB: number;
    maxPools: {
      gates: number;
      stripes: number;
      trailSegments: number;
      particles: number;
    };
  };
  assetFamilies: Record<string, RangeBudget>;
  captureTiers: Record<string, CaptureTierConfig>;
}
