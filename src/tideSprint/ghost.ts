import { TIDE_SPRINT_LANE_HALF_WIDTH } from "./course";
import {
  CLEAN_TIDE_SPRINT_PLAN_HASH,
  type TideSprintControlFrame,
  type TideSprintGhostControlSource,
} from "./director";
import {
  MAX_TIDE_SPRINT_GHOST_FRAMES,
  tideSprintGhostChecksum,
  validateTideSprintGhost,
  type TideSprintGhostReplayV1,
} from "./progress";
import type { TideSprintCrewId } from "./crew";

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function encodeBytes(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 8_192;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  }
  return btoa(binary);
}

function decodeBytes(encoded: string): Uint8Array {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function quantizeLateral(value: number): number {
  const normalized = (
    clamp(value, -TIDE_SPRINT_LANE_HALF_WIDTH, TIDE_SPRINT_LANE_HALF_WIDTH) +
    TIDE_SPRINT_LANE_HALF_WIDTH
  ) / (TIDE_SPRINT_LANE_HALF_WIDTH * 2);
  return Math.round(normalized * 255);
}

function dequantizeLateral(value: number): number {
  return value / 255 * TIDE_SPRINT_LANE_HALF_WIDTH * 2 -
    TIDE_SPRINT_LANE_HALF_WIDTH;
}

function quantizeThrottle(value: number): number {
  return Math.round(clamp(value, 0, 1) * 255);
}

export class TideSprintGhostRecorder {
  private readonly bytes = new Uint8Array(MAX_TIDE_SPRINT_GHOST_FRAMES * 2);
  private frames = 0;

  constructor(private readonly selected: TideSprintCrewId) {}

  record(control: TideSprintControlFrame): boolean {
    if (this.frames >= MAX_TIDE_SPRINT_GHOST_FRAMES) return false;
    const offset = this.frames * 2;
    this.bytes[offset] = quantizeLateral(control.targetLateral);
    this.bytes[offset + 1] = quantizeThrottle(control.throttle);
    this.frames += 1;
    return true;
  }

  finish(finishSec: number): TideSprintGhostReplayV1 | null {
    if (
      this.frames < 1 ||
      !Number.isFinite(finishSec) ||
      finishSec < 20 ||
      finishSec > 180
    ) return null;
    const withoutChecksum = {
      schemaVersion: 1 as const,
      planHash: CLEAN_TIDE_SPRINT_PLAN_HASH,
      selected: this.selected,
      finishSec,
      frameCount: this.frames,
      encodedControls: encodeBytes(this.bytes.subarray(0, this.frames * 2)),
    };
    return {
      ...withoutChecksum,
      checksum: tideSprintGhostChecksum(withoutChecksum),
    };
  }

  get frameCount(): number {
    return this.frames;
  }
}

export class TideSprintGhostPlayback implements TideSprintGhostControlSource {
  readonly label = "Best Echo";
  private readonly bytes: Uint8Array;

  constructor(readonly replay: TideSprintGhostReplayV1) {
    if (
      !validateTideSprintGhost(replay) ||
      replay.planHash !== CLEAN_TIDE_SPRINT_PLAN_HASH
    ) {
      throw new Error("Tide Sprint ghost is invalid or belongs to another race plan.");
    }
    this.bytes = decodeBytes(replay.encodedControls);
    if (this.bytes.length !== replay.frameCount * 2) {
      throw new Error("Tide Sprint ghost control length is invalid.");
    }
  }

  controlAtFrame(frameIndex: number): TideSprintControlFrame {
    const frame = Math.max(0, Math.min(
      this.replay.frameCount - 1,
      Math.floor(frameIndex),
    ));
    const offset = frame * 2;
    return {
      targetLateral: dequantizeLateral(this.bytes[offset]!),
      throttle: this.bytes[offset + 1]! / 255,
    };
  }

  static tryCreate(
    replay: TideSprintGhostReplayV1 | null,
  ): TideSprintGhostPlayback | null {
    if (!replay || replay.planHash !== CLEAN_TIDE_SPRINT_PLAN_HASH) return null;
    try {
      return new TideSprintGhostPlayback(replay);
    } catch {
      return null;
    }
  }
}
