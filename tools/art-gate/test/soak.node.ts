import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  checkRendererSoak,
  type RendererSoakEvidence,
  type RendererSoakLimits
} from "../src/soak.ts";

const limits: RendererSoakLimits = {
  minimumSimulatedMinutes: 30,
  maxSteadyStateHeapMB: 220,
  maxHeapGrowthMB: 60,
  maxDrawCalls: 90,
  maxTriangles: 150_000,
  maxPools: {
    gates: 16,
    stripes: 40,
    trailSegments: 96,
    particles: 128
  }
};

function cleanEvidence(): RendererSoakEvidence {
  return {
    evidenceVersion: "1.0.0",
    runtimeRevision: "fixture",
    source: {
      kind: "ci-emulated",
      browser: "Chromium fixture",
      platform: "linux"
    },
    simulatedMinutes: 30,
    renderFps: 30,
    renderedFrames: 54_000,
    wallClockSeconds: 120,
    simulation: {
      elapsedSeconds: 1800,
      forwardDistance: 72_000,
      remainingGates: 12
    },
    memory: {
      baselineHeapMB: 48,
      endHeapMB: 52,
      peakHeapMB: 71,
      growthHeapMB: 4
    },
    renderer: {
      gpu: "fixture",
      contextLosses: 0,
      maxDrawCalls: 40,
      maxTriangles: 68_000,
      baselineResources: { geometries: 42, textures: 5 },
      peakResources: { geometries: 42, textures: 5 },
      endResources: { geometries: 42, textures: 5 }
    },
    peakPools: {
      gates: 14,
      stripes: 40,
      trailSegments: 96,
      particles: 0
    }
  };
}

function codes(evidence: RendererSoakEvidence): string[] {
  return checkRendererSoak(evidence, limits).map((finding) => finding.code);
}

describe("deterministic renderer soak gate", () => {
  test("accepts complete stable evidence", () => {
    assert.deepEqual(checkRendererSoak(cleanEvidence(), limits), []);
  });

  test("rejects short or under-rendered evidence", () => {
    const short = cleanEvidence();
    short.simulatedMinutes = 29;
    assert.ok(codes(short).includes("SOAK_DURATION_INSUFFICIENT"));

    const skipped = cleanEvidence();
    skipped.renderedFrames = 53_999;
    assert.ok(codes(skipped).includes("SOAK_RENDER_COVERAGE_INCOMPLETE"));
  });

  test("rejects heap and GPU resource growth", () => {
    const heap = cleanEvidence();
    heap.memory.growthHeapMB = 61;
    assert.ok(codes(heap).includes("SOAK_HEAP_GROWTH_OVER_BUDGET"));

    const gpu = cleanEvidence();
    gpu.renderer.endResources.geometries += 1;
    assert.ok(codes(gpu).includes("SOAK_GPU_RESOURCE_GROWTH"));
  });

  test("rejects context loss, scene overruns and pool overruns", () => {
    const broken = cleanEvidence();
    broken.renderer.contextLosses = 1;
    broken.renderer.maxDrawCalls = 91;
    broken.renderer.maxTriangles = 150_001;
    broken.peakPools.gates = 17;
    const found = codes(broken);
    assert.ok(found.includes("SOAK_WEBGL_CONTEXT_LOST"));
    assert.ok(found.includes("SOAK_DRAW_CALLS_OVER_BUDGET"));
    assert.ok(found.includes("SOAK_TRIANGLES_OVER_BUDGET"));
    assert.ok(found.includes("SOAK_POOL_CAP_EXCEEDED"));
  });
});
