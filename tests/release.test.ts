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

describe("Version 48-R2 release identity", () => {
  it("accepts only the full Eclipse Court campaign rooted at GitHub Version 45", () => {
    expect(isGlowfinReleaseMetadata(metadata())).toBe(true);
    expect(metadata().certification).toBe("eclipse-court-full-campaign-review-candidate");
    expect(metadata().phase).toBe("phase-full-realm-campaign-r2");
    expect(metadata().releaseTag).toBe("glowfin-v48-r2-eclipse-court-full-campaign");
    expect(metadata().sourceBaseVersion).toBe(45);
    expect(metadata().sourceBaseCommit).toBe(
      "6c352f7ef40abc7569533ba7e8902d9d56d9936a"
    );
    expect(metadata().baselineVersion).toBe(39);
    expect(metadata().baselineCommit).toBe(
      "266b7900294f81e174134337a9d14b5951efcf30"
    );
    expect(releaseConfig.deferredVersions).toEqual([
      40, 41, 42, 43, 44, 45, 46, 47,
    ]);
    expect(isGlowfinReleaseMetadata(metadata({ version: 47 }))).toBe(false);
    expect(isGlowfinReleaseMetadata(metadata({ baselineCommit: "deadbeef" }))).toBe(false);
    expect(isGlowfinReleaseMetadata(metadata({ environment: "production" }))).toBe(true);
  });

  it("rejects ambiguous source fingerprints", () => {
    expect(isGlowfinReleaseMetadata(metadata({ sourceCommit: "local" }))).toBe(false);
    expect(isGlowfinReleaseMetadata(metadata({ sourceCommit: "unknown" }))).toBe(false);
    expect(isGlowfinReleaseMetadata(metadata({ sourceCommit: "ABCDEF1" }))).toBe(false);
  });

  it("formats a compact phone-readable build label", () => {
    expect(formatReleaseLabel(metadata())).toBe("V48 · STAGING · 8f529b9");
    expect(formatReleaseLabel(metadata({
      environment: "local",
      sourceCommit: "local"
    }))).toBe("V48 · LOCAL · local");
  });
});
