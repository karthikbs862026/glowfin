import { describe, it, expect } from "vitest";
import {
  relativeLuminance,
  contrastRatio,
  analyseContrast,
  describeReport
} from "../src/render/contrastAnalysis";
import { tuning } from "../src/core/config";

/**
 * The measurement itself is tested here; the rendering it measures is tested
 * on-device via the probe. A contrast checker that silently measures the wrong
 * thing is worse than having none, because it turns an unknown into false
 * confidence — so these assert the maths against known WCAG values.
 */

/** Build synthetic buffers: a vertical obstacle band on a background. */
function makeBuffers(
  width: number,
  height: number,
  obstacleColour: [number, number, number],
  backgroundColour: [number, number, number],
  bandStart = 20,
  bandEnd = 60
) {
  const beauty = new Uint8Array(width * height * 4);
  const mask = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const inBand = x >= bandStart && x < bandEnd;
      const colour = inBand ? obstacleColour : backgroundColour;
      beauty[i] = colour[0];
      beauty[i + 1] = colour[1];
      beauty[i + 2] = colour[2];
      beauty[i + 3] = 255;
      const m = inBand ? 255 : 0;
      mask[i] = m;
      mask[i + 1] = m;
      mask[i + 2] = m;
      mask[i + 3] = 255;
    }
  }
  return { beauty, mask, width, height };
}

describe("WCAG maths", () => {
  it("black and white are the maximum 21:1", () => {
    const black = relativeLuminance(0, 0, 0);
    const white = relativeLuminance(255, 255, 255);
    expect(contrastRatio(white, black)).toBeCloseTo(21, 1);
  });

  it("a colour against itself is 1:1", () => {
    const l = relativeLuminance(80, 120, 160);
    expect(contrastRatio(l, l)).toBeCloseTo(1, 6);
  });

  it("is symmetric", () => {
    const a = relativeLuminance(10, 20, 30);
    const b = relativeLuminance(200, 180, 160);
    expect(contrastRatio(a, b)).toBeCloseTo(contrastRatio(b, a), 9);
  });

  it("weights green most heavily, as luminance does", () => {
    expect(relativeLuminance(0, 255, 0)).toBeGreaterThan(relativeLuminance(255, 0, 0));
    expect(relativeLuminance(255, 0, 0)).toBeGreaterThan(relativeLuminance(0, 0, 255));
  });
});

describe("silhouette analysis", () => {
  it("finds both edges of an obstacle band", () => {
    const buffers = makeBuffers(100, 20, [255, 255, 255], [0, 0, 0]);
    const report = analyseContrast(buffers, 3, { rowStride: 1 });
    // Two edges per row, 20 rows.
    expect(report.samplesTaken).toBe(40);
  });

  it("passes a high-contrast obstacle", () => {
    const buffers = makeBuffers(100, 20, [240, 250, 255], [4, 6, 15]);
    const report = analyseContrast(buffers, 3, { rowStride: 1 });
    expect(report.passed).toBe(true);
    expect(report.minRatio).toBeGreaterThan(3);
  });

  it("fails an obstacle that blends into the background", () => {
    // The real failure mode: an obstacle only slightly brighter than what is
    // behind it. Perfectly pleasant to look at, unreadable at speed.
    const buffers = makeBuffers(100, 20, [30, 92, 132], [27, 70, 104]);
    const report = analyseContrast(buffers, 3, { rowStride: 1 });
    expect(report.passed).toBe(false);
    expect(report.failures.length).toBeGreaterThan(0);
  });

  it("reports the worst boundary, not the average", () => {
    // One bad edge among many good ones must still fail. Averaging would hide
    // exactly the obstacle that catches a player out.
    const width = 120;
    const height = 4;
    const buffers = makeBuffers(width, height, [240, 250, 255], [4, 6, 15], 20, 60);
    // Darken the background on one row only, next to the right-hand edge.
    const badRow = 2;
    for (let x = 60; x < 70; x++) {
      const i = (badRow * width + x) * 4;
      buffers.beauty[i] = 235;
      buffers.beauty[i + 1] = 245;
      buffers.beauty[i + 2] = 250;
    }
    const report = analyseContrast(buffers, 3, { rowStride: 1 });
    expect(report.passed).toBe(false);
    expect(report.minRatio).toBeLessThan(report.medianRatio);
  });

  it("treats zero samples as a broken probe, not a pass", () => {
    // "No failures" and "no measurements" must never look the same.
    const width = 20;
    const height = 4;
    const beauty = new Uint8Array(width * height * 4);
    const mask = new Uint8Array(width * height * 4);
    const report = analyseContrast({ beauty, mask, width, height }, 3);
    expect(report.samplesTaken).toBe(0);
    expect(report.passed).toBe(false);
    expect(describeReport("probe", report, 3)).toMatch(/NO SAMPLES/);
  });

  it("steps away from the antialiased edge pixel", () => {
    // Sampling the boundary pixel itself blends both sides and reports a
    // flattering ratio no player ever sees.
    const width = 100;
    const height = 4;
    const buffers = makeBuffers(width, height, [255, 255, 255], [0, 0, 0], 30, 70);
    // Write a mid-grey seam right at each edge.
    for (let y = 0; y < height; y++) {
      for (const x of [29, 30, 69, 70]) {
        const i = (y * width + x) * 4;
        buffers.beauty[i] = 128;
        buffers.beauty[i + 1] = 128;
        buffers.beauty[i + 2] = 128;
      }
    }
    const report = analyseContrast(buffers, 3, { rowStride: 1, offsetPx: 3 });
    // With the seam skipped this should still read as near-maximum contrast.
    expect(report.minRatio).toBeGreaterThan(15);
  });

  it("uses the farthest valid inset on a low-resolution contour", () => {
    const buffers = makeBuffers(40, 8, [255, 255, 255], [0, 0, 0], 18, 21);
    const report = analyseContrast(buffers, 3, { rowStride: 1, offsetPx: 3 });
    expect(report.samplesTaken).toBe(16);
    expect(report.minRatio).toBeGreaterThan(15);
  });

  it("measures a one-pixel contour from firmly classified transition pixels", () => {
    const buffers = makeBuffers(40, 8, [255, 255, 255], [0, 0, 0], 20, 21);
    const report = analyseContrast(buffers, 3, { rowStride: 1, offsetPx: 3 });
    expect(report.samplesTaken).toBe(16);
    expect(report.passed).toBe(true);
  });

  it("bridges a one-pixel antialias class without accepting wide context", () => {
    const buffers = makeBuffers(40, 8, [255, 255, 255], [0, 0, 0], 20, 21);
    for (let y = 0; y < buffers.height; y++) {
      for (const x of [19, 21]) {
        const i = (y * buffers.width + x) * 4;
        buffers.mask[i] = 128;
        buffers.mask[i + 1] = 128;
        buffers.mask[i + 2] = 128;
      }
    }
    const report = analyseContrast(buffers, 3, { rowStride: 1, offsetPx: 3 });
    expect(report.samplesTaken).toBe(16);
    expect(report.passed).toBe(true);
  });
});

describe("three-state mask (distant obstacles)", () => {
  /**
   * Regression for a real bug: a binary mask made obstacles beyond the reaction
   * window read as background, so a near wall silhouetted against a far wall
   * scored ~1:1 and looked like a catastrophic contrast failure. It was a
   * measurement artefact — two walls are nearly the same colour.
   */
  function threeStateBuffers(width: number, height: number) {
    const beauty = new Uint8Array(width * height * 4);
    const mask = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        // 0-40 near wall (measurable), 40-80 far wall (ignore), 80+ background.
        const maskValue = x < 40 ? 255 : x < 80 ? 128 : 0;
        // Both walls are the same colour — that is the whole point.
        const colour = x < 80 ? [30, 76, 110] : [4, 6, 15];
        beauty[i] = colour[0] ?? 0;
        beauty[i + 1] = colour[1] ?? 0;
        beauty[i + 2] = colour[2] ?? 0;
        beauty[i + 3] = 255;
        mask[i] = maskValue;
        mask[i + 1] = maskValue;
        mask[i + 2] = maskValue;
        mask[i + 3] = 255;
      }
    }
    return { beauty, mask, width, height };
  }

  it("ignores the boundary between a near and a distant obstacle", () => {
    const report = analyseContrast(threeStateBuffers(120, 8), 3, { rowStride: 1 });
    // The near/far wall boundary at x=40 must not be measured at all. Nothing
    // else in this image is a measurable-obstacle-to-background edge.
    expect(report.samplesTaken).toBe(0);
  });

  it("still measures a genuine obstacle-to-background edge", () => {
    const width = 120;
    const height = 8;
    const buffers = threeStateBuffers(width, height);
    // Turn the far wall into background so x=40 becomes a real silhouette.
    for (let y = 0; y < height; y++) {
      for (let x = 40; x < 80; x++) {
        const i = (y * width + x) * 4;
        buffers.mask[i] = 0;
        buffers.mask[i + 1] = 0;
        buffers.mask[i + 2] = 0;
        buffers.beauty[i] = 4;
        buffers.beauty[i + 1] = 6;
        buffers.beauty[i + 2] = 15;
      }
    }
    const report = analyseContrast(buffers, 3, { rowStride: 1 });
    expect(report.samplesTaken).toBeGreaterThan(0);
  });
});

describe("acceptance rule: p10, not strict minimum (ADR-0012)", () => {
  /** Build buffers whose boundary samples have a prescribed set of ratios. */
  function buffersWithFailingFraction(rows: number, badRows: number) {
    const width = 120;
    const height = rows;
    const beauty = new Uint8Array(width * height * 4);
    const mask = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) {
      const bad = y < badRows;
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const inBand = x >= 40 && x < 80;
        // Bad rows: obstacle barely differs from background. Good rows: stark.
        const colour = inBand
          ? bad
            ? [34, 80, 116]
            : [240, 250, 255]
          : [28, 70, 104];
        beauty[i] = colour[0] ?? 0;
        beauty[i + 1] = colour[1] ?? 0;
        beauty[i + 2] = colour[2] ?? 0;
        beauty[i + 3] = 255;
        const m = inBand ? 255 : 0;
        mask[i] = m;
        mask[i + 1] = m;
        mask[i + 2] = m;
        mask[i + 3] = 255;
      }
    }
    return { beauty, mask, width, height };
  }

  it("tolerates a small fraction of weak samples", () => {
    // 1 bad row in 20 = 5% of samples. A lone scanline crossing at one pixel
    // is not an unreadable obstacle.
    const report = analyseContrast(buffersWithFailingFraction(20, 1), 3, { rowStride: 1 });
    expect(report.failures.length).toBeGreaterThan(0);
    expect(report.passed).toBe(true);
  });

  it("still rejects a genuinely unreadable obstacle", () => {
    // 50% of samples weak — the shape of every real defect this probe found.
    const report = analyseContrast(buffersWithFailingFraction(20, 10), 3, { rowStride: 1 });
    expect(report.passed).toBe(false);
  });

  it("rejects the historical failure profiles that prompted the fixes", () => {
    // Round 1 measured ~76% of samples below the floor; round 3 ~24%. Both must
    // still fail, or the relaxed rule would have hidden the real bugs.
    expect(analyseContrast(buffersWithFailingFraction(25, 19), 3, { rowStride: 1 }).passed).toBe(false);
    expect(analyseContrast(buffersWithFailingFraction(25, 6), 3, { rowStride: 1 }).passed).toBe(false);
  });

  it("keeps reporting failing samples even when the run passes", () => {
    // Drift toward the limit must stay visible before it becomes a failure.
    const report = analyseContrast(buffersWithFailingFraction(20, 1), 3, { rowStride: 1 });
    expect(report.passed).toBe(true);
    expect(report.failures.length).toBeGreaterThan(0);
    expect(report.minRatio).toBeLessThan(3);
  });
});

describe("the configured floor", () => {
  it("is defined and demanding enough to mean something", () => {
    expect(tuning.readability.minObstacleContrastRatio).toBeGreaterThanOrEqual(3);
  });
});
