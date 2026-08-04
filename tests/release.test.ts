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
    sourceCommit: "3f7ef32c7429d6f28ef772bcfe7f3af08dd323ff",
    ...overrides
  };
}

describe("Version 34 release identity", () => {
  it("accepts only the merged Version 33 Phase 4A baseline contract", () => {
    expect(isGlowfinReleaseMetadata(metadata())).toBe(true);
    expect(isGlowfinReleaseMetadata(metadata({ version: 33 }))).toBe(false);
    expect(isGlowfinReleaseMetadata(metadata({ baselineCommit: "deadbeef" }))).toBe(false);
    expect(isGlowfinReleaseMetadata(metadata({ environment: "production" }))).toBe(true);
  });

  it("rejects ambiguous source fingerprints", () => {
    expect(isGlowfinReleaseMetadata(metadata({ sourceCommit: "local" }))).toBe(true);
    expect(isGlowfinReleaseMetadata(metadata({ sourceCommit: "unknown" }))).toBe(false);
    expect(isGlowfinReleaseMetadata(metadata({ sourceCommit: "ABCDEF1" }))).toBe(false);
  });

  it("formats a compact phone-readable build label", () => {
    expect(formatReleaseLabel(metadata())).toBe("V34 · STAGING · 3f7ef32");
    expect(formatReleaseLabel(metadata({
      environment: "local",
      sourceCommit: "local"
    }))).toBe("V34 · LOCAL · local");
  });
});
