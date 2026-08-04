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
import {
  ProgressRepository,
  type GlowfinProgressV1
} from "./persistence/progress";
import {
  CloudProgressConflict,
  HostedProgressClient
} from "./persistence/cloud";
import {
  ReplayPlayer,
  ReplayRecorder,
  type ReplaySummary,
  validateReplay
} from "./replay/replay";
import {
  createRunId,
  HostedTelemetryTransport,
  TelemetryClient
} from "./telemetry/telemetry";

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
const progressStorage = (() => {
  try {
    return window.localStorage;
  } catch {
    const memory = new Map<string, string>();
    return {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => { memory.set(key, value); }
    };
  }
})();
const progressRepository = new ProgressRepository(progressStorage);
const progressLoad = progressRepository.load();
let progress: GlowfinProgressV1 = progressLoad.progress;
const telemetry = new TelemetryClient(
  progress.telemetryConsent,
  new HostedTelemetryTransport()
);
const cloudProgress = new HostedProgressClient();

let cloudRevision = 0;
let cloudSyncInFlight: Promise<void> | null = null;
let cloudSyncRequested = false;
let run = new Run(generateSeed(), tuning);
let recorder = new ReplayRecorder(run.seed, tuning.version);
let activeRunId = createRunId();
let activeRunMode: "fresh" | "ghost" = "fresh";
let simulationSteps = 0;
let ghostRun: Run | null = null;
let ghostReplay: ReplayPlayer | null = null;
let ghostVisible = false;
let ghostCompletionReported = false;
let awaitingRestart = false;

hud.setBestScore(progress.bestScore);
hud.setTelemetryConsent(progress.telemetryConsent);

if (progress.telemetryConsent === "granted") {
  telemetry.track("session_start", {
    release: 32,
    tuningVersion: tuning.version,
    saveSchemaVersion: progress.schemaVersion
  });
  if (progressLoad.recoveryReason) {
    telemetry.track("save_recovered", {
      source: progressLoad.recoveredFrom,
      reason: progressLoad.recoveryReason
    });
  }
}

function raceableReplay() {
  const replay = progress.bestReplay;
  return replay &&
    replay.tuningVersion === tuning.version &&
    validateReplay(replay).valid
    ? replay
    : null;
}

function updateProgressUi(): void {
  hud.setBestScore(progress.bestScore);
  hud.setTelemetryConsent(progress.telemetryConsent);
}

async function hydrateCloudProgress(): Promise<void> {
  try {
    const remote = await cloudProgress.load();
    if (!remote) return;
    cloudRevision = remote.revision;
    progress = progressRepository.replaceWithMerged(remote.progress);
    telemetry.setConsent(progress.telemetryConsent);
    updateProgressUi();
  } catch {
    // The standalone build and offline play remain local-first. The next run
    // completion retries cloud sync without interrupting gameplay.
  }
}

const cloudHydrated = hydrateCloudProgress();

async function synchronizeCloudProgress(): Promise<void> {
  cloudSyncRequested = true;
  if (cloudSyncInFlight) return cloudSyncInFlight;
  cloudSyncInFlight = (async () => {
    await cloudHydrated;
    let attempts = 0;
    while (cloudSyncRequested && attempts < 3) {
      attempts += 1;
      cloudSyncRequested = false;
      try {
        const saved = await cloudProgress.save(
          progressRepository.snapshot(),
          cloudRevision
        );
        cloudRevision = saved.revision;
      } catch (error) {
        if (error instanceof CloudProgressConflict && error.current) {
          cloudRevision = error.current.revision;
          progress = progressRepository.replaceWithMerged(error.current.progress);
          updateProgressUi();
          cloudSyncRequested = true;
        }
      }
    }
  })().finally(() => {
    cloudSyncInFlight = null;
  });
  return cloudSyncInFlight;
}

function reportRunStart(): void {
  telemetry.track("run_start", {
    seed: run.seed,
    mode: activeRunMode,
    tuningVersion: tuning.version,
    hasSavedGhost: Boolean(raceableReplay())
  }, activeRunId);
  if (activeRunMode === "ghost") {
    telemetry.track("replay_start", {
      seed: run.seed,
      replaySteps: ghostReplay?.replay.totalSteps ?? 0
    }, activeRunId);
  }
}

function startRun(mode: "fresh" | "ghost" = "fresh"): void {
  const replay = mode === "ghost" ? raceableReplay() : null;
  activeRunMode = replay ? "ghost" : "fresh";
  run = new Run(replay?.seed ?? generateSeed(), tuning);
  recorder = new ReplayRecorder(run.seed, tuning.version);
  activeRunId = createRunId();
  simulationSteps = 0;
  ghostRun = replay ? new Run(replay.seed, tuning) : null;
  ghostReplay = replay ? new ReplayPlayer(replay) : null;
  ghostVisible = Boolean(ghostRun && ghostReplay && progress.ghostEnabled);
  ghostCompletionReported = false;
  awaitingRestart = false;
  steering.reset();
  timestep.reset();
  view.resetTrail();
  hud.hideGameOver();
  if (ghostVisible) {
    hud.updateGhostGap(0, 0);
  } else {
    hud.hideGhostGap();
  }
  audio.resetRun(run.scoring.multiplier);
  reportRunStart();
}

hud.onRaceBest(() => {
  if (awaitingRestart && raceableReplay()) startRun("ghost");
});

hud.onTelemetryChoice(() => {
  const consent = progress.telemetryConsent === "granted" ? "denied" : "granted";
  progress = progressRepository.setTelemetryConsent(consent);
  telemetry.setConsent(consent);
  updateProgressUi();
  if (consent === "granted") {
    telemetry.track("session_start", {
      release: 32,
      tuningVersion: tuning.version,
      saveSchemaVersion: progress.schemaVersion,
      consentSource: "game-over"
    });
    void telemetry.flush();
  }
  void synchronizeCloudProgress();
});

// Restart on tap once the run has ended. Registered on the document rather than
// the canvas so a tap on the game-over panel also counts.
document.addEventListener("pointerdown", (event) => {
  if (awaitingRestart && !hud.isActionTarget(event.target)) startRun("fresh");
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
  telemetry.track("webgl_context_lost", {
    elapsedSec: run.sim.elapsedSec,
    quality: quality.current
  }, activeRunId);
  void telemetry.flush();
  console.warn("WebGL context lost — rebuild is not implemented until Phase 5");
});

window.addEventListener("error", () => {
  telemetry.track("error", { source: "window", phase: "runtime" }, activeRunId);
  void telemetry.flush();
});
window.addEventListener("unhandledrejection", () => {
  telemetry.track("error", { source: "promise", phase: "runtime" }, activeRunId);
  void telemetry.flush();
});
window.addEventListener("pagehide", () => {
  void telemetry.flush();
});

let lastFrameMs = performance.now();

function frame(nowMs: number): void {
  const frameSec = (nowMs - lastFrameMs) / 1000;
  lastFrameMs = nowMs;

  // Slow-mo is applied to wall-clock time before it reaches the accumulator, so
  // the simulation itself always steps at a fixed dt (ADR-0006).
  if (!awaitingRestart) timestep.advance(frameSec * run.timeScale, (dt) => {
    if (awaitingRestart) return;
    const command = steering.getTarget();
    recorder.record(command);
    const events = run.step(dt, command);
    simulationSteps += 1;

    if (ghostRun && ghostReplay && ghostVisible) {
      const ghostCommand = ghostReplay.next();
      if (ghostCommand === null) {
        ghostVisible = false;
      } else {
        ghostRun.step(dt, ghostCommand);
        if (ghostReplay.complete && !ghostCompletionReported) {
          ghostCompletionReported = true;
          const expected = ghostReplay.replay.summary;
          const deterministic =
            Math.abs(ghostRun.scoring.score - expected.score) < 1e-6 &&
            Math.abs(ghostRun.sim.forwardDistance - expected.forwardDistance) < 1e-6 &&
            ghostRun.collisionCount === expected.collisions;
          telemetry.track("replay_complete", {
            deterministic,
            score: ghostRun.scoring.score,
            collisions: ghostRun.collisionCount
          }, activeRunId);
          ghostVisible = false;
          hud.hideGhostGap();
        }
      }
    }

    for (const encounter of events.encounters) {
      telemetry.track(
        encounter.kind === "collision" ? "collision" : "near_miss",
        {
          seed: run.seed,
          clearance: encounter.clearance,
          distance: encounter.distance,
          tier: encounter.tier,
          template: encounter.templateId,
          momentum: run.sim.momentum
        },
        activeRunId
      );
    }
    if (simulationSteps % 240 === 0) {
      telemetry.track("momentum_sample", {
        elapsedSec: run.sim.elapsedSec,
        momentum: run.sim.momentum,
        light: run.light,
        score: run.scoring.score,
        distance: run.sim.forwardDistance
      }, activeRunId);
    }
    audio.consumeStep(
      events,
      run.sim.stunRemainingSec,
      run.scoring.multiplier
    );
    if (events.justEnded) {
      awaitingRestart = true;
      const summary: ReplaySummary = {
        score: run.scoring.score,
        elapsedSec: run.sim.elapsedSec,
        forwardDistance: run.sim.forwardDistance,
        nearMisses: run.scoring.nearMissCount,
        collisions: run.collisionCount
      };
      const replay = recorder.finish(summary);
      const record = progressRepository.recordRun(summary, replay);
      progress = record.progress;
      updateProgressUi();
      telemetry.track("run_end", {
        seed: run.seed,
        mode: activeRunMode,
        score: summary.score,
        elapsedSec: summary.elapsedSec,
        distance: summary.forwardDistance,
        nearMisses: summary.nearMisses,
        collisions: summary.collisions,
        newBest: record.newBest,
        replaySaved: record.replaySaved,
        replaySegments: replay?.commands.length ?? 0
      }, activeRunId);
      void telemetry.flush();
      void synchronizeCloudProgress();
      hud.hideGhostGap();
      const savedGhost = raceableReplay();
      hud.showGameOver(
        run.scoring.score,
        run.sim.elapsedSec,
        run.scoring.nearMissCount,
        run.collisionCount,
        {
          bestScore: progress.bestScore,
          newBest: record.newBest,
          savedGhostScore: savedGhost?.summary.score ?? null
        }
      );
    }
  });

  const lightFraction = run.light / tuning.light.max;
  view.render(
    run.sim,
    run.gates,
    lightFraction,
    run.sim.elapsedSec,
    frameSec,
    ghostVisible && ghostRun ? ghostRun.sim : null
  );
  if (ghostVisible && ghostRun) {
    hud.updateGhostGap(run.sim.forwardDistance, ghostRun.sim.forwardDistance);
  } else {
    hud.hideGhostGap();
  }
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

  telemetry.track("load_complete", {
    loadMs: performance.now(),
    quality: quality.current,
    productionAssets: view.productionAssetStatus().glowfin === "glb"
  });
  reportRunStart();

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
