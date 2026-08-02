/**
 * Deterministic CI renderer soak.
 *
 * This advances thirty minutes of simulation through the real GameView/WebGL
 * renderer without pretending desktop Chromium is a physical mobile device.
 * The external sign-off soak remains a separate Android/iOS requirement.
 */

import type { TuningConfig } from "../core/config";
import { FIXED_DT_SEC } from "../core/timestep";
import { CourseGenerator } from "../sim/course";
import { createSimState, stepSim } from "../sim/state";
import type { GameView } from "./gameView";

const KEEP_BEHIND_UNITS = 40;

export interface RendererResourceStats {
  geometries: number;
  textures: number;
}

export interface RendererSoakSnapshot {
  simulatedSeconds: number;
  renderedFrames: number;
  forwardDistance: number;
  remainingGates: number;
  contextLosses: number;
  maxDrawCalls: number;
  maxTriangles: number;
  peakGates: number;
  peakResources: RendererResourceStats;
  resources: RendererResourceStats;
  gpu: string;
  timingMs: {
    simulation: number;
    course: number;
    render: number;
    metrics: number;
  };
}

export class RendererSoakHarness {
  private readonly sim = createSimState();
  private readonly course: CourseGenerator;
  private renderedFrames = 0;
  private contextLosses = 0;
  private maxDrawCalls = 0;
  private maxTriangles = 0;
  private peakGates = 0;
  private peakResources: RendererResourceStats;
  private nextTrailResetSec = 300;
  private readonly timingMs = {
    simulation: 0,
    course: 0,
    render: 0,
    metrics: 0
  };

  constructor(
    private readonly view: GameView,
    private readonly cfg: TuningConfig,
    private readonly renderFps: number,
    targetDurationSec: number,
    canvas: HTMLCanvasElement
  ) {
    const renderDtSec = 1 / renderFps;
    const steps = renderDtSec / FIXED_DT_SEC;
    if (!Number.isInteger(steps) || steps < 1) {
      throw new Error(
        `RendererSoakHarness render FPS must divide the ${1 / FIXED_DT_SEC} Hz simulation rate.`
      );
    }
    this.course = new CourseGenerator(20260731, cfg, {
      profileDistance:
        cfg.speed.forwardAtMaxMomentum * targetDurationSec +
        cfg.readability.visibleAheadUnits * 4
    });
    this.course.ensureGeneratedTo(cfg.readability.visibleAheadUnits * 3);
    this.view.setCaptureEffects("high", true, true);
    this.peakResources = this.view.resourceStats();
    canvas.addEventListener("webglcontextlost", () => {
      this.contextLosses += 1;
    });
  }

  advance(frameCount: number): RendererSoakSnapshot {
    if (!Number.isInteger(frameCount) || frameCount < 0) {
      throw new Error(`Soak frame count must be a non-negative integer, got ${frameCount}.`);
    }
    const stepsPerFrame = Math.round((1 / this.renderFps) / FIXED_DT_SEC);
    const renderDtSec = stepsPerFrame * FIXED_DT_SEC;

    for (let frame = 0; frame < frameCount; frame++) {
      let timingStart = performance.now();
      for (let step = 0; step < stepsPerFrame; step++) {
        const steering =
          Math.sin(this.sim.elapsedSec * 0.31) * 0.72 +
          Math.sin(this.sim.elapsedSec * 0.071) * 0.18;
        stepSim(this.sim, steering, FIXED_DT_SEC, this.cfg);
      }
      this.timingMs.simulation += performance.now() - timingStart;

      timingStart = performance.now();
      this.course.ensureGeneratedTo(
        this.sim.forwardDistance + this.cfg.readability.visibleAheadUnits * 3
      );
      this.course.prune(this.sim.forwardDistance - KEEP_BEHIND_UNITS);
      this.timingMs.course += performance.now() - timingStart;

      if (this.sim.elapsedSec >= this.nextTrailResetSec) {
        this.view.resetTrail();
        this.nextTrailResetSec += 300;
      }

      const lightFraction =
        0.68 + Math.sin(this.sim.elapsedSec * 0.023) * 0.22;
      timingStart = performance.now();
      this.view.render(
        this.sim,
        this.course.gates,
        lightFraction,
        this.sim.elapsedSec,
        renderDtSec
      );
      this.timingMs.render += performance.now() - timingStart;
      this.renderedFrames += 1;

      timingStart = performance.now();
      const render = this.view.stats();
      this.maxDrawCalls = Math.max(this.maxDrawCalls, render.drawCalls);
      this.maxTriangles = Math.max(this.maxTriangles, render.triangles);
      this.peakGates = Math.max(this.peakGates, this.course.gates.length);

      const resources = this.view.resourceStats();
      this.peakResources.geometries = Math.max(
        this.peakResources.geometries,
        resources.geometries
      );
      this.peakResources.textures = Math.max(
        this.peakResources.textures,
        resources.textures
      );
      this.timingMs.metrics += performance.now() - timingStart;
    }

    return this.snapshot();
  }

  snapshot(): RendererSoakSnapshot {
    return {
      simulatedSeconds: this.sim.elapsedSec,
      renderedFrames: this.renderedFrames,
      forwardDistance: this.sim.forwardDistance,
      remainingGates: this.course.gates.length,
      contextLosses: this.contextLosses,
      maxDrawCalls: this.maxDrawCalls,
      maxTriangles: this.maxTriangles,
      peakGates: this.peakGates,
      peakResources: { ...this.peakResources },
      resources: this.view.resourceStats(),
      gpu: this.view.gpuName,
      timingMs: { ...this.timingMs }
    };
  }
}
