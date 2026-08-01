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
  | "collapsedArchRuin"
  | "collapsedArchPair"
  | "spire"
  | "palaceDistrict"
  | "observatory"
  | "wallFragment"
  | "heroCoral"
  | "brainCoral"
  | "tableCoral"
  | "mediumCoral"
  | "smallProp"
  | "distantSkyline"
  | "ambientCreature"
  | "merfolkCreature"
  | "heroMerfolk"
  | "heroProp"
  | "artReviewImpostor"
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
  articulatedJoints?: number;
  readableHeightPixels?: number;
  readableFaceHeightPixels?: number;
  readableEyeDiameterPixels?: number;
  recognitionLabel?: string;
  parts?: string[];
  castRoles?: string[];
  populationRoles?: string[];
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

export interface MerfolkMaskComponentEvidence {
  widthPixels: number;
  heightPixels: number;
  visiblePixels: number;
  isolatedPixels: number;
  occlusionFraction: number;
  edgeClearancePixels: number;
}

export interface MerfolkVisualReviewEvidence {
  guardianRole: string;
  guardian: MerfolkMaskComponentEvidence;
  face: MerfolkMaskComponentEvidence;
  eyes: MerfolkMaskComponentEvidence;
  identity: MerfolkMaskComponentEvidence;
  population: Array<{
    role: string;
    component: MerfolkMaskComponentEvidence;
  }>;
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
  heroMerfolkHeightPixels: number;
  heroMerfolkFaceHeightPixels: number;
  heroMerfolkEyeDiameterPixels: number;
  /**
   * Pixel-mask evidence is emitted for the first three deterministic frames,
   * one per guardian identity. It measures the rendered/occluded result rather
   * than trusting declared object names or world-space bounds.
   */
  merfolkVisualReview?: MerfolkVisualReviewEvidence;
  frameContrastRatios: number[];
  obstacles: ObstacleContrast[];
  /** Bounded attribution evidence for failed browser samples. */
  contrastDiagnostics?: {
    failureCount: number;
    lowest: Array<{
      ratio: number;
      x: number;
      y: number;
      insideLuminance: number;
      outsideLuminance: number;
    }>;
  };
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

export interface WorldQualityEvidence {
  gateFamilies: string[];
  architecture: string[];
  reef: string[];
  life: string[];
  props: string[];
  materials: string[];
}

export interface GateInput {
  evidenceVersion: string;
  runtimeRevision: string;
  assets: AssetManifest[];
  runtimeObstacles: RuntimeObstacle[];
  captures: SceneCapture[];
  renderEvidence: RenderEvidence;
  worldQuality: WorldQualityEvidence;
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
  beauty: {
    meanLuminanceMin: number;
    nearBlackFractionMax: number;
    colourfulFractionMin: number;
    clippedHighlightFractionMax: number;
  };
  worldQuality: {
    requiredGateFamilies: string[];
    requiredArchitecture: string[];
    requiredReef: string[];
    requiredLife: string[];
    requiredProps: string[];
    requiredMaterials: string[];
    minimumDistinctVisibleGateFamilies: number;
    minimumDistinctReefFamilies: number;
    minimumAmbientLifeFamilies: number;
    minimumPropFamilies: number;
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
  merfolk: {
    minimumReadableHeightPixels: number;
    minimumFaceHeightPixels: number;
    minimumEyeDiameterPixels: number;
    minimumGuardianIdentitySpanPixels: number;
    minimumGuardianVisiblePixels: number;
    minimumCitizenHeightPixels: number;
    minimumCitizenVisiblePixels: number;
    minimumSwimmerWidthPixels: number;
    minimumSwimmerVisiblePixels: number;
    minimumHeraldHeightPixels: number;
    minimumHeraldVisiblePixels: number;
    maximumGuardianOcclusionFraction: number;
    maximumPopulationOcclusionFraction: number;
    minimumGuardianEdgeClearancePixels: number;
    maxArticulatedJoints: number;
    maxMaterials: number;
    requiredRecognitionLabel: string;
    requiredGuardianRoles: string[];
    requiredPopulationRoles: string[];
    requiredParts: string[];
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
