import { tuning } from "../core/config";
import { FIXED_DT_SEC } from "../core/timestep";
import { ReplayPlayer } from "../replay/replay";
import { validateMoonflashClip, type MoonflashClipV1 } from "../sharing/clips";
import { Run } from "../sim/run";
import { verifyLeaderboardSubmission } from "./verification";

export interface MoonflashVerificationResult {
  valid: boolean;
  reason: string | null;
  verificationDigest: string | null;
}

function rejected(reason: string): MoonflashVerificationResult {
  return { valid: false, reason, verificationDigest: null };
}

function close(actual: number, expected: number, tolerance = 1e-5): boolean {
  return Math.abs(actual - expected) <= tolerance;
}

/** Verify both the full replay and the claimed near-miss frame server-side. */
export function verifyMoonflashClip(value: unknown): MoonflashVerificationResult {
  if (!validateMoonflashClip(value)) return rejected("invalid-clip");
  const clip = value as MoonflashClipV1;
  const runVerification = verifyLeaderboardSubmission({
    schemaVersion: 1,
    runId: "run_moonflash-verifier",
    mode: "fresh",
    dayId: null,
    replay: clip.replay,
    classification: clip.classification
  });
  if (!runVerification.valid) {
    return rejected(`invalid-run:${runVerification.reason ?? "unknown"}`);
  }

  const run = new Run(clip.replay.seed, tuning);
  const player = new ReplayPlayer(clip.replay);
  for (let step = 1; step <= clip.momentStep; step++) {
    const command = player.next();
    if (command === null) return rejected("moment-after-replay");
    const events = run.step(FIXED_DT_SEC, command);
    if (step !== clip.momentStep) continue;
    const encounter = events.encounters.find((item) => (
      item.kind === "near-miss" &&
      item.templateId === clip.moment.templateId &&
      item.tier === clip.moment.tier &&
      close(item.distance, clip.moment.distance) &&
      close(item.clearance, clip.moment.clearance)
    ));
    if (!encounter) return rejected("near-miss-moment-mismatch");
    if (!close(run.scoring.score, clip.moment.score)) return rejected("moment-score-mismatch");
    if (!close(run.scoring.multiplier, clip.moment.multiplier)) {
      return rejected("moment-multiplier-mismatch");
    }
  }
  return {
    valid: true,
    reason: null,
    verificationDigest: runVerification.verificationDigest
  };
}
