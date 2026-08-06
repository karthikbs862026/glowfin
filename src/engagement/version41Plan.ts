import rawVersion41Config from "../../config/version41.json";

export type Version41SegmentKind =
  | "follow-light"
  | "relic-fork"
  | "rescue-miri"
  | "race-neri"
  | "duskmaw-chase"
  | "return-moonwell";

export interface Version41Segment {
  kind: Version41SegmentKind;
  startSec: number;
  endSec: number;
  title: string;
  objective: string;
}

export interface Version41Config {
  schemaVersion: 1;
  contentVersion: 41;
  expeditionId: string;
  title: string;
  seed: number;
  durationSec: number;
  qaTimeScale: number;
  segments: Version41Segment[];
  collectibles: {
    motePool: number;
    moteSpacingUnits: number;
    moteCollectRadius: number;
    moteMissDistanceUnits: number;
    relicCollectRadius: number;
    rescueCollectRadius: number;
    currentBreakCollectRadius: number;
    relicAheadUnits: number;
    rescueAheadUnits: number[];
    currentBreakAheadUnits: number[];
  };
  race: {
    targetSpeedUnitsPerSec: number;
    visualGapLimitUnits: number;
    collisionPenaltyUnits: number;
    cleanFinishBonusUnits: number;
  };
  chase: {
    initialGapUnits: number;
    minimumGapUnits: number;
    maximumGapUnits: number;
    closingUnitsPerSec: number;
    breakGainUnits: number;
    successGapUnits: number;
  };
  presentation: {
    maxVisibleAheadUnits: number;
    maxVisibleBehindUnits: number;
    moteScale: number;
    rescueScale: number;
    ringRadius: number;
    rivalLateralOffset: number;
    miriLateralOffset: number;
    duskmawHeight: number;
    finishAheadUnits: number;
    finishFallbackSec: number;
  };
  budgets: {
    maxAdditionalDrawCalls: number;
    maxAdditionalTriangles: number;
    maxAdditionalMaterials: number;
    maxPurposeGapSec: number;
    minReactionWindowMs: number;
    performanceFloorFps: number;
  };
}

export interface Version41Plan {
  schemaVersion: 1;
  contentVersion: 41;
  expeditionId: string;
  title: string;
  seed: number;
  durationSec: number;
  segments: readonly Version41Segment[];
  purposeBeatTimesSec: readonly number[];
  planHash: string;
}

export interface Version41RelicDefinition {
  id: string;
  name: string;
  clue: string;
}

export const VERSION41_RELICS: readonly Version41RelicDefinition[] = [
  {
    id: "moonseed-fragment",
    name: "Moonseed Fragment",
    clue: "Take the outer current during Relic Fork."
  },
  {
    id: "tidekeeper-crest",
    name: "Tidekeeper Crest",
    clue: "A future guardian Expedition will reveal it."
  },
  {
    id: "crystal-song",
    name: "Crystal Song",
    clue: "Its echo waits beyond the Moon-Garden."
  },
  {
    id: "mermaid-crown-piece",
    name: "Mermaid Crown Piece",
    clue: "Restore another district to uncover its route."
  },
  {
    id: "leviathan-scale-echo",
    name: "Leviathan Scale Echo",
    clue: "A deeper Duskmaw chapter is required."
  },
  {
    id: "astral-observatory-lens",
    name: "Astral Observatory Lens",
    clue: "The archless observatory is still sleeping."
  }
] as const;

const SEGMENT_KINDS = new Set<Version41SegmentKind>([
  "follow-light",
  "relic-fork",
  "rescue-miri",
  "race-neri",
  "duskmaw-chase",
  "return-moonwell"
]);

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function positiveNumber(value: unknown): value is number {
  return finiteNumber(value) && value > 0;
}

function positiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

function boundedText(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

function numberArray(value: unknown, expectedLength: number): value is number[] {
  return Array.isArray(value) &&
    value.length === expectedLength &&
    value.every(positiveNumber);
}

function parseSegment(value: unknown): Version41Segment | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<Version41Segment>;
  if (
    typeof candidate.kind !== "string" ||
    !SEGMENT_KINDS.has(candidate.kind as Version41SegmentKind) ||
    !finiteNumber(candidate.startSec) ||
    !positiveNumber(candidate.endSec) ||
    candidate.endSec <= candidate.startSec ||
    !boundedText(candidate.title, 48) ||
    !boundedText(candidate.objective, 120)
  ) {
    return null;
  }
  return {
    kind: candidate.kind as Version41SegmentKind,
    startSec: candidate.startSec,
    endSec: candidate.endSec,
    title: candidate.title,
    objective: candidate.objective
  };
}

function parseConfig(value: unknown): Version41Config {
  if (!value || typeof value !== "object") {
    throw new Error("Version 41 config must be an object.");
  }
  const candidate = value as Record<string, unknown>;
  const segmentsValue = candidate["segments"];
  const segments = Array.isArray(segmentsValue)
    ? segmentsValue.map(parseSegment)
    : [];
  const collectibles = candidate["collectibles"] as Record<string, unknown> | undefined;
  const race = candidate["race"] as Record<string, unknown> | undefined;
  const chase = candidate["chase"] as Record<string, unknown> | undefined;
  const presentation = candidate["presentation"] as Record<string, unknown> | undefined;
  const budgets = candidate["budgets"] as Record<string, unknown> | undefined;

  if (
    candidate["schemaVersion"] !== 1 ||
    candidate["contentVersion"] !== 41 ||
    !boundedText(candidate["expeditionId"], 64) ||
    !boundedText(candidate["title"], 64) ||
    !Number.isInteger(candidate["seed"]) ||
    Number(candidate["seed"]) < 0 ||
    Number(candidate["seed"]) > 0xffffffff ||
    !positiveNumber(candidate["durationSec"]) ||
    !positiveNumber(candidate["qaTimeScale"]) ||
    segments.length !== 6 ||
    segments.some((segment) => segment === null) ||
    !collectibles ||
    !positiveInteger(collectibles["motePool"]) ||
    !positiveNumber(collectibles["moteSpacingUnits"]) ||
    !positiveNumber(collectibles["moteCollectRadius"]) ||
    !positiveNumber(collectibles["moteMissDistanceUnits"]) ||
    !positiveNumber(collectibles["relicCollectRadius"]) ||
    !positiveNumber(collectibles["rescueCollectRadius"]) ||
    !positiveNumber(collectibles["currentBreakCollectRadius"]) ||
    !positiveNumber(collectibles["relicAheadUnits"]) ||
    !numberArray(collectibles["rescueAheadUnits"], 3) ||
    !numberArray(collectibles["currentBreakAheadUnits"], 3) ||
    !race ||
    !positiveNumber(race["targetSpeedUnitsPerSec"]) ||
    !positiveNumber(race["visualGapLimitUnits"]) ||
    !positiveNumber(race["collisionPenaltyUnits"]) ||
    !positiveNumber(race["cleanFinishBonusUnits"]) ||
    !chase ||
    !positiveNumber(chase["initialGapUnits"]) ||
    !positiveNumber(chase["minimumGapUnits"]) ||
    !positiveNumber(chase["maximumGapUnits"]) ||
    !positiveNumber(chase["closingUnitsPerSec"]) ||
    !positiveNumber(chase["breakGainUnits"]) ||
    !positiveNumber(chase["successGapUnits"]) ||
    !presentation ||
    !positiveNumber(presentation["maxVisibleAheadUnits"]) ||
    !positiveNumber(presentation["maxVisibleBehindUnits"]) ||
    !positiveNumber(presentation["moteScale"]) ||
    !positiveNumber(presentation["rescueScale"]) ||
    !positiveNumber(presentation["ringRadius"]) ||
    !finiteNumber(presentation["rivalLateralOffset"]) ||
    !finiteNumber(presentation["miriLateralOffset"]) ||
    !finiteNumber(presentation["duskmawHeight"]) ||
    !positiveNumber(presentation["finishAheadUnits"]) ||
    !positiveNumber(presentation["finishFallbackSec"]) ||
    !budgets ||
    !positiveInteger(budgets["maxAdditionalDrawCalls"]) ||
    !positiveInteger(budgets["maxAdditionalTriangles"]) ||
    !positiveInteger(budgets["maxAdditionalMaterials"]) ||
    !positiveNumber(budgets["maxPurposeGapSec"]) ||
    !positiveNumber(budgets["minReactionWindowMs"]) ||
    !positiveNumber(budgets["performanceFloorFps"])
  ) {
    throw new Error("Version 41 config failed structural validation.");
  }

  const typedSegments = segments as Version41Segment[];
  return {
    schemaVersion: 1,
    contentVersion: 41,
    expeditionId: candidate["expeditionId"],
    title: candidate["title"],
    seed: Number(candidate["seed"]),
    durationSec: candidate["durationSec"],
    qaTimeScale: candidate["qaTimeScale"],
    segments: typedSegments,
    collectibles: {
      motePool: Number(collectibles["motePool"]),
      moteSpacingUnits: collectibles["moteSpacingUnits"],
      moteCollectRadius: collectibles["moteCollectRadius"],
      moteMissDistanceUnits: collectibles["moteMissDistanceUnits"],
      relicCollectRadius: collectibles["relicCollectRadius"],
      rescueCollectRadius: collectibles["rescueCollectRadius"],
      currentBreakCollectRadius: collectibles["currentBreakCollectRadius"],
      relicAheadUnits: collectibles["relicAheadUnits"],
      rescueAheadUnits: [...collectibles["rescueAheadUnits"]],
      currentBreakAheadUnits: [...collectibles["currentBreakAheadUnits"]]
    },
    race: {
      targetSpeedUnitsPerSec: race["targetSpeedUnitsPerSec"],
      visualGapLimitUnits: race["visualGapLimitUnits"],
      collisionPenaltyUnits: race["collisionPenaltyUnits"],
      cleanFinishBonusUnits: race["cleanFinishBonusUnits"]
    },
    chase: {
      initialGapUnits: chase["initialGapUnits"],
      minimumGapUnits: chase["minimumGapUnits"],
      maximumGapUnits: chase["maximumGapUnits"],
      closingUnitsPerSec: chase["closingUnitsPerSec"],
      breakGainUnits: chase["breakGainUnits"],
      successGapUnits: chase["successGapUnits"]
    },
    presentation: {
      maxVisibleAheadUnits: presentation["maxVisibleAheadUnits"],
      maxVisibleBehindUnits: presentation["maxVisibleBehindUnits"],
      moteScale: presentation["moteScale"],
      rescueScale: presentation["rescueScale"],
      ringRadius: presentation["ringRadius"],
      rivalLateralOffset: presentation["rivalLateralOffset"],
      miriLateralOffset: presentation["miriLateralOffset"],
      duskmawHeight: presentation["duskmawHeight"],
      finishAheadUnits: presentation["finishAheadUnits"],
      finishFallbackSec: presentation["finishFallbackSec"]
    },
    budgets: {
      maxAdditionalDrawCalls: Number(budgets["maxAdditionalDrawCalls"]),
      maxAdditionalTriangles: Number(budgets["maxAdditionalTriangles"]),
      maxAdditionalMaterials: Number(budgets["maxAdditionalMaterials"]),
      maxPurposeGapSec: budgets["maxPurposeGapSec"],
      minReactionWindowMs: budgets["minReactionWindowMs"],
      performanceFloorFps: budgets["performanceFloorFps"]
    }
  };
}

export const VERSION41_CONFIG: Readonly<Version41Config> = Object.freeze(
  parseConfig(rawVersion41Config as unknown)
);

function checksumText(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export const VERSION41_EXPERIENCE_REVISION = "v41.2-plan-compliance-rebuild";
export const VERSION41_TOTAL_SECONDS = 180;
export const VERSION41_FIXED_SEED = VERSION41_CONFIG.seed;
export const VERSION41_PERFORMANCE_BUDGETS = Object.freeze({
  totalDrawCalls: 90,
  totalTriangles: 150000,
  textureMemoryMB: 48,
  totalMaterials: 12,
  reactionLatencyMs: 700,
  frameRateFloor: 30
});
export const VERSION41_CHAPTERS = Object.freeze([
  { kind: "follow-light", title: "Follow the Light", objective: "Collect six golden Lumen Motes and follow Neri.", minimumSeconds: 20, targetSeconds: 25, pressure: "calm" },
  { kind: "relic-fork", title: "Claim the Fragment", objective: "Choose the outer-right relic current or continue on the wide cyan route.", minimumSeconds: 22, targetSeconds: 30, pressure: "choice" },
  { kind: "rescue-miri", title: "Rescue Miri", objective: "Reach three Rescue Lights: left, right, then center.", minimumSeconds: 25, targetSeconds: 30, pressure: "character" },
  { kind: "race-neri", title: "Race Neri", objective: "Hold Flow through three race gates and reach the finish first.", minimumSeconds: 28, targetSeconds: 30, pressure: "competition" },
  { kind: "duskmaw-chase", title: "Escape Duskmaw", objective: "Reach three Current Breaks while the safe cyan route remains visible.", minimumSeconds: 22, targetSeconds: 25, pressure: "high" },
  { kind: "return-moonwell", title: "Restore the Moon Well", objective: "Center on the ceremonial portal and carry the Moonseed home.", minimumSeconds: 20, targetSeconds: 40, pressure: "recovery" }
] as const);
export const VERSION41_SEGMENT_ORDER = Object.freeze(
  VERSION41_CHAPTERS.map((chapter) => chapter.kind)
);
export const VERSION41_RESCUE_LANES = Object.freeze([-3.15, 3.15, 0]);
export const VERSION41_BREAK_LANES = Object.freeze([-3.05, 3.05, 3.35]);
export const VERSION41_CHASE_PATTERNS = Object.freeze([
  "Shadow Sweep",
  "Vacuum Wake",
  "Ruins Collapse"
]);
export const VERSION41_PLAN_HASH = checksumText(JSON.stringify({
  schemaVersion: 2,
  contentVersion: 41,
  revision: VERSION41_EXPERIENCE_REVISION,
  fixedSeed: VERSION41_FIXED_SEED,
  durationSec: VERSION41_TOTAL_SECONDS,
  chapters: VERSION41_CHAPTERS,
  rescueLanes: VERSION41_RESCUE_LANES,
  breakLanes: VERSION41_BREAK_LANES,
  chasePatterns: VERSION41_CHASE_PATTERNS
}));

export interface Version41ChapterState {
  stageSeconds?: number;
  bestChain?: number;
  relicResolved?: boolean;
  rescueLights?: number;
  raceGates?: number;
  raceGap?: number;
  currentBreaks?: number;
  portalReached?: boolean;
}

export function shouldAdvanceChapter(
  kind: Version41SegmentKind,
  state: Version41ChapterState
): boolean {
  const seconds = Math.max(0, Number(state.stageSeconds ?? 0));
  switch (kind) {
    case "follow-light": return seconds >= 20 && Number(state.bestChain ?? 0) >= 6;
    case "relic-fork": return seconds >= 22 && Boolean(state.relicResolved);
    case "rescue-miri": return seconds >= 25 && Number(state.rescueLights ?? 0) >= 3;
    case "race-neri": return seconds >= 28 && Number(state.raceGates ?? 0) >= 3 && Number(state.raceGap ?? -1) >= 0;
    case "duskmaw-chase": return seconds >= 22 && Number(state.currentBreaks ?? 0) >= 3;
    case "return-moonwell": return seconds >= 20 && Boolean(state.portalReached);
  }
}

export interface Version41CompletionResult {
  portalReached?: boolean;
  rescueLights?: number;
  raceGates?: number;
  raceGap?: number;
  currentBreaks?: number;
  relicFound?: boolean;
  bestChain?: number;
  recoveries?: number;
  assists?: number;
}

export function completionMarks(result: Version41CompletionResult): Array<{
  id: "mission-complete" | "hidden-relic" | "clean-current";
  label: string;
  earned: boolean;
}> {
  const primary = Boolean(
    result.portalReached &&
    Number(result.rescueLights ?? 0) >= 3 &&
    Number(result.raceGates ?? 0) >= 3 &&
    Number(result.currentBreaks ?? 0) >= 3
  );
  const relic = Boolean(result.relicFound);
  const clean = Boolean(
    primary &&
    Number(result.bestChain ?? 0) >= 12 &&
    Number(result.raceGap ?? -1) >= 0 &&
    Number(result.recoveries ?? 0) === 0 &&
    Number(result.assists ?? 0) === 0
  );
  return [
    { id: "mission-complete", label: "Moonseed returned", earned: primary },
    { id: "hidden-relic", label: "Fragment found", earned: relic },
    { id: "clean-current", label: "Clean current", earned: clean }
  ];
}

export function auditVersion41ExperiencePlan(): string[] {
  const issues: string[] = [];
  if (VERSION41_CHAPTERS.length !== 6) issues.push("expected six encounter chapters");
  if (VERSION41_CHAPTERS.reduce((total, chapter) => total + chapter.targetSeconds, 0) !== 180) {
    issues.push("chapter targets do not resolve at three minutes");
  }
  if (
    VERSION41_SEGMENT_ORDER[VERSION41_SEGMENT_ORDER.length - 2] !== "duskmaw-chase" ||
    VERSION41_SEGMENT_ORDER[VERSION41_SEGMENT_ORDER.length - 1] !== "return-moonwell"
  ) {
    issues.push("high pressure is not followed by recovery");
  }
  if (!Number.isInteger(VERSION41_FIXED_SEED)) issues.push("expedition seed is not deterministic");
  if (VERSION41_PERFORMANCE_BUDGETS.reactionLatencyMs > 700) issues.push("reaction cue exceeds 700ms");
  if (VERSION41_PERFORMANCE_BUDGETS.frameRateFloor < 30) issues.push("frame-rate floor is below 30fps");
  return issues;
}

function purposeBeats(segments: readonly Version41Segment[], maxGapSec: number): number[] {
  const beats = new Set<number>([0]);
  for (const segment of segments) {
    beats.add(segment.startSec);
    let beat = segment.startSec + maxGapSec;
    while (beat < segment.endSec) {
      beats.add(beat);
      beat += maxGapSec;
    }
    beats.add(segment.endSec);
  }
  return [...beats].sort((a, b) => a - b);
}

export function createVersion41Plan(
  seed = VERSION41_CONFIG.seed
): Version41Plan {
  const unsigned = {
    schemaVersion: 1 as const,
    contentVersion: 41 as const,
    expeditionId: VERSION41_CONFIG.expeditionId,
    title: VERSION41_CONFIG.title,
    seed: seed >>> 0,
    durationSec: VERSION41_CONFIG.durationSec,
    segments: VERSION41_CONFIG.segments.map((segment) => ({ ...segment })),
    purposeBeatTimesSec: purposeBeats(
      VERSION41_CONFIG.segments,
      VERSION41_CONFIG.budgets.maxPurposeGapSec
    )
  };
  return {
    ...unsigned,
    planHash: checksumText(JSON.stringify(unsigned))
  };
}

export function validateVersion41Plan(plan: Version41Plan): string[] {
  const issues: string[] = [];
  if (plan.schemaVersion !== 1 || plan.contentVersion !== 41) {
    issues.push("unsupported Version 41 plan schema");
  }
  if (plan.segments.length !== VERSION41_CONFIG.segments.length) {
    issues.push("unexpected encounter count");
  }
  let previousEnd = 0;
  let previousKind: Version41SegmentKind | null = null;
  for (const segment of plan.segments) {
    if (Math.abs(segment.startSec - previousEnd) > 1e-9) {
      issues.push(`purpose gap before ${segment.kind}`);
    }
    if (segment.kind === previousKind) {
      issues.push(`repeated encounter ${segment.kind}`);
    }
    if (segment.endSec <= segment.startSec) {
      issues.push(`invalid duration for ${segment.kind}`);
    }
    previousEnd = segment.endSec;
    previousKind = segment.kind;
  }
  if (Math.abs(previousEnd - plan.durationSec) > 1e-9) {
    issues.push("encounters do not resolve at the Expedition duration");
  }
  if (plan.segments[0]?.startSec !== 0) {
    issues.push("the opening purpose does not begin immediately");
  }
  const beats = plan.purposeBeatTimesSec;
  for (let index = 1; index < beats.length; index++) {
    const previous = beats[index - 1];
    const current = beats[index];
    if (
      previous === undefined ||
      current === undefined ||
      current - previous > VERSION41_CONFIG.budgets.maxPurposeGapSec + 1e-9
    ) {
      issues.push("a purposeless interval exceeds the configured maximum");
      break;
    }
  }
  const chaseIndex = plan.segments.findIndex((segment) => segment.kind === "duskmaw-chase");
  if (plan.segments[chaseIndex + 1]?.kind !== "return-moonwell") {
    issues.push("the high-pressure chase is not followed by a calm resolution");
  }
  const expectedHash = createVersion41Plan(plan.seed).planHash;
  if (plan.planHash !== expectedHash) issues.push("plan hash mismatch");
  return issues;
}

export function segmentAtTime(
  plan: Version41Plan,
  elapsedSec: number
): Version41Segment {
  const bounded = Math.max(0, Math.min(plan.durationSec, elapsedSec));
  return plan.segments.find((segment) => (
    bounded >= segment.startSec && bounded < segment.endSec
  )) ?? plan.segments[plan.segments.length - 1] as Version41Segment;
}

export function collectibleHit(
  playerDistance: number,
  playerLateral: number,
  targetDistance: number,
  targetLateral: number,
  radius: number
): boolean {
  if (![playerDistance, playerLateral, targetDistance, targetLateral, radius].every(finiteNumber)) {
    return false;
  }
  if (radius <= 0) return false;
  const forwardDelta = playerDistance - targetDistance;
  const lateralDelta = playerLateral - targetLateral;
  return forwardDelta * forwardDelta + lateralDelta * lateralDelta <= radius * radius;
}

export function moteLateralPosition(index: number): number {
  const wave = Math.sin(index * 0.58) * 2.65;
  const ribbon = Math.sin(index * 0.21 + 0.8) * 0.82;
  return wave + ribbon;
}

export function version41QaTimeScale(location: Pick<Location, "hostname" | "search">): number {
  const loopback = location.hostname === "127.0.0.1" || location.hostname === "localhost";
  if (!loopback) return 1;
  const params = new URLSearchParams(location.search);
  return params.get("v41qa") === "1" ? VERSION41_CONFIG.qaTimeScale : 1;
}

export interface Version41BudgetEvidence {
  additionalDrawCalls: number;
  additionalTriangles: number;
  additionalMaterials: number;
}

export function auditVersion41Budgets(evidence: Version41BudgetEvidence): string[] {
  const issues: string[] = [];
  if (evidence.additionalDrawCalls > VERSION41_CONFIG.budgets.maxAdditionalDrawCalls) {
    issues.push("Version 41 draw-call budget exceeded");
  }
  if (evidence.additionalTriangles > VERSION41_CONFIG.budgets.maxAdditionalTriangles) {
    issues.push("Version 41 triangle budget exceeded");
  }
  if (evidence.additionalMaterials > VERSION41_CONFIG.budgets.maxAdditionalMaterials) {
    issues.push("Version 41 material budget exceeded");
  }
  return issues;
}

export const VERSION41_PROGRESS_SCHEMA_VERSION = 1 as const;
export const VERSION41_PROGRESS_PRIMARY_KEY = "glowfin.version41.v1.primary";
export const VERSION41_PROGRESS_BACKUP_KEY = "glowfin.version41.v1.backup";
const MAX_VERSION41_PROGRESS_BYTES = 16 * 1024;
const MAX_VERSION41_CLAIMS = 64;

export interface Version41Progress {
  schemaVersion: typeof VERSION41_PROGRESS_SCHEMA_VERSION;
  revision: number;
  updatedAt: string;
  discoveredRelics: string[];
  expeditionCompletions: number;
  bestMoteChain: number;
  bestRaceGapUnits: number;
  bestChaseGapUnits: number;
  miriRescued: boolean;
  moonWellRestored: boolean;
  recentClaims: string[];
}

interface Version41ProgressEnvelope {
  envelopeVersion: 1;
  payload: Version41Progress;
  checksum: string;
}

export interface Version41Storage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface Version41ProgressLoad {
  progress: Version41Progress;
  recoveredFrom: "primary" | "backup" | "default";
  recoveryReason: string | null;
}

function defaultVersion41Progress(now = new Date().toISOString()): Version41Progress {
  return {
    schemaVersion: VERSION41_PROGRESS_SCHEMA_VERSION,
    revision: 0,
    updatedAt: now,
    discoveredRelics: [],
    expeditionCompletions: 0,
    bestMoteChain: 0,
    bestRaceGapUnits: 0,
    bestChaseGapUnits: 0,
    miriRescued: false,
    moonWellRestored: false,
    recentClaims: []
  };
}

function validRelicId(value: unknown): value is string {
  return typeof value === "string" && VERSION41_RELICS.some((relic) => relic.id === value);
}

export function isVersion41Progress(value: unknown): value is Version41Progress {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Version41Progress>;
  return (
    candidate.schemaVersion === VERSION41_PROGRESS_SCHEMA_VERSION &&
    Number.isInteger(candidate.revision) && Number(candidate.revision) >= 0 &&
    typeof candidate.updatedAt === "string" && Number.isFinite(Date.parse(candidate.updatedAt)) &&
    Array.isArray(candidate.discoveredRelics) &&
    candidate.discoveredRelics.length <= VERSION41_RELICS.length &&
    candidate.discoveredRelics.every(validRelicId) &&
    new Set(candidate.discoveredRelics).size === candidate.discoveredRelics.length &&
    Number.isInteger(candidate.expeditionCompletions) && Number(candidate.expeditionCompletions) >= 0 &&
    Number.isInteger(candidate.bestMoteChain) && Number(candidate.bestMoteChain) >= 0 &&
    finiteNumber(candidate.bestRaceGapUnits) && Number(candidate.bestRaceGapUnits) >= 0 &&
    finiteNumber(candidate.bestChaseGapUnits) && Number(candidate.bestChaseGapUnits) >= 0 &&
    typeof candidate.miriRescued === "boolean" &&
    typeof candidate.moonWellRestored === "boolean" &&
    Array.isArray(candidate.recentClaims) &&
    candidate.recentClaims.length <= MAX_VERSION41_CLAIMS &&
    candidate.recentClaims.every((claim) => (
      typeof claim === "string" && /^[a-z0-9:._-]{1,96}$/.test(claim)
    )) &&
    new Set(candidate.recentClaims).size === candidate.recentClaims.length
  );
}

export function version41ProgressChecksum(progress: Version41Progress): string {
  return checksumText(JSON.stringify(progress));
}

function encodeProgress(progress: Version41Progress): string {
  const envelope: Version41ProgressEnvelope = {
    envelopeVersion: 1,
    payload: progress,
    checksum: version41ProgressChecksum(progress)
  };
  const encoded = JSON.stringify(envelope);
  if (encoded.length > MAX_VERSION41_PROGRESS_BYTES) {
    throw new Error("Version 41 progress exceeds its storage budget.");
  }
  return encoded;
}

function decodeProgress(encoded: string | null): Version41Progress | null {
  if (!encoded || encoded.length > MAX_VERSION41_PROGRESS_BYTES) return null;
  try {
    const envelope = JSON.parse(encoded) as Partial<Version41ProgressEnvelope>;
    if (
      envelope.envelopeVersion !== 1 ||
      !isVersion41Progress(envelope.payload) ||
      envelope.checksum !== version41ProgressChecksum(envelope.payload)
    ) {
      return null;
    }
    return JSON.parse(JSON.stringify(envelope.payload)) as Version41Progress;
  } catch {
    return null;
  }
}

function sanitizeClaims(claims: readonly string[]): string[] {
  return [...new Set(claims)]
    .filter((claim) => /^[a-z0-9:._-]{1,96}$/.test(claim))
    .slice(-MAX_VERSION41_CLAIMS);
}

export function mergeVersion41Progress(
  local: Version41Progress,
  remote: Version41Progress,
  now = new Date().toISOString()
): Version41Progress {
  const relicOrder = new Map(VERSION41_RELICS.map((relic, index) => [relic.id, index]));
  const discoveredRelics = [...new Set([
    ...local.discoveredRelics,
    ...remote.discoveredRelics
  ])]
    .filter(validRelicId)
    .sort((a, b) => (relicOrder.get(a) ?? 99) - (relicOrder.get(b) ?? 99));
  return {
    schemaVersion: VERSION41_PROGRESS_SCHEMA_VERSION,
    revision: Math.max(local.revision, remote.revision) + 1,
    updatedAt: now,
    discoveredRelics,
    expeditionCompletions: Math.max(
      local.expeditionCompletions,
      remote.expeditionCompletions
    ),
    bestMoteChain: Math.max(local.bestMoteChain, remote.bestMoteChain),
    bestRaceGapUnits: Math.max(local.bestRaceGapUnits, remote.bestRaceGapUnits),
    bestChaseGapUnits: Math.max(local.bestChaseGapUnits, remote.bestChaseGapUnits),
    miriRescued: local.miriRescued || remote.miriRescued,
    moonWellRestored: local.moonWellRestored || remote.moonWellRestored,
    recentClaims: sanitizeClaims([...local.recentClaims, ...remote.recentClaims])
  };
}

export class Version41ProgressRepository {
  constructor(
    private readonly storage: Version41Storage,
    private readonly now: () => string = () => new Date().toISOString()
  ) {}

  load(): Version41ProgressLoad {
    let primary: Version41Progress | null = null;
    let backup: Version41Progress | null = null;
    try {
      primary = decodeProgress(this.storage.getItem(VERSION41_PROGRESS_PRIMARY_KEY));
      backup = decodeProgress(this.storage.getItem(VERSION41_PROGRESS_BACKUP_KEY));
    } catch {
      return {
        progress: defaultVersion41Progress(this.now()),
        recoveredFrom: "default",
        recoveryReason: "storage-unavailable"
      };
    }
    if (primary && backup) {
      return {
        progress: primary.revision >= backup.revision ? primary : backup,
        recoveredFrom: primary.revision >= backup.revision ? "primary" : "backup",
        recoveryReason: primary.revision >= backup.revision ? null : "newer-backup"
      };
    }
    if (primary) {
      return { progress: primary, recoveredFrom: "primary", recoveryReason: null };
    }
    if (backup) {
      this.persist(backup);
      return { progress: backup, recoveredFrom: "backup", recoveryReason: "primary-invalid" };
    }
    return {
      progress: defaultVersion41Progress(this.now()),
      recoveredFrom: "default",
      recoveryReason: "no-valid-copy"
    };
  }

  save(progress: Version41Progress): Version41Progress {
    const next: Version41Progress = {
      ...progress,
      revision: progress.revision + 1,
      updatedAt: this.now(),
      discoveredRelics: [...progress.discoveredRelics],
      recentClaims: sanitizeClaims(progress.recentClaims)
    };
    if (!isVersion41Progress(next)) {
      throw new Error("Refusing to save invalid Version 41 progress.");
    }
    this.persist(next);
    return next;
  }

  recordExpedition(
    current: Version41Progress,
    result: {
      relicFound: boolean;
      moteChain: number;
      raceGapUnits: number;
      chaseGapUnits: number;
      miriRescued: boolean;
    }
  ): Version41Progress {
    const relicClaim = `relic:${VERSION41_RELICS[0]?.id ?? "moonseed-fragment"}`;
    const restorationClaim = `restoration:${VERSION41_CONFIG.expeditionId}`;
    const claims = [...current.recentClaims];
    const discovered = [...current.discoveredRelics];
    if (result.relicFound && !claims.includes(relicClaim)) {
      claims.push(relicClaim);
      const relicId = VERSION41_RELICS[0]?.id;
      if (relicId && !discovered.includes(relicId)) discovered.push(relicId);
    }
    if (!claims.includes(restorationClaim)) claims.push(restorationClaim);
    return this.save({
      ...current,
      discoveredRelics: discovered,
      expeditionCompletions: current.expeditionCompletions + 1,
      bestMoteChain: Math.max(current.bestMoteChain, Math.max(0, Math.floor(result.moteChain))),
      bestRaceGapUnits: Math.max(current.bestRaceGapUnits, Math.max(0, result.raceGapUnits)),
      bestChaseGapUnits: Math.max(current.bestChaseGapUnits, Math.max(0, result.chaseGapUnits)),
      miriRescued: current.miriRescued || result.miriRescued,
      moonWellRestored: true,
      recentClaims: claims
    });
  }

  private persist(progress: Version41Progress): void {
    const encoded = encodeProgress(progress);
    try {
      this.storage.setItem(VERSION41_PROGRESS_BACKUP_KEY, encoded);
      this.storage.setItem(VERSION41_PROGRESS_PRIMARY_KEY, encoded);
    } catch {
      // The in-memory result remains valid even when hardened storage is denied.
    }
  }
}

