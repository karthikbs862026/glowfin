import { FIXED_DT_SEC } from "../core/timestep";

export const REPLAY_SCHEMA_VERSION = 1 as const;
export const MAX_REPLAY_STEPS = 120 * 60 * 15;
export const MAX_REPLAY_SEGMENTS = 8_000;
export const MAX_REPLAY_JSON_BYTES = 128 * 1024;

export type ReplayCommandSegment = readonly [value: number, steps: number];

export interface ReplaySummary {
  score: number;
  elapsedSec: number;
  forwardDistance: number;
  nearMisses: number;
  collisions: number;
}

export interface GlowfinReplayV1 {
  schemaVersion: typeof REPLAY_SCHEMA_VERSION;
  seed: number;
  tuningVersion: number;
  fixedDtSec: number;
  totalSteps: number;
  commands: ReplayCommandSegment[];
  summary: ReplaySummary;
  checksum: string;
}

export interface ReplayValidation {
  valid: boolean;
  reason: string | null;
}

interface ReplayUnsignedPayload {
  schemaVersion: typeof REPLAY_SCHEMA_VERSION;
  seed: number;
  tuningVersion: number;
  fixedDtSec: number;
  totalSteps: number;
  commands: ReplayCommandSegment[];
  summary: ReplaySummary;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isUint32(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 0xffffffff;
}

/** Small deterministic checksum for corruption detection, not authentication. */
export function replayChecksum(payload: ReplayUnsignedPayload): string {
  const text = JSON.stringify(payload);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function normalizeReplaySteering(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return clamp(value, -1, 1);
}

export function unsignedReplay(replay: GlowfinReplayV1): ReplayUnsignedPayload {
  return {
    schemaVersion: replay.schemaVersion,
    seed: replay.seed,
    tuningVersion: replay.tuningVersion,
    fixedDtSec: replay.fixedDtSec,
    totalSteps: replay.totalSteps,
    commands: replay.commands,
    summary: replay.summary
  };
}

export function validateReplay(value: unknown): ReplayValidation {
  if (!value || typeof value !== "object") {
    return { valid: false, reason: "replay is not an object" };
  }
  const replay = value as Partial<GlowfinReplayV1>;
  if (replay.schemaVersion !== REPLAY_SCHEMA_VERSION) {
    return { valid: false, reason: "unsupported replay schema" };
  }
  if (!isUint32(replay.seed)) {
    return { valid: false, reason: "invalid replay seed" };
  }
  if (!Number.isInteger(replay.tuningVersion) || Number(replay.tuningVersion) < 1) {
    return { valid: false, reason: "invalid tuning version" };
  }
  if (
    typeof replay.fixedDtSec !== "number" ||
    Math.abs(replay.fixedDtSec - FIXED_DT_SEC) > 1e-12
  ) {
    return { valid: false, reason: "fixed timestep mismatch" };
  }
  if (
    !Number.isInteger(replay.totalSteps) ||
    Number(replay.totalSteps) < 1 ||
    Number(replay.totalSteps) > MAX_REPLAY_STEPS
  ) {
    return { valid: false, reason: "invalid replay length" };
  }
  if (
    !Array.isArray(replay.commands) ||
    replay.commands.length < 1 ||
    replay.commands.length > MAX_REPLAY_SEGMENTS
  ) {
    return { valid: false, reason: "invalid command segments" };
  }

  let steps = 0;
  let previous: number | null = null;
  for (const segment of replay.commands) {
    if (!Array.isArray(segment) || segment.length !== 2) {
      return { valid: false, reason: "malformed command segment" };
    }
    const [command, count] = segment;
    if (
      typeof command !== "number" ||
      !Number.isFinite(command) ||
      command < -1 ||
      command > 1 ||
      !Number.isInteger(count) ||
      count < 1 ||
      count > MAX_REPLAY_STEPS
    ) {
      return { valid: false, reason: "command segment is out of range" };
    }
    if (previous === command) {
      return { valid: false, reason: "adjacent command segments are not compacted" };
    }
    previous = command;
    steps += count;
    if (steps > MAX_REPLAY_STEPS) {
      return { valid: false, reason: "replay exceeds the step budget" };
    }
  }
  if (steps !== replay.totalSteps) {
    return { valid: false, reason: "replay step count does not match segments" };
  }

  const summary = replay.summary as Partial<ReplaySummary> | undefined;
  if (
    !summary ||
    !isFiniteNonNegative(summary.score) ||
    !isFiniteNonNegative(summary.elapsedSec) ||
    !isFiniteNonNegative(summary.forwardDistance) ||
    !Number.isInteger(summary.nearMisses) ||
    Number(summary.nearMisses) < 0 ||
    !Number.isInteger(summary.collisions) ||
    Number(summary.collisions) < 0
  ) {
    return { valid: false, reason: "invalid replay summary" };
  }
  const expectedElapsed = replay.totalSteps * replay.fixedDtSec;
  if (Math.abs(summary.elapsedSec - expectedElapsed) > FIXED_DT_SEC * 1.5) {
    return { valid: false, reason: "replay duration does not match fixed steps" };
  }
  if (typeof replay.checksum !== "string" || !/^[0-9a-f]{8}$/.test(replay.checksum)) {
    return { valid: false, reason: "invalid replay checksum" };
  }

  const typed = replay as GlowfinReplayV1;
  if (JSON.stringify(typed).length > MAX_REPLAY_JSON_BYTES) {
    return { valid: false, reason: "replay exceeds the byte budget" };
  }
  if (replayChecksum(unsignedReplay(typed)) !== typed.checksum) {
    return { valid: false, reason: "replay checksum mismatch" };
  }
  return { valid: true, reason: null };
}

export class ReplayRecorder {
  private readonly segments: Array<[number, number]> = [];
  private steps = 0;
  private overflowed = false;

  constructor(
    readonly seed: number,
    readonly tuningVersion: number
  ) {}

  record(steeringTarget: number): void {
    if (this.overflowed) return;
    if (this.steps >= MAX_REPLAY_STEPS) {
      this.overflowed = true;
      return;
    }
    const command = normalizeReplaySteering(steeringTarget);
    const last = this.segments[this.segments.length - 1];
    if (last?.[0] === command) {
      last[1] += 1;
    } else {
      if (this.segments.length >= MAX_REPLAY_SEGMENTS) {
        this.overflowed = true;
        return;
      }
      this.segments.push([command, 1]);
    }
    this.steps += 1;
  }

  finish(summary: ReplaySummary): GlowfinReplayV1 | null {
    if (this.overflowed || this.steps < 1) return null;
    const payload: ReplayUnsignedPayload = {
      schemaVersion: REPLAY_SCHEMA_VERSION,
      seed: this.seed >>> 0,
      tuningVersion: this.tuningVersion,
      fixedDtSec: FIXED_DT_SEC,
      totalSteps: this.steps,
      commands: this.segments.map(([value, steps]) => [value, steps] as const),
      summary: { ...summary }
    };
    const replay = { ...payload, checksum: replayChecksum(payload) };
    return JSON.stringify(replay).length <= MAX_REPLAY_JSON_BYTES ? replay : null;
  }

  get totalSteps(): number {
    return this.steps;
  }

  get isOverflowed(): boolean {
    return this.overflowed;
  }
}

export class ReplayPlayer {
  private segmentIndex = 0;
  private segmentStep = 0;
  private emittedSteps = 0;

  constructor(readonly replay: GlowfinReplayV1) {
    const validation = validateReplay(replay);
    if (!validation.valid) {
      throw new Error(`ReplayPlayer: ${validation.reason ?? "invalid replay"}`);
    }
  }

  next(): number | null {
    if (this.emittedSteps >= this.replay.totalSteps) return null;
    const segment = this.replay.commands[this.segmentIndex];
    if (!segment) return null;
    const value = segment[0];
    this.segmentStep += 1;
    this.emittedSteps += 1;
    if (this.segmentStep >= segment[1]) {
      this.segmentIndex += 1;
      this.segmentStep = 0;
    }
    return value;
  }

  reset(): void {
    this.segmentIndex = 0;
    this.segmentStep = 0;
    this.emittedSteps = 0;
  }

  get complete(): boolean {
    return this.emittedSteps >= this.replay.totalSteps;
  }
}
