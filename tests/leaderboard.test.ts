import { describe, expect, it } from "vitest";
import { tuning } from "../src/core/config";
import { FIXED_DT_SEC } from "../src/core/timestep";
import { classifyRunAccess, defaultAccessPreferences } from "../src/competitive/assists";
import {
  HostedLeaderboardClient,
  isLeaderboardSnapshot,
  isLeaderboardSubmission,
  type LeaderboardSnapshotV1
} from "../src/competitive/leaderboard";
import { ReplayRecorder } from "../src/replay/replay";

function submission() {
  const recorder = new ReplayRecorder(42, tuning.version);
  recorder.record(0);
  return {
    schemaVersion: 1 as const,
    runId: "run_12345678",
    mode: "fresh" as const,
    dayId: null,
    replay: recorder.finish({
      score: 1,
      elapsedSec: FIXED_DT_SEC,
      forwardDistance: 1,
      nearMisses: 0,
      collisions: 0
    })!,
    classification: classifyRunAccess(defaultAccessPreferences(false))
  };
}

function snapshot(): LeaderboardSnapshotV1 {
  return {
    schemaVersion: 1,
    scope: "global",
    dayId: null,
    division: "standard",
    entries: [{
      entryId: "ent_12345678",
      rank: 1,
      alias: "Moonfin A7Q2",
      score: 1200,
      nearMisses: 4,
      elapsedSec: 45,
      division: "standard",
      submittedAt: "2026-08-04T00:00:00.000Z"
    }],
    playerRank: 1,
    validationVersion: "phase4b-v1"
  };
}

describe("Version 34 hosted leaderboard client", () => {
  it("validates immutable division and daily-mode shape", () => {
    expect(isLeaderboardSubmission(submission())).toBe(true);
    expect(isLeaderboardSubmission({ ...submission(), dayId: "2026-08-04" })).toBe(false);
    expect(isLeaderboardSubmission({
      ...submission(),
      classification: { ...submission().classification, division: "assisted" }
    })).toBe(false);
  });

  it("loads a no-cache bounded board", async () => {
    const calls: Array<{ input: string; init?: RequestInit }> = [];
    const client = new HostedLeaderboardClient(async (input, init) => {
      calls.push({ input: String(input), init });
      return Response.json(snapshot());
    });
    expect(await client.list("global", "standard", null, 5)).toEqual(snapshot());
    expect(calls[0]?.input).toContain("scope=global");
    expect(calls[0]?.init).toMatchObject({ method: "GET", cache: "no-store", credentials: "same-origin" });
  });

  it("submits only a valid compact replay and accepts a strict snapshot", async () => {
    let body = "";
    const client = new HostedLeaderboardClient(async (_input, init) => {
      body = String(init?.body ?? "");
      return Response.json(snapshot());
    });
    expect(await client.submit(submission())).toEqual(snapshot());
    expect(JSON.parse(body)).toMatchObject({ runId: "run_12345678", mode: "fresh" });
  });

  it("rejects malformed board aliases and ranks", () => {
    expect(isLeaderboardSnapshot({ ...snapshot(), entries: [{
      ...snapshot().entries[0],
      rank: 0
    }] })).toBe(false);
  });
});
