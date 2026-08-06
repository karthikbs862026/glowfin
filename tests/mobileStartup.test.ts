import { describe, expect, it } from "vitest";
import {
  initialMobileQualityTier,
  initialRendererPixelRatioCap,
  shouldStartMobileSafe
} from "../src/perf/mobileStartup";

describe("mobile startup quality", () => {
  it("starts touch-first devices at the safe tier before adaptive sampling", () => {
    const phone = {
      coarsePointer: true,
      viewportWidth: 412,
      viewportHeight: 915
    };
    expect(shouldStartMobileSafe(phone)).toBe(true);
    expect(initialMobileQualityTier(phone)).toBe("low");
    expect(initialRendererPixelRatioCap(true)).toBe(1);
  });

  it("also protects narrow windows even when pointer detection is unavailable", () => {
    expect(initialMobileQualityTier({
      coarsePointer: false,
      viewportWidth: 800,
      viewportHeight: 1280
    })).toBe("low");
  });

  it("keeps the full tier and DPR cap for wide fine-pointer displays", () => {
    const desktop = {
      coarsePointer: false,
      viewportWidth: 1440,
      viewportHeight: 1000
    };
    expect(shouldStartMobileSafe(desktop)).toBe(false);
    expect(initialMobileQualityTier(desktop)).toBe("high");
    expect(initialRendererPixelRatioCap(false)).toBe(2);
  });
});
