import { describe, expect, it } from "vitest";
import {
  buildLivingDistrictStage,
  LIVING_DISTRICT_CONTRACT
} from "../src/art/livingDistrict";

describe("gate-linked living district contract", () => {
  it("guarantees a tall two-layer court on both sides of every gate family", () => {
    for (const gateFamily of [0, 1, 2, 3, 4] as const) {
      const stage = buildLivingDistrictStage(gateFamily, 1);
      expect(stage.architecture).toHaveLength(
        LIVING_DISTRICT_CONTRACT.prominentArchitecturePerSide * 2
      );
      for (const side of [-1, 1] as const) {
        const sideArchitecture = stage.architecture.filter(
          (placement) => placement.side === side
        );
        expect(sideArchitecture).toHaveLength(
          LIVING_DISTRICT_CONTRACT.prominentArchitecturePerSide
        );
        expect(Math.max(...sideArchitecture.map((item) => item.desiredHeight)))
          .toBeGreaterThanOrEqual(7.5);
      }
    }
  });

  it("keeps the Nacre Palace and archless observatory visually explicit", () => {
    const palace = buildLivingDistrictStage(3, -1);
    const observatory = buildLivingDistrictStage(4, 1);
    expect(palace.architecture.filter((item) => item.familyIndex === 3))
      .toHaveLength(2);
    expect(observatory.architecture.filter((item) => item.familyIndex === 4))
      .toHaveLength(2);
  });

  it("guarantees monuments, paired tide-spears and a conch fountain", () => {
    const stage = buildLivingDistrictStage(0, 1);
    const counts = stage.props.reduce<Record<number, number>>((result, item) => {
      result[item.familyIndex] = (result[item.familyIndex] ?? 0) + 1;
      return result;
    }, {});
    expect(counts[0]).toBe(
      LIVING_DISTRICT_CONTRACT.guaranteedPropCounts.monument
    );
    expect(counts[1]).toBe(
      LIVING_DISTRICT_CONTRACT.guaranteedPropCounts.tideSpear
    );
    expect(counts[2]).toBe(
      LIVING_DISTRICT_CONTRACT.guaranteedPropCounts.conchFountain
    );
  });

  it("fits all larger ambient-life counts inside fixed instance pools", () => {
    const { life } = LIVING_DISTRICT_CONTRACT;
    expect(life.fishPerSchool * life.maximumFishSchools)
      .toBeLessThanOrEqual(life.fishPool);
    expect(life.maximumJellies).toBeLessThanOrEqual(life.jellyPool);
    expect(life.maximumRays).toBeLessThanOrEqual(life.rayPool);
  });

  it("reserves more lane clearance than the full coral sway envelope", () => {
    const { reef } = LIVING_DISTRICT_CONTRACT;
    expect(reef.laneSafetyWorldUnits - reef.maximumSwayWorldUnits)
      .toBeGreaterThanOrEqual(0.2);
    expect(reef.travellingWaveSpeed).toBeGreaterThan(1);
    expect(reef.signatureHeightBoost).toHaveLength(6);
    expect(reef.signatureWidthBoost).toHaveLength(6);
    expect(Math.min(...reef.signatureHeightBoost)).toBeGreaterThan(1);
    expect(Math.min(...reef.signatureWidthBoost)).toBeGreaterThan(1);
    expect(reef.signatureRadiusWorldUnits).toBeGreaterThanOrEqual(16);
  });
});
