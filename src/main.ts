/**
 * Phase 1.5 — the core loop, playable.
 *
 * Wires the deterministic simulation (Run) to the production renderer and touch
 * input. Everything gameplay-relevant lives in src/sim; this file only owns the
 * frame loop, the time scale, and restart.
 */
import { tuning } from "./core/config";
import { FIXED_DT_SEC, FixedTimestepRunner } from "./core/timestep";
import { SteeringSource, attachPointerInput } from "./input/steering";
import { generateSeed } from "./core/rng";
import { Run } from "./sim/run";
import { GameView } from "./render/gameView";
import { Hud } from "./render/hud";
import { DebugOverlay } from "./render/debugOverlay";
import { QualityController } from "./perf/quality";
import { PerfMonitor, checkBudgets } from "./perf/metrics";
import { GlowfinAudio } from "./audio/audioEngine";
import { mountReleaseIdentity } from "./release";

const canvas = document.querySelector<HTMLCanvasElement>("#glowfin-canvas");
if (!canvas) throw new Error("Canvas #glowfin-canvas not found");

mountReleaseIdentity();

const view = new GameView(canvas, tuning);
const hud = new Hud();
const audio = new GlowfinAudio(tuning);
const steering = new SteeringSource({
  dragRangeFraction: tuning.input.dragRangeFraction,
  sensitivity: tuning.input.sensitivity,
  deadZone: tuning.input.deadZone
});
attachPointerInput(canvas, steering);

const quality = new QualityController();
const perf = new PerfMonitor();
const overlay = new DebugOverlay();
view.setQuality(quality.settings);

const timestep = new FixedTimestepRunner(FIXED_DT_SEC);
let run = new Run(generateSeed(), tuning);
let awaitingRestart = false;

function startRun(): void {
  run = new Run(generateSeed(), tuning);
  awaitingRestart = false;
  steering.reset();
  timestep.reset();
  view.resetTrail();
  hud.hideGameOver();
  audio.resetRun(run.scoring.multiplier);
}

// Restart on tap once the run has ended. Registered on the document rather than
// the canvas so a tap on the game-over panel also counts.
document.addEventListener("pointerdown", () => {
  if (awaitingRestart) startRun();
});

// A backgrounded tab hands back a huge frame time and a finger that is no
// longer down (Part 2.1). Drop both rather than simulating the gap.
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    timestep.reset();
    lastFrameMs = performance.now();
  }
});

// Losing the WebGL context currently pauses rather than rebuilding. Full
// resource rebuild is Phase 5 (Part 4.3) — preventing the default at least
// keeps the browser from tearing the canvas down permanently.
canvas.addEventListener("webglcontextlost", (event) => {
  event.preventDefault();
  console.warn("WebGL context lost — rebuild is not implemented until Phase 5");
});

let lastFrameMs = performance.now();

function frame(nowMs: number): void {
  const frameSec = (nowMs - lastFrameMs) / 1000;
  lastFrameMs = nowMs;

  // Slow-mo is applied to wall-clock time before it reaches the accumulator, so
  // the simulation itself always steps at a fixed dt (ADR-0006).
  timestep.advance(frameSec * run.timeScale, (dt) => {
    const events = run.step(dt, steering.getTarget());
    audio.consumeStep(
      events,
      run.sim.stunRemainingSec,
      run.scoring.multiplier
    );
    if (events.justEnded) {
      awaitingRestart = true;
      hud.showGameOver(
        run.scoring.score,
        run.sim.elapsedSec,
        run.scoring.nearMissCount,
        run.collisionCount
      );
    }
  });

  const lightFraction = run.light / tuning.light.max;
  view.render(run.sim, run.gates, lightFraction, run.sim.elapsedSec, frameSec);
  const momentumFraction =
    tuning.momentum.ceiling === 0 ? 0 : run.sim.momentum / tuning.momentum.ceiling;
  audio.update(momentumFraction, lightFraction);
  hud.update(
    run.scoring.score,
    run.scoring.multiplier,
    lightFraction,
    momentumFraction,
    tuning.creature.eyeHueCalm,
    tuning.creature.eyeHueCruise,
    tuning.creature.eyeHueFast,
    tuning.creature.eyeHueMax
  );

  // --- performance (Part 4.6 / 6.8) ---
  // Frame time is measured in wall clock, not simulated time: slow-mo makes the
  // sim advance more slowly but costs the GPU exactly the same, so using
  // simulated time here would quietly hide cost during every near-miss.
  const frameMs = frameSec * 1000;
  perf.record(frameMs);
  const change = quality.recordFrame(frameMs);
  if (change) {
    view.setQuality(quality.settings);
    console.info(`Quality ${change.from} -> ${change.to} (${change.reason})`);
  }

  if (import.meta.env.DEV) {
    const stats = view.stats();
    const sample = perf.sample(stats.drawCalls, stats.triangles, view.gpuName);
    overlay.update(sample, quality.current, checkBudgets(sample));
  }

  requestAnimationFrame(frame);
}

/**
 * Contrast probe mode (Part 3.4 / 6.5), opened with `?probe=contrast`.
 *
 * Measures obstacle silhouette contrast against whatever sits behind it, with
 * every effect enabled, at low/mid/max momentum, then reports pass/fail. Runs
 * instead of the game rather than alongside it, so nothing is competing for the
 * framebuffer while pixels are being read back.
 *
 * Dev-only: `import.meta.env.DEV` is replaced with a literal at build time, so
 * this whole branch is tree-shaken out of production (Part 6.10).
 */
function isProbeRequested(): boolean {
  if (!import.meta.env.DEV) return false;
  return new URLSearchParams(window.location.search).get("probe") === "contrast";
}

async function start(): Promise<void> {
  await view.ready;

  if (isProbeRequested()) {
    const {
      runContrastProbe,
      showProbeResult
    } = await import("./render/contrastProbe");
    const result = runContrastProbe(view, tuning);
    showProbeResult(result);
    console.info(result.lines.join("\n"));
    return;
  }

  requestAnimationFrame(frame);
}

void start();
