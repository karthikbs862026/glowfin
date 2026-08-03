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
    sourceCommit: "4e797b44053bca96fd9dfb1bbb637dbe88653219",
    ...overrides
  };
}

describe("Version 31 release identity", () => {
  it("accepts only the frozen Phase 3 baseline contract", () => {
    expect(isGlowfinReleaseMetadata(metadata())).toBe(true);
    expect(isGlowfinReleaseMetadata(metadata({ version: 30 }))).toBe(false);
    expect(isGlowfinReleaseMetadata(metadata({ baselineCommit: "deadbeef" }))).toBe(false);
    expect(isGlowfinReleaseMetadata(metadata({ environment: "production" }))).toBe(true);
  });

  it("rejects ambiguous source fingerprints", () => {
    expect(isGlowfinReleaseMetadata(metadata({ sourceCommit: "local" }))).toBe(true);
    expect(isGlowfinReleaseMetadata(metadata({ sourceCommit: "unknown" }))).toBe(false);
    expect(isGlowfinReleaseMetadata(metadata({ sourceCommit: "ABCDEF1" }))).toBe(false);
  });

  it("formats a compact phone-readable build label", () => {
    expect(formatReleaseLabel(metadata())).toBe("V31 · STAGING · 4e797b4");
    expect(formatReleaseLabel(metadata({
      environment: "local",
      sourceCommit: "local"
    }))).toBe("V31 · LOCAL · local");
  });
});
