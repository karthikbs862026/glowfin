import type { ProgressStorage } from "../persistence/progress";

export const EXPEDITION_PROGRESS_SCHEMA_VERSION = 1 as const;
export const EXPEDITION_PROGRESS_PRIMARY_KEY = "glowfin.expedition.v1.primary";
export const EXPEDITION_PROGRESS_BACKUP_KEY = "glowfin.expedition.v1.backup";
export const MAX_EXPEDITION_PROGRESS_BYTES = 24 * 1024;
export const MAX_EXPEDITION_CLAIMS = 64;

export const MOON_GARDEN_RELIC_IDS = Object.freeze([
  "moonseed-fragment",
  "tidekeeper-seal",
  "astral-conch",
  "manta-lullaby",
  "bronze-current-key",
  "moon-well-heart",
] as const);

export type MoonGardenRelicId = typeof MOON_GARDEN_RELIC_IDS[number];

export interface ExpeditionCompletionMarks {
  primaryObjective: boolean;
  hiddenRelic: boolean;
  cleanPerformance: boolean;
}

export interface ExpeditionProgressV1 {
  schemaVersion: typeof EXPEDITION_PROGRESS_SCHEMA_VERSION;
  revision: number;
  updatedAt: string;
  latestPlanHash: string;
  discoveredRelics: MoonGardenRelicId[];
  completionMarks: ExpeditionCompletionMarks;
  bestLumenChain: number;
  miriRescued: boolean;
  bestNeriFinishGap: number;
  bestCurrentBreaks: number;
  cleanChaseCompletions: number;
  recoveredChaseCompletions: number;
  moonWellRestored: boolean;
  recentClaims: string[];
}

interface ExpeditionEnvelopeV1 {
  envelopeVersion: 1;
  payload: ExpeditionProgressV1;
  checksum: string;
}

export interface ExpeditionProgressLoadResult {
  progress: ExpeditionProgressV1;
  recoveredFrom: "primary" | "backup" | "default";
  recoveryReason: string | null;
}

export interface ExpeditionCompletionInput {
  claimId: string;
  planHash: string;
  primaryObjective: boolean;
  relicFound: boolean;
  bestLumenChain: number;
  miriRescued: boolean;
  neriFinishGap: number;
  currentBreaks: number;
  cleanChase: boolean;
  moonWellRestored: boolean;
}

export interface ExpeditionCompletionResult {
  progress: ExpeditionProgressV1;
  claimed: boolean;
  duplicatePrevented: boolean;
  newlyDiscoveredRelics: MoonGardenRelicId[];
  newlyRestoredMoonWell: boolean;
  newlyCompletedMarks: Array<keyof ExpeditionCompletionMarks>;
}

function clampCount(value: number): number {
  return Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(value)));
}

function safeNumber(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function safeClaimId(value: string): string {
  const clean = value.replace(/[^a-zA-Z0-9:._-]/g, "").slice(0, 108);
  return clean || "unknown";
}

function safePlanHash(value: string): string {
  return /^[a-f0-9]{8}$/i.test(value) ? value.toLowerCase() : "00000000";
}

function checksumText(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function expeditionProgressChecksum(progress: ExpeditionProgressV1): string {
  return checksumText(JSON.stringify(progress));
}

function clone(progress: ExpeditionProgressV1): ExpeditionProgressV1 {
  return JSON.parse(JSON.stringify(progress)) as ExpeditionProgressV1;
}

function isoDateValid(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function relicIdValid(value: unknown): value is MoonGardenRelicId {
  return typeof value === "string" &&
    MOON_GARDEN_RELIC_IDS.some((relic) => relic === value);
}

export function createDefaultExpeditionProgress(
  now = new Date(),
): ExpeditionProgressV1 {
  return {
    schemaVersion: EXPEDITION_PROGRESS_SCHEMA_VERSION,
    revision: 0,
    updatedAt: now.toISOString(),
    latestPlanHash: "00000000",
    discoveredRelics: [],
    completionMarks: {
      primaryObjective: false,
      hiddenRelic: false,
      cleanPerformance: false,
    },
    bestLumenChain: 0,
    miriRescued: false,
    bestNeriFinishGap: 0,
    bestCurrentBreaks: 0,
    cleanChaseCompletions: 0,
    recoveredChaseCompletions: 0,
    moonWellRestored: false,
    recentClaims: [],
  };
}

export function validateExpeditionProgress(
  value: unknown,
): value is ExpeditionProgressV1 {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ExpeditionProgressV1>;
  const marks = candidate.completionMarks as Partial<ExpeditionCompletionMarks> | undefined;
  return (
    candidate.schemaVersion === EXPEDITION_PROGRESS_SCHEMA_VERSION &&
    Number.isInteger(candidate.revision) && Number(candidate.revision) >= 0 &&
    isoDateValid(candidate.updatedAt) &&
    typeof candidate.latestPlanHash === "string" &&
    /^[a-f0-9]{8}$/i.test(candidate.latestPlanHash) &&
    Array.isArray(candidate.discoveredRelics) &&
    candidate.discoveredRelics.length <= MOON_GARDEN_RELIC_IDS.length &&
    candidate.discoveredRelics.every(relicIdValid) &&
    new Set(candidate.discoveredRelics).size === candidate.discoveredRelics.length &&
    Boolean(marks) &&
    typeof marks?.primaryObjective === "boolean" &&
    typeof marks?.hiddenRelic === "boolean" &&
    typeof marks?.cleanPerformance === "boolean" &&
    Number.isInteger(candidate.bestLumenChain) && Number(candidate.bestLumenChain) >= 0 &&
    typeof candidate.miriRescued === "boolean" &&
    typeof candidate.bestNeriFinishGap === "number" &&
    Number.isFinite(candidate.bestNeriFinishGap) &&
    Number(candidate.bestNeriFinishGap) >= 0 &&
    Number.isInteger(candidate.bestCurrentBreaks) && Number(candidate.bestCurrentBreaks) >= 0 &&
    Number(candidate.bestCurrentBreaks) <= 3 &&
    Number.isInteger(candidate.cleanChaseCompletions) && Number(candidate.cleanChaseCompletions) >= 0 &&
    Number.isInteger(candidate.recoveredChaseCompletions) && Number(candidate.recoveredChaseCompletions) >= 0 &&
    typeof candidate.moonWellRestored === "boolean" &&
    Array.isArray(candidate.recentClaims) &&
    candidate.recentClaims.length <= MAX_EXPEDITION_CLAIMS &&
    candidate.recentClaims.every((claim) => (
      typeof claim === "string" && /^[a-zA-Z0-9:._-]{1,120}$/.test(claim)
    )) &&
    new Set(candidate.recentClaims).size === candidate.recentClaims.length
  );
}

function encode(progress: ExpeditionProgressV1): string {
  const envelope: ExpeditionEnvelopeV1 = {
    envelopeVersion: 1,
    payload: progress,
    checksum: expeditionProgressChecksum(progress),
  };
  const encoded = JSON.stringify(envelope);
  if (encoded.length > MAX_EXPEDITION_PROGRESS_BYTES) {
    throw new Error(
      `Glowfin Expedition progress exceeds ${MAX_EXPEDITION_PROGRESS_BYTES} bytes.`,
    );
  }
  return encoded;
}

function decode(encoded: string): ExpeditionProgressV1 | null {
  if (encoded.length < 2 || encoded.length > MAX_EXPEDITION_PROGRESS_BYTES) {
    return null;
  }
  try {
    const envelope = JSON.parse(encoded) as Partial<ExpeditionEnvelopeV1>;
    if (
      envelope.envelopeVersion !== 1 ||
      typeof envelope.checksum !== "string" ||
      !validateExpeditionProgress(envelope.payload) ||
      expeditionProgressChecksum(envelope.payload) !== envelope.checksum
    ) return null;
    return envelope.payload;
  } catch {
    return null;
  }
}

export function mergeExpeditionProgress(
  local: ExpeditionProgressV1,
  remote: ExpeditionProgressV1,
  now = new Date(),
): ExpeditionProgressV1 {
  const preferred = local.revision >= remote.revision ? local : remote;
  return {
    schemaVersion: EXPEDITION_PROGRESS_SCHEMA_VERSION,
    revision: Math.max(local.revision, remote.revision) + 1,
    updatedAt: now.toISOString(),
    latestPlanHash: preferred.latestPlanHash,
    discoveredRelics: Array.from(new Set([
      ...local.discoveredRelics,
      ...remote.discoveredRelics,
    ])).filter(relicIdValid).sort(),
    completionMarks: {
      primaryObjective:
        local.completionMarks.primaryObjective || remote.completionMarks.primaryObjective,
      hiddenRelic:
        local.completionMarks.hiddenRelic || remote.completionMarks.hiddenRelic,
      cleanPerformance:
        local.completionMarks.cleanPerformance || remote.completionMarks.cleanPerformance,
    },
    bestLumenChain: Math.max(local.bestLumenChain, remote.bestLumenChain),
    miriRescued: local.miriRescued || remote.miriRescued,
    bestNeriFinishGap: Math.max(local.bestNeriFinishGap, remote.bestNeriFinishGap),
    bestCurrentBreaks: Math.max(local.bestCurrentBreaks, remote.bestCurrentBreaks),
    cleanChaseCompletions: Math.max(
      local.cleanChaseCompletions,
      remote.cleanChaseCompletions,
    ),
    recoveredChaseCompletions: Math.max(
      local.recoveredChaseCompletions,
      remote.recoveredChaseCompletions,
    ),
    moonWellRestored: local.moonWellRestored || remote.moonWellRestored,
    recentClaims: Array.from(new Set([
      ...local.recentClaims,
      ...remote.recentClaims,
    ])).sort().slice(-MAX_EXPEDITION_CLAIMS),
  };
}

export class ExpeditionProgressRepository {
  private current = createDefaultExpeditionProgress();

  constructor(
    private readonly storage: ProgressStorage,
    private readonly now: () => Date = () => new Date(),
  ) {}

  load(): ExpeditionProgressLoadResult {
    let primaryRaw: string | null = null;
    let backupRaw: string | null = null;
    try {
      primaryRaw = this.storage.getItem(EXPEDITION_PROGRESS_PRIMARY_KEY);
      backupRaw = this.storage.getItem(EXPEDITION_PROGRESS_BACKUP_KEY);
    } catch {
      this.current = createDefaultExpeditionProgress(this.now());
      return {
        progress: clone(this.current),
        recoveredFrom: "default",
        recoveryReason: "storage-unavailable",
      };
    }

    const primary = primaryRaw ? decode(primaryRaw) : null;
    if (primary) {
      this.current = primary;
      return {
        progress: clone(primary),
        recoveredFrom: "primary",
        recoveryReason: null,
      };
    }

    const backup = backupRaw ? decode(backupRaw) : null;
    if (backup) {
      this.current = backup;
      try {
        this.storage.setItem(EXPEDITION_PROGRESS_PRIMARY_KEY, encode(backup));
      } catch {
        // The recovered in-memory copy remains authoritative for this session.
      }
      return {
        progress: clone(backup),
        recoveredFrom: "backup",
        recoveryReason: primaryRaw ? "primary-corrupt" : "primary-missing",
      };
    }

    this.current = createDefaultExpeditionProgress(this.now());
    this.persist(this.current);
    return {
      progress: clone(this.current),
      recoveredFrom: "default",
      recoveryReason: primaryRaw || backupRaw ? "all-copies-invalid" : null,
    };
  }

  snapshot(): ExpeditionProgressV1 {
    return clone(this.current);
  }

  recordCompletion(input: ExpeditionCompletionInput): ExpeditionCompletionResult {
    const claimId = `expedition:${safeClaimId(input.claimId)}`;
    if (this.current.recentClaims.includes(claimId)) {
      return {
        progress: this.snapshot(),
        claimed: false,
        duplicatePrevented: true,
        newlyDiscoveredRelics: [],
        newlyRestoredMoonWell: false,
        newlyCompletedMarks: [],
      };
    }

    const newlyDiscoveredRelics: MoonGardenRelicId[] = [];
    const discovered = new Set(this.current.discoveredRelics);
    if (input.relicFound && !discovered.has("moonseed-fragment")) {
      discovered.add("moonseed-fragment");
      newlyDiscoveredRelics.push("moonseed-fragment");
    }
    const nextMarks: ExpeditionCompletionMarks = {
      primaryObjective:
        this.current.completionMarks.primaryObjective || input.primaryObjective,
      hiddenRelic:
        this.current.completionMarks.hiddenRelic || input.relicFound,
      cleanPerformance:
        this.current.completionMarks.cleanPerformance || input.cleanChase,
    };
    const newlyCompletedMarks = (
      Object.keys(nextMarks) as Array<keyof ExpeditionCompletionMarks>
    ).filter((mark) => nextMarks[mark] && !this.current.completionMarks[mark]);
    const newlyRestoredMoonWell =
      input.moonWellRestored && !this.current.moonWellRestored;

    this.current = {
      ...this.current,
      revision: this.current.revision + 1,
      updatedAt: this.now().toISOString(),
      latestPlanHash: safePlanHash(input.planHash),
      discoveredRelics: Array.from(discovered).sort(),
      completionMarks: nextMarks,
      bestLumenChain: Math.max(
        this.current.bestLumenChain,
        clampCount(input.bestLumenChain),
      ),
      miriRescued: this.current.miriRescued || input.miriRescued,
      bestNeriFinishGap: Math.max(
        this.current.bestNeriFinishGap,
        Math.max(0, safeNumber(input.neriFinishGap)),
      ),
      bestCurrentBreaks: Math.max(
        this.current.bestCurrentBreaks,
        Math.min(3, clampCount(input.currentBreaks)),
      ),
      cleanChaseCompletions: clampCount(
        this.current.cleanChaseCompletions + (input.cleanChase ? 1 : 0),
      ),
      recoveredChaseCompletions: clampCount(
        this.current.recoveredChaseCompletions + (input.cleanChase ? 0 : 1),
      ),
      moonWellRestored:
        this.current.moonWellRestored || input.moonWellRestored,
      recentClaims: [...this.current.recentClaims, claimId]
        .sort()
        .slice(-MAX_EXPEDITION_CLAIMS),
    };
    this.persist(this.current);
    return {
      progress: this.snapshot(),
      claimed: true,
      duplicatePrevented: false,
      newlyDiscoveredRelics,
      newlyRestoredMoonWell,
      newlyCompletedMarks,
    };
  }

  replaceWithMerged(remote: ExpeditionProgressV1): ExpeditionProgressV1 {
    if (!validateExpeditionProgress(remote)) return this.snapshot();
    this.current = mergeExpeditionProgress(this.current, remote, this.now());
    this.persist(this.current);
    return this.snapshot();
  }

  private persist(progress: ExpeditionProgressV1): void {
    try {
      const encoded = encode(progress);
      const existing = this.storage.getItem(EXPEDITION_PROGRESS_PRIMARY_KEY);
      if (existing) {
        this.storage.setItem(EXPEDITION_PROGRESS_BACKUP_KEY, existing);
      }
      this.storage.setItem(EXPEDITION_PROGRESS_PRIMARY_KEY, encoded);
    } catch {
      // Private mode or storage pressure must never block the Expedition.
    }
  }
}
