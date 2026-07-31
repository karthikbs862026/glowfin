import { describe, expect, it } from "vitest";
import { tuning } from "../src/core/config";
import type { GameView } from "../src/render/gameView";
import { RendererSoakHarness } from "../src/render/soakHarness";

function fakeView(): GameView {
  return {
    gpuName: "unit-test-gpu",
    setCaptureEffects: () => undefined,
    resourceStats: () => ({ geometries: 42, textures: 5 }),
    resetTrail: () => undefined,
    render: () => undefined,
    stats: () => ({ drawCalls: 40, triangles: 68_000 })
  } as unknown as GameView;
}

describe("renderer soak harness", () => {
  it("advances fixed simulation time through one render call per frame", () => {
    const canvas = new EventTarget() as HTMLCanvasElement;
    const harness = new RendererSoakHarness(
      fakeView(),
      tuning,
      10,
      3,
      canvas
    );

    const snapshot = harness.advance(30);
    expect(snapshot.renderedFrames).toBe(30);
    expect(snapshot.simulatedSeconds).toBeCloseTo(3, 8);
    expect(snapshot.forwardDistance).toBeGreaterThan(0);
    expect(snapshot.maxDrawCalls).toBe(40);
    expect(snapshot.maxTriangles).toBe(68_000);
    expect(snapshot.resources).toEqual({ geometries: 42, textures: 5 });
    expect(snapshot.peakResources).toEqual(snapshot.resources);
  });

  it("records context loss and rejects invalid frame batches", () => {
    const canvas = new EventTarget() as HTMLCanvasElement;
    const harness = new RendererSoakHarness(
      fakeView(),
      tuning,
      30,
      1,
      canvas
    );
    canvas.dispatchEvent(new Event("webglcontextlost"));

    expect(harness.snapshot().contextLosses).toBe(1);
    expect(() => harness.advance(-1)).toThrow(/non-negative integer/);
  });
});
