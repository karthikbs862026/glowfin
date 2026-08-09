import { describe, expect, it } from "vitest";
import releaseConfig from "../config/release.json";
import {
  formatReleaseLabel,
  isGlowfinReleaseMetadata,
  type GlowfinReleaseMetadata
} from "../src/release";

function metadata(
  overrides: Partial<GlowfinReleaseMetadata> = {}
): GlowfinReleaseMetadata {
  return {
    ...releaseConfig,
    environment: "staging",
    sourceCommit: "8f529b9bd5f2e2c42e4aa27d24a88441d564b291",
    ...overrides
  };
}

describe("Version 42-R1 release identity", () => {
  it("accepts only the Tide Sprint integration rooted at merged Version 41-R5", () => {
    expect(isGlowfinReleaseMetadata(metadata())).toBe(true);
    expect(metadata().certification).toBe("automated-candidate");
    expect(metadata().phase).toBe("phase-tide-sprint-integration-r1");
    expect(metadata().releaseTag).toBe("glowfin-v42-r1");
    expect(metadata().sourceBaseVersion).toBe(41);
    expect(metadata().sourceBaseCommit).toBe(
      "c67c4a6350f3f432c72e5d01fe92df69c557f2f0"
    );
    expect(metadata().baselineVersion).toBe(39);
    expect(metadata().baselineCommit).toBe(
      "266b7900294f81e174134337a9d14b5951efcf30"
    );
    expect(releaseConfig.deferredVersions).toEqual([40, 41]);
    expect(isGlowfinReleaseMetadata(metadata({ version: 41 }))).toBe(false);
    expect(isGlowfinReleaseMetadata(metadata({ baselineCommit: "deadbeef" }))).toBe(false);
    expect(isGlowfinReleaseMetadata(metadata({ environment: "production" }))).toBe(true);
  });

  it("rejects ambiguous source fingerprints", () => {
    expect(isGlowfinReleaseMetadata(metadata({ sourceCommit: "local" }))).toBe(false);
    expect(isGlowfinReleaseMetadata(metadata({ sourceCommit: "unknown" }))).toBe(false);
    expect(isGlowfinReleaseMetadata(metadata({ sourceCommit: "ABCDEF1" }))).toBe(false);
  });

  it("formats a compact phone-readable build label", () => {
    expect(formatReleaseLabel(metadata())).toBe("V42 · STAGING · 8f529b9");
    expect(formatReleaseLabel(metadata({
      environment: "local",
      sourceCommit: "local"
    }))).toBe("V42 · LOCAL · local");
  });
});
