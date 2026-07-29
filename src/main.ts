/**
 * Phase 1.5 — the core loop, playable.
 *
 * Wires the deterministic simulation (Run) to the primitive renderer and touch
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

const canvas = document.querySelector<HTMLCanvasElement>("#glowfin-canvas");
if (!canvas) throw new Error("Canvas #glowfin-canvas not found");

const view = new GameView(canvas, tuning);
const hud = new Hud();
const steering = new SteeringSource({
  dragRangeFraction: tuning.input.dragRangeFraction,
  sensitivity: tuning.input.sensitivity,
  deadZone: tuning.input.deadZone
});
attachPointerInput(canvas, steering);

const timestep = new FixedTimestepRunner(FIXED_DT_SEC);
let run = new Run(generateSeed(), tuning);
let awaitingRestart = false;

function startRun(): void {
  run = new Run(generateSeed(), tuning);
  awaitingRestart = false;
  steering.reset();
  timestep.reset();
  hud.hideGameOver();
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
  view.render(run.sim, run.gates, lightFraction);
  hud.update(run.scoring.score, run.scoring.multiplier, lightFraction);

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
