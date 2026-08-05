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

describe("Version 41 release identity", () => {
  it("accepts only Version 41 built from Version 39 with Version 40 explicitly deferred", () => {
    expect(isGlowfinReleaseMetadata(metadata())).toBe(true);
    expect(metadata().certification).toBe("automated-candidate");
    expect(metadata().phase).toBe("phase-living-current-vertical-slice");
    expect(metadata().baselineVersion).toBe(39);
    expect(metadata().deferredVersions).toEqual([40]);
    expect(isGlowfinReleaseMetadata(metadata({ version: 40 }))).toBe(false);
    expect(isGlowfinReleaseMetadata(metadata({ baselineCommit: "deadbeef" }))).toBe(false);
    expect(isGlowfinReleaseMetadata(metadata({ deferredVersions: [] }))).toBe(false);
    expect(isGlowfinReleaseMetadata(metadata({ deferredVersions: [40, 40] }))).toBe(false);
    expect(isGlowfinReleaseMetadata(metadata({ deferredVersions: [39, 40] }))).toBe(false);
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
