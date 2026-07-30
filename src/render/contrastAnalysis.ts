/**
 * Obstacle contrast measurement (Part 3.4, Part 6.5).
 *
 * Part 6.5 calls this "the one visual test that is a *fairness* test, not an
 * aesthetics test", and Part 3.4 makes the contrast floor a hard requirement
 * rather than an art preference. An obstacle the player cannot pick out from
 * what is behind it is a Core Design Principle violation dressed as a look.
 *
 * This module is deliberately pure: it takes two pixel buffers (the beauty
 * render and an obstacle mask) and returns numbers. No WebGL, no DOM. That
 * makes the measurement itself unit-testable, which matters — a contrast
 * checker that silently measures the wrong thing is worse than none, because
 * it converts an unknown into false confidence.
 */

export interface ContrastSample {
  /** WCAG contrast ratio at this silhouette boundary. */
  ratio: number;
  x: number;
  y: number;
  /** Luminance inside the obstacle, so a failure can be attributed. */
  insideLuminance: number;
  /** Luminance outside it. */
  outsideLuminance: number;
}

export interface ContrastReport {
  samplesTaken: number;
  /**
   * Worst single sample. Reported, but deliberately NOT the pass condition —
   * see the acceptance rule below and ADR-0012.
   */
  minRatio: number;
  /** 10th percentile — a lone unlucky pixel should not read the same as a whole dark region. */
  p10Ratio: number;
  medianRatio: number;
  /** Samples below the configured floor. */
  failures: ContrastSample[];
  /** Raw deterministic edge ratios used by the Phase 3A capture gate. */
  ratios: number[];
  passed: boolean;
}

/** sRGB channel (0-255) to linear. */
function toLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance. */
export function relativeLuminance(r: number, g: number, b: number): number {
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** WCAG contrast ratio between two luminances. */
export function contrastRatio(a: number, b: number): number {
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

interface Buffers {
  /** RGBA, 4 bytes per pixel, row-major from top-left. */
  beauty: Uint8Array;
  /** RGBA; obstacle pixels are white, everything else black. */
  mask: Uint8Array;
  width: number;
  height: number;
}

/**
 * The mask encodes three states, not two (see GameView's mask shader):
 *   ~255  obstacle inside the reaction window — measurable
 *   ~128  obstacle beyond the window — must be ignored, NOT treated as background
 *   ~0    true background
 */
function isMeasurableObstacle(mask: Uint8Array, index: number): boolean {
  return (mask[index] ?? 0) > 200;
}

function isBackground(mask: Uint8Array, index: number): boolean {
  return (mask[index] ?? 0) < 60;
}

function luminanceAt(beauty: Uint8Array, index: number): number {
  return relativeLuminance(
    beauty[index] ?? 0,
    beauty[index + 1] ?? 0,
    beauty[index + 2] ?? 0
  );
}

/**
 * Walk each row looking for mask transitions, and at every one compare the
 * beauty render a short distance either side.
 *
 * `offsetPx` steps away from the exact edge on purpose: the boundary pixel
 * itself is antialiased and blends both sides, which would report a flattering
 * contrast that no player ever sees.
 */
/**
 * Fraction of boundary samples allowed to fall below the floor.
 *
 * A boundary sample is one scanline crossing one edge at one pixel. Requiring
 * every single one to clear the floor makes a lone pixel — at an obstacle
 * corner, or where a caustic peak happens to align — equivalent to an entire
 * unreadable obstacle. A player perceives the edge, not the pixel.
 *
 * 10% is strict enough to have rejected every real defect this probe found:
 * those failed with 24-76% of samples below the floor, which this rejects
 * decisively. See ADR-0012 for why this was changed and when.
 */
const ALLOWED_FAILURE_FRACTION = 0.1;

export function analyseContrast(
  buffers: Buffers,
  minimumRatio: number,
  options: { offsetPx?: number; rowStride?: number } = {}
): ContrastReport {
  const offset = options.offsetPx ?? 3;
  const rowStride = options.rowStride ?? 4;
  const { beauty, mask, width, height } = buffers;

  const ratios: number[] = [];
  const failures: ContrastSample[] = [];

  for (let y = 0; y < height; y += rowStride) {
    const rowStart = y * width * 4;
    for (let x = offset; x < width - offset - 1; x++) {
      const here = rowStart + x * 4;
      const next = rowStart + (x + 1) * 4;

      // Only measure where a measurable obstacle meets true background.
      // Obstacle-to-obstacle and obstacle-to-distant-obstacle edges are skipped:
      // the first is not a silhouette against the world, and the second is an
      // obstacle the player is not yet expected to read.
      const hereObstacle = isMeasurableObstacle(mask, here);
      const nextObstacle = isMeasurableObstacle(mask, next);
      if (hereObstacle === nextObstacle) continue;
      if (hereObstacle && !isBackground(mask, next)) continue;
      if (nextObstacle && !isBackground(mask, here)) continue;

      const insideIndex = rowStart + (hereObstacle ? x - offset : x + 1 + offset) * 4;
      const outsideIndex = rowStart + (hereObstacle ? x + 1 + offset : x - offset) * 4;

      // Both probe points must still be firmly on their own side of the edge.
      if (!isMeasurableObstacle(mask, insideIndex)) continue;
      if (!isBackground(mask, outsideIndex)) continue;

      const insideLuminance = luminanceAt(beauty, insideIndex);
      const outsideLuminance = luminanceAt(beauty, outsideIndex);
      const ratio = contrastRatio(insideLuminance, outsideLuminance);
      ratios.push(ratio);
      if (ratio < minimumRatio) {
        failures.push({ ratio, x, y, insideLuminance, outsideLuminance });
      }
    }
  }

  if (ratios.length === 0) {
    return {
      samplesTaken: 0,
      minRatio: 0,
      p10Ratio: 0,
      medianRatio: 0,
      failures: [],
      ratios: [],
      passed: false
    };
  }

  const sorted = [...ratios].sort((a, b) => a - b);
  return {
    samplesTaken: ratios.length,
    minRatio: sorted[0] ?? 0,
    p10Ratio: sorted[Math.floor(sorted.length * 0.1)] ?? 0,
    medianRatio: sorted[Math.floor(sorted.length / 2)] ?? 0,
    failures,
    ratios: sorted,
    // Pass when the 10th percentile clears the floor: at least 90% of the
    // silhouette is readable. Not "no sample ever dips below".
    passed: (sorted[Math.floor(sorted.length * ALLOWED_FAILURE_FRACTION)] ?? 0) >= minimumRatio
  };
}

/**
 * Zero samples means the probe found no obstacle edges at all — a broken probe,
 * not a clean pass. Reported explicitly because "no failures" and "no
 * measurements" are indistinguishable in a naive pass/fail and the second one
 * is much worse.
 */
export function describeReport(label: string, report: ContrastReport, minimum: number): string {
  if (report.samplesTaken === 0) {
    return `${label}: NO SAMPLES — probe found no obstacle edges (this is a broken probe, not a pass)`;
  }
  const verdict = report.passed
    ? `PASS`
    : `FAIL (p10 ${report.p10Ratio.toFixed(2)} < ${minimum})`;
  const summary =
    `${label}: ${verdict}  min ${report.minRatio.toFixed(2)}  ` +
    `p10 ${report.p10Ratio.toFixed(2)}  med ${report.medianRatio.toFixed(2)}  n=${report.samplesTaken}`;

  if (report.failures.length === 0) return summary;
  // Failing samples are still listed even on a pass, so a drift toward the
  // limit is visible before it becomes a failure.

  // Attribute the failures instead of speculating about them. Two rounds of
  // plausible-sounding hypotheses (fog, then emissive lane markers) both turned
  // out to be wrong, so the probe now reports what is actually at those pixels.
  const worst = [...report.failures].sort((a, b) => a.ratio - b.ratio).slice(0, 3);
  const detail = worst
    .map(
      (f) =>
        `      (${f.x},${f.y}) in ${f.insideLuminance.toFixed(3)} ` +
        `out ${f.outsideLuminance.toFixed(3)} = ${f.ratio.toFixed(2)}`
    )
    .join("\n");
  return `${summary}\n${detail}`;
}
