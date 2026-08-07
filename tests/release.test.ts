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

describe("Version 41-R1 release identity", () => {
  it("accepts only the clean R1 rebuild rooted at the certified Version 39 baseline", () => {
    expect(isGlowfinReleaseMetadata(metadata())).toBe(true);
    expect(metadata().certification).toBe("physical-android-certified");
    expect(metadata().phase).toBe("phase-living-current-r1");
    expect(metadata().releaseTag).toBe("glowfin-v41-r1");
    expect(metadata().baselineVersion).toBe(39);
    expect(metadata().baselineCommit).toBe(
      "266b7900294f81e174134337a9d14b5951efcf30"
    );
    expect(releaseConfig.deferredVersions).toEqual([40]);
    expect(isGlowfinReleaseMetadata(metadata({ version: 40 }))).toBe(false);
    expect(isGlowfinReleaseMetadata(metadata({ baselineCommit: "deadbeef" }))).toBe(false);
    expect(isGlowfinReleaseMetadata(metadata({ environment: "production" }))).toBe(true);
  });

  it("rejects ambiguous source fingerprints", () => {
    expect(isGlowfinReleaseMetadata(metadata({ sourceCommit: "local" }))).toBe(false);
    expect(isGlowfinReleaseMetadata(metadata({ sourceCommit: "unknown" }))).toBe(false);
    expect(isGlowfinReleaseMetadata(metadata({ sourceCommit: "ABCDEF1" }))).toBe(false);
  });

  it("formats a compact phone-readable build label", () => {
    expect(formatReleaseLabel(metadata())).toBe("V41 · STAGING · 8f529b9");
    expect(formatReleaseLabel(metadata({
      environment: "local",
      sourceCommit: "local"
    }))).toBe("V41 · LOCAL · local");
  });
});
