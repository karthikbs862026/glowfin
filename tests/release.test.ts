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

describe("Version 43-R4 release identity", () => {
  it("accepts only the integrated realm build rooted at promoted Version 42", () => {
    expect(isGlowfinReleaseMetadata(metadata())).toBe(true);
    expect(metadata().certification).toBe("automated-and-wrapper-candidate");
    expect(metadata().phase).toBe("phase-realms-mainline-integration-r4");
    expect(metadata().releaseTag).toBe("glowfin-v43-r4-realms-integrated");
    expect(metadata().sourceBaseVersion).toBe(42);
    expect(metadata().sourceBaseCommit).toBe(
      "6228c7755f55c63b27ccf8e58fac56291c9beae3"
    );
    expect(metadata().baselineVersion).toBe(39);
    expect(metadata().baselineCommit).toBe(
      "266b7900294f81e174134337a9d14b5951efcf30"
    );
    expect(releaseConfig.deferredVersions).toEqual([40, 41, 42]);
    expect(isGlowfinReleaseMetadata(metadata({ version: 42 }))).toBe(false);
    expect(isGlowfinReleaseMetadata(metadata({ baselineCommit: "deadbeef" }))).toBe(false);
    expect(isGlowfinReleaseMetadata(metadata({ environment: "production" }))).toBe(true);
  });

  it("rejects ambiguous source fingerprints", () => {
    expect(isGlowfinReleaseMetadata(metadata({ sourceCommit: "local" }))).toBe(false);
    expect(isGlowfinReleaseMetadata(metadata({ sourceCommit: "unknown" }))).toBe(false);
    expect(isGlowfinReleaseMetadata(metadata({ sourceCommit: "ABCDEF1" }))).toBe(false);
  });

  it("formats a compact phone-readable build label", () => {
    expect(formatReleaseLabel(metadata())).toBe("V43 · STAGING · 8f529b9");
    expect(formatReleaseLabel(metadata({
      environment: "local",
      sourceCommit: "local"
    }))).toBe("V43 · LOCAL · local");
  });
});
