import {
  type GlowfinReplayV1,
  type ReplaySummary,
  validateReplay
} from "../replay/replay";

export const PROGRESS_SCHEMA_VERSION = 1 as const;
export const PROGRESS_PRIMARY_KEY = "glowfin.progress.v1.primary";
export const PROGRESS_BACKUP_KEY = "glowfin.progress.v1.backup";
export const LEGACY_BEST_SCORE_KEY = "glowfin.best-score";
export const MAX_PROGRESS_BYTES = 160 * 1024;

export type TelemetryConsent = "unset" | "granted" | "denied";

export interface GlowfinProgressV1 {
  schemaVersion: typeof PROGRESS_SCHEMA_VERSION;
  revision: number;
  updatedAt: string;
  bestScore: number;
  bestReplay: GlowfinReplayV1 | null;
  totals: {
    runs: number;
    playSeconds: number;
    nearMisses: number;
    collisions: number;
  };
  telemetryConsent: TelemetryConsent;
  ghostEnabled: boolean;
}

interface ProgressEnvelopeV1 {
  envelopeVersion: 1;
  payload: GlowfinProgressV1;
  checksum: string;
}

export interface ProgressStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export interface ProgressLoadResult {
  progress: GlowfinProgressV1;
  recoveredFrom: "primary" | "backup" | "legacy" | "default";
  recoveryReason: string | null;
}

export interface RunRecordResult {
  progress: GlowfinProgressV1;
  newBest: boolean;
  replaySaved: boolean;
}

function clampCount(value: number): number {
  return Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(value)));
}

function safeIsoDate(value: string): boolean {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function checksumText(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function progressChecksum(progress: GlowfinProgressV1): string {
  return checksumText(JSON.stringify(progress));
}

export function createDefaultProgress(now = new Date()): GlowfinProgressV1 {
  return {
    schemaVersion: PROGRESS_SCHEMA_VERSION,
    revision: 0,
    updatedAt: now.toISOString(),
    bestScore: 0,
    bestReplay: null,
    totals: {
      runs: 0,
      playSeconds: 0,
      nearMisses: 0,
      collisions: 0
    },
    telemetryConsent: "unset",
    ghostEnabled: true
  };
}

export function validateProgress(value: unknown): value is GlowfinProgressV1 {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<GlowfinProgressV1>;
  const totals = candidate.totals as Partial<GlowfinProgressV1["totals"]> | undefined;
  const replayValid = candidate.bestReplay === null || validateReplay(candidate.bestReplay).valid;
  const consentValid =
    candidate.telemetryConsent === "unset" ||
    candidate.telemetryConsent === "granted" ||
    candidate.telemetryConsent === "denied";
  return (
    candidate.schemaVersion === PROGRESS_SCHEMA_VERSION &&
    Number.isInteger(candidate.revision) &&
    Number(candidate.revision) >= 0 &&
    safeIsoDate(candidate.updatedAt ?? "") &&
    typeof candidate.bestScore === "number" &&
    Number.isFinite(candidate.bestScore) &&
    candidate.bestScore >= 0 &&
    replayValid &&
    Boolean(totals) &&
    Number.isInteger(totals?.runs) && Number(totals?.runs) >= 0 &&
    typeof totals?.playSeconds === "number" &&
    Number.isFinite(totals.playSeconds) && totals.playSeconds >= 0 &&
    Number.isInteger(totals?.nearMisses) && Number(totals?.nearMisses) >= 0 &&
    Number.isInteger(totals?.collisions) && Number(totals?.collisions) >= 0 &&
    consentValid &&
    typeof candidate.ghostEnabled === "boolean" &&
    (!candidate.bestReplay || candidate.bestReplay.summary.score <= candidate.bestScore + 1e-6)
  );
}

function encodeEnvelope(progress: GlowfinProgressV1): string {
  const envelope: ProgressEnvelopeV1 = {
    envelopeVersion: 1,
    payload: progress,
    checksum: progressChecksum(progress)
  };
  const encoded = JSON.stringify(envelope);
  if (encoded.length > MAX_PROGRESS_BYTES) {
    throw new Error(`Glowfin progress exceeds ${MAX_PROGRESS_BYTES} bytes.`);
  }
  return encoded;
}

function decodeEnvelope(encoded: string): GlowfinProgressV1 | null {
  if (encoded.length < 2 || encoded.length > MAX_PROGRESS_BYTES) return null;
  try {
    const value = JSON.parse(encoded) as Partial<ProgressEnvelopeV1>;
    if (
      value.envelopeVersion !== 1 ||
      typeof value.checksum !== "string" ||
      !validateProgress(value.payload) ||
      progressChecksum(value.payload) !== value.checksum
    ) {
      return null;
    }
    return value.payload;
  } catch {
    return null;
  }
}

function cloneProgress(progress: GlowfinProgressV1): GlowfinProgressV1 {
  return JSON.parse(JSON.stringify(progress)) as GlowfinProgressV1;
}

export function mergeProgress(
  local: GlowfinProgressV1,
  remote: GlowfinProgressV1,
  now = new Date()
): GlowfinProgressV1 {
  const bestReplay = [local.bestReplay, remote.bestReplay]
    .filter((replay): replay is GlowfinReplayV1 => replay !== null)
    .sort((a, b) => b.summary.score - a.summary.score)[0] ?? null;
  const consent = local.telemetryConsent !== "unset"
    ? local.telemetryConsent
    : remote.telemetryConsent;
  return {
    schemaVersion: PROGRESS_SCHEMA_VERSION,
    revision: Math.max(local.revision, remote.revision) + 1,
    updatedAt: now.toISOString(),
    bestScore: Math.max(local.bestScore, remote.bestScore),
    bestReplay: bestReplay
      ? JSON.parse(JSON.stringify(bestReplay)) as GlowfinReplayV1
      : null,
    totals: {
      // Max is deliberately idempotent. It cannot double-count when the same
      // cloud snapshot is merged repeatedly after an interrupted save.
      runs: Math.max(local.totals.runs, remote.totals.runs),
      playSeconds: Math.max(local.totals.playSeconds, remote.totals.playSeconds),
      nearMisses: Math.max(local.totals.nearMisses, remote.totals.nearMisses),
      collisions: Math.max(local.totals.collisions, remote.totals.collisions)
    },
    telemetryConsent: consent,
    ghostEnabled: local.ghostEnabled
  };
}

export class ProgressRepository {
  private current = createDefaultProgress();

  constructor(
    private readonly storage: ProgressStorage,
    private readonly now: () => Date = () => new Date()
  ) {}

  load(): ProgressLoadResult {
    let primaryRaw: string | null = null;
    let backupRaw: string | null = null;
    try {
      primaryRaw = this.storage.getItem(PROGRESS_PRIMARY_KEY);
      backupRaw = this.storage.getItem(PROGRESS_BACKUP_KEY);
    } catch {
      this.current = createDefaultProgress(this.now());
      return {
        progress: cloneProgress(this.current),
        recoveredFrom: "default",
        recoveryReason: "storage-unavailable"
      };
    }

    const primary = primaryRaw ? decodeEnvelope(primaryRaw) : null;
    if (primary) {
      this.current = primary;
      return { progress: cloneProgress(primary), recoveredFrom: "primary", recoveryReason: null };
    }

    const backup = backupRaw ? decodeEnvelope(backupRaw) : null;
    if (backup) {
      this.current = backup;
      try {
        // Restore only the invalid primary. Keeping the known-good backup in
        // place preserves two valid recovery points for the next interruption.
        this.storage.setItem(PROGRESS_PRIMARY_KEY, encodeEnvelope(backup));
      } catch {
        // In-memory recovery is still usable when the storage write is denied.
      }
      return {
        progress: cloneProgress(backup),
        recoveredFrom: "backup",
        recoveryReason: primaryRaw ? "primary-corrupt" : "primary-missing"
      };
    }

    const legacy = this.readLegacyBestScore();
    this.current = createDefaultProgress(this.now());
    if (legacy !== null) {
      this.current.bestScore = legacy;
      this.current.revision = 1;
      this.persist(this.current);
      return {
        progress: cloneProgress(this.current),
        recoveredFrom: "legacy",
        recoveryReason: "migrated-best-score"
      };
    }

    this.persist(this.current);
    return {
      progress: cloneProgress(this.current),
      recoveredFrom: "default",
      recoveryReason: primaryRaw || backupRaw ? "all-copies-invalid" : null
    };
  }

  snapshot(): GlowfinProgressV1 {
    return cloneProgress(this.current);
  }

  recordRun(summary: ReplaySummary, replay: GlowfinReplayV1 | null): RunRecordResult {
    const validReplay = replay && validateReplay(replay).valid ? replay : null;
    const newBest = summary.score > this.current.bestScore;
    this.current = {
      ...this.current,
      revision: this.current.revision + 1,
      updatedAt: this.now().toISOString(),
      bestScore: newBest ? summary.score : this.current.bestScore,
      bestReplay: newBest && validReplay ? validReplay : this.current.bestReplay,
      totals: {
        runs: clampCount(this.current.totals.runs + 1),
        playSeconds: Math.max(0, this.current.totals.playSeconds + summary.elapsedSec),
        nearMisses: clampCount(this.current.totals.nearMisses + summary.nearMisses),
        collisions: clampCount(this.current.totals.collisions + summary.collisions)
      }
    };
    this.persist(this.current);
    return {
      progress: cloneProgress(this.current),
      newBest,
      replaySaved: newBest && Boolean(validReplay)
    };
  }

  setTelemetryConsent(consent: TelemetryConsent): GlowfinProgressV1 {
    this.current = {
      ...this.current,
      revision: this.current.revision + 1,
      updatedAt: this.now().toISOString(),
      telemetryConsent: consent
    };
    this.persist(this.current);
    return cloneProgress(this.current);
  }

  setGhostEnabled(enabled: boolean): GlowfinProgressV1 {
    this.current = {
      ...this.current,
      revision: this.current.revision + 1,
      updatedAt: this.now().toISOString(),
      ghostEnabled: enabled
    };
    this.persist(this.current);
    return cloneProgress(this.current);
  }

  replaceWithMerged(remote: GlowfinProgressV1): GlowfinProgressV1 {
    if (!validateProgress(remote)) return this.snapshot();
    this.current = mergeProgress(this.current, remote, this.now());
    this.persist(this.current);
    return cloneProgress(this.current);
  }

  private persist(progress: GlowfinProgressV1): void {
    try {
      const encoded = encodeEnvelope(progress);
      const existing = this.storage.getItem(PROGRESS_PRIMARY_KEY);
      if (existing) this.storage.setItem(PROGRESS_BACKUP_KEY, existing);
      this.storage.setItem(PROGRESS_PRIMARY_KEY, encoded);
    } catch {
      // Storage can be denied or exhausted on mobile private modes. Gameplay
      // remains available in-memory; a later successful write can recover.
    }
  }

  private readLegacyBestScore(): number | null {
    try {
      const raw = this.storage.getItem(LEGACY_BEST_SCORE_KEY);
      if (raw === null) return null;
      const score = Number(raw);
      return Number.isFinite(score) && score >= 0 ? score : null;
    } catch {
      return null;
    }
  }
}
