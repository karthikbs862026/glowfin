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
import { GLOWFIN_RELEASE, mountReleaseIdentity } from "./release";
import {
  ProgressRepository,
  equippedCosmeticNames,
  type GlowfinProgressV2,
  type SessionObservation
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
import {
  HostedDailyClockClient,
  dailySeed,
  isDayId,
  resolveDailyDay,
  type GlowfinRunMode
} from "./meta/daily";
import {
  tideProgressForXp,
  type CosmeticCategory
} from "./meta/progression";
import {
  BrowserRewardedVideoProvider,
  LIVE_REWARDED_VIDEO_FLAGS,
  RewardedVideoHooks,
  type RewardedOffer
} from "./monetization/rewarded";
import { HostedRewardedAuthorityClient } from "./monetization/rewardAuthority";
import { isSealedReleaseManifest } from "./operations/productionReadiness";
import {
  AccessPreferenceRepository,
  classifyRunAccess,
  steeringSensitivityMultiplier,
  type RunAccessClassificationV1
} from "./competitive/assists";
import {
  HostedLeaderboardClient,
  type LeaderboardSubmissionV1,
  type LeaderboardScope
} from "./competitive/leaderboard";
import {
  HostedMoonflashClient,
  MoonflashRecorder,
  type MoonflashClipV1
} from "./sharing/clips";
import {
  RuntimeLifecycle,
  type RuntimeLifecycleSnapshot
} from "./resilience/runtimeLifecycle";
import { detectRuntimeSupport } from "./resilience/runtimeSupport";

const initialCanvas = document.querySelector<HTMLCanvasElement>("#glowfin-canvas");
if (!initialCanvas) throw new Error("Canvas #glowfin-canvas not found");
let canvas: HTMLCanvasElement = initialCanvas;

mountReleaseIdentity();

const runtimeLifecycle = new RuntimeLifecycle();
const runtimeSupport = detectRuntimeSupport();
let view: GameView | null = null;
if (runtimeSupport.supported) {
  try {
    view = new GameView(canvas, tuning);
  } catch {
    runtimeLifecycle.markFailed();
  }
} else {
  runtimeLifecycle.markUnsupported();
}
const hud = new Hud();
const audio = new GlowfinAudio(tuning);
const steering = new SteeringSource({
  dragRangeFraction: tuning.input.dragRangeFraction,
  sensitivity: tuning.input.sensitivity,
  deadZone: tuning.input.deadZone
});
let detachPointerInput: () => void = view
  ? attachPointerInput(canvas, steering)
  : () => undefined;

const quality = new QualityController();
const perf = new PerfMonitor();
const overlay = new DebugOverlay();
view?.setQuality(quality.settings);

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
let progress: GlowfinProgressV2 = progressLoad.progress;
const accessPreferenceRepository = new AccessPreferenceRepository(progressStorage);
let accessPreferences = accessPreferenceRepository.load();
steering.setSensitivityMultiplier(steeringSensitivityMultiplier(accessPreferences));
const telemetry = new TelemetryClient(
  progress.telemetryConsent,
  new HostedTelemetryTransport()
);
const cloudProgress = new HostedProgressClient();
const dailyClock = new HostedDailyClockClient();
const leaderboard = new HostedLeaderboardClient();
const moonflash = new HostedMoonflashClient();
const rewardedProvider = BrowserRewardedVideoProvider.fromGlobal();
const rewardedVideo = new RewardedVideoHooks(
  rewardedProvider,
  rewardedProvider ? LIVE_REWARDED_VIDEO_FLAGS : undefined
);
const rewardedAuthority = new HostedRewardedAuthorityClient();

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing required runtime element #${id}.`);
  return element as T;
}

const runtimeStatus = requiredElement<HTMLElement>("runtime-status");
const runtimeStatusTitle = requiredElement<HTMLElement>("runtime-status-title");
const runtimeStatusDetail = requiredElement<HTMLElement>("runtime-status-detail");
const runtimeStatusRetry = requiredElement<HTMLButtonElement>("runtime-status-retry");

function publishRuntimeState(
  snapshot: RuntimeLifecycleSnapshot = runtimeLifecycle.snapshot()
): void {
  document.documentElement.dataset["glowfinRuntime"] = snapshot.state;
  runtimeStatus.dataset["state"] = snapshot.state;
  window.__GLOWFIN_RUNTIME__ = snapshot;

  if (snapshot.state === "running") {
    runtimeStatus.dataset["active"] = "false";
    runtimeStatusRetry.hidden = true;
    return;
  }

  runtimeStatus.dataset["active"] = "true";
  runtimeStatusRetry.hidden = ![
    "context-lost",
    "unsupported",
    "failed"
  ].includes(snapshot.state);
  if (snapshot.state === "interrupted") {
    runtimeStatusTitle.textContent = "Glowfin paused safely";
    runtimeStatusDetail.textContent = "Your current is held while the app is interrupted and resumes without a time jump.";
  } else if (snapshot.state === "context-lost") {
    runtimeStatusTitle.textContent = "Restoring the Moon-Garden";
    runtimeStatusDetail.textContent = "The graphics context was interrupted. Your run is paused while the browser restores it.";
  } else if (snapshot.state === "recovering") {
    runtimeStatusTitle.textContent = "Rebuilding the Moon-Garden";
    runtimeStatusDetail.textContent = "Glowfin is recreating every graphics resource before play resumes.";
  } else if (snapshot.state === "unsupported") {
    runtimeStatusTitle.textContent = "Glowfin needs WebGL2";
    runtimeStatusDetail.textContent = runtimeSupport.detail;
  } else {
    runtimeStatusTitle.textContent = "Glowfin could not recover";
    runtimeStatusDetail.textContent = "The graphics system could not be rebuilt safely. Reload to begin a fresh session; saved progress is preserved.";
  }
}

runtimeStatusRetry.addEventListener("click", () => window.location.reload());
publishRuntimeState();

let cloudRevision = 0;
let cloudSyncInFlight: Promise<void> | null = null;
let cloudSyncRequested = false;
let run = new Run(generateSeed(), tuning);
let recorder = new ReplayRecorder(run.seed, tuning.version);
let moonflashRecorder = new MoonflashRecorder();
let activeRunId = createRunId();
let activeRunMode: GlowfinRunMode = "fresh";
let activeClassification: RunAccessClassificationV1 = classifyRunAccess(accessPreferences);
let activeRunDayId: string | null = null;
let authoritativeDailyDay: string | null = null;
let observedSessionDay: string | null = null;
let lastSessionObservation: SessionObservation | null = null;
let preferredGhostMode: "ghost" | "daily-ghost" = "ghost";
let simulationSteps = 0;
let ghostRun: Run | null = null;
let ghostReplay: ReplayPlayer | null = null;
let ghostVisible = false;
let ghostCompletionReported = false;
let awaitingRestart = false;

interface CompletedCompetitiveRun {
  runId: string;
  scope: LeaderboardScope;
  dayId: string | null;
  submission: LeaderboardSubmissionV1 | null;
  clip: MoonflashClipV1 | null;
  classification: RunAccessClassificationV1;
  rewardedPearls: number;
  rewardedOffer: RewardedOffer | null;
  submitted: boolean;
  shareUrl: string | null;
}

let completedCompetitiveRun: CompletedCompetitiveRun | null = null;

if (progress.telemetryConsent === "granted") {
  telemetry.track("session_start", {
    release: GLOWFIN_RELEASE.version,
    tuningVersion: tuning.version,
    saveSchemaVersion: progress.schemaVersion
  });
  telemetry.track("runtime_support", {
    supported: runtimeSupport.supported,
    reason: runtimeSupport.reason,
    state: runtimeLifecycle.snapshot().state
  });
  if (!runtimeSupport.supported || !view) {
    telemetry.track("startup_failure", {
      reason: runtimeSupport.supported ? "renderer-construction" : runtimeSupport.reason,
      state: runtimeLifecycle.snapshot().state
    });
  }
  if (progressLoad.recoveryReason) {
    telemetry.track("save_recovered", {
      source: progressLoad.recoveredFrom,
      reason: progressLoad.recoveryReason
    });
  }
}

async function verifyHostedReleaseManifest(): Promise<void> {
  if (GLOWFIN_RELEASE.environment === "local") return;
  let valid = false;
  try {
    const response = await fetch(new URL("./release.json", window.location.href), {
      cache: "no-store",
      credentials: "same-origin"
    });
    const manifest = response.ok ? await response.json() as unknown : null;
    valid = isSealedReleaseManifest(manifest) &&
      manifest.version === GLOWFIN_RELEASE.version &&
      manifest.environment === GLOWFIN_RELEASE.environment &&
      manifest.sourceCommit === GLOWFIN_RELEASE.sourceCommit;
  } catch {
    valid = false;
  }
  telemetry.track("release_manifest_check", {
    valid,
    release: GLOWFIN_RELEASE.version,
    environment: GLOWFIN_RELEASE.environment
  });
  telemetry.track("service_result", {
    service: "release-manifest",
    operation: "verify",
    success: valid
  });
  void telemetry.flush();
}

void verifyHostedReleaseManifest();

function raceableReplay() {
  const replay = progress.bestReplay;
  return replay &&
    replay.tuningVersion === tuning.version &&
    validateReplay(replay).valid
    ? replay
    : null;
}

function currentDailyDay() {
  return resolveDailyDay(
    new Date(),
    progress.daily.trustedDay,
    authoritativeDailyDay
  );
}

function raceableDailyReplay(dayId: string) {
  const record = progress.daily.bestDailyReplay;
  const replay = record?.dayId === dayId ? record.replay : null;
  return replay &&
    replay.seed === dailySeed(dayId) &&
    replay.tuningVersion === tuning.version &&
    validateReplay(replay).valid
    ? replay
    : null;
}

function hudMeta() {
  const tide = tideProgressForXp(progress.progression.tideXp);
  return {
    lumenPearls: progress.progression.lumenPearls,
    tideLevel: tide.level,
    tideXpIntoLevel: tide.xpIntoLevel,
    tideXpForNextLevel: tide.xpForNextLevel,
    tideFraction: tide.fraction,
    cosmeticNames: equippedCosmeticNames(progress)
  };
}

function updateProgressUi(): void {
  hud.setBestScore(progress.bestScore);
  hud.setTelemetryConsent(progress.telemetryConsent);
  hud.setMeta(hudMeta());
  view?.applyCosmetics(progress.progression.equippedCosmetics);
  view?.setPresentationPreferences(accessPreferences);
  hud.setMotorAssist(accessPreferences.motorAssist);
  hud.setPresentationPreferences(accessPreferences);
  document.documentElement.dataset["glowfinReducedMotion"] =
    String(accessPreferences.reducedMotion);
  document.documentElement.dataset["glowfinHighContrast"] =
    String(accessPreferences.highContrast);
}

function observeSessionDay(dayId: string): void {
  if (!isDayId(dayId) || observedSessionDay === dayId) return;
  const observation = progressRepository.observeSession(dayId);
  lastSessionObservation = observation;
  progress = observation.progress;
  observedSessionDay = dayId;
  trackRetentionReturn(observation);
}

function trackRetentionReturn(observation: SessionObservation): void {
  if (progress.telemetryConsent === "granted") {
    telemetry.track("retention_return", {
      daySource: currentDailyDay().source,
      daysSincePrevious: observation.daysSincePrevious ?? -1,
      nextDayReturn: observation.nextDayReturn,
      clockRollback: observation.clockRollback,
      tideLevel: tideProgressForXp(progress.progression.tideXp).level
    });
  }
}

async function hydrateCloudProgress(): Promise<void> {
  try {
    const remote = await cloudProgress.load();
    if (remote) {
      cloudRevision = remote.revision;
      progress = progressRepository.replaceWithMerged(remote.progress);
      telemetry.setConsent(progress.telemetryConsent);
      updateProgressUi();
      observeSessionDay(currentDailyDay().dayId);
    }
    telemetry.track("service_result", {
      service: "cloud-save",
      operation: "load",
      success: true,
      found: Boolean(remote)
    });
  } catch {
    telemetry.track("service_result", {
      service: "cloud-save",
      operation: "load",
      success: false
    });
    // The standalone build and offline play remain local-first. The next run
    // completion retries cloud sync without interrupting gameplay.
  }
}

async function hydrateDailyClock(): Promise<void> {
  try {
    const remote = await dailyClock.load();
    if (!remote) {
      telemetry.track("service_result", {
        service: "daily-clock",
        operation: "load",
        success: false
      });
      return;
    }
    authoritativeDailyDay = remote.dayId;
    progress = progressRepository.trustCalendarDay(remote.dayId, true);
    observeSessionDay(remote.dayId);
    updateProgressUi();
    telemetry.track("service_result", {
      service: "daily-clock",
      operation: "load",
      success: true
    });
  } catch {
    telemetry.track("service_result", {
      service: "daily-clock",
      operation: "load",
      success: false
    });
    // Offline play uses the monotonic saved/local day and withholds rewards on
    // rollback. The hosted UTC day is retried when the tab becomes active.
  }
}

updateProgressUi();
observeSessionDay(currentDailyDay().dayId);
const cloudHydrated = hydrateCloudProgress();
const dailyHydrated = hydrateDailyClock();

async function synchronizeCloudProgress(): Promise<void> {
  cloudSyncRequested = true;
  if (cloudSyncInFlight) return cloudSyncInFlight;
  cloudSyncInFlight = (async () => {
    await Promise.allSettled([cloudHydrated, dailyHydrated]);
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
        telemetry.track("cloud_sync_result", {
          result: "saved",
          attempt: attempts,
          revision: cloudRevision
        });
      } catch (error) {
        if (error instanceof CloudProgressConflict && error.current) {
          cloudRevision = error.current.revision;
          progress = progressRepository.replaceWithMerged(error.current.progress);
          updateProgressUi();
          cloudSyncRequested = true;
          telemetry.track("cloud_sync_result", {
            result: "conflict",
            attempt: attempts,
            revision: cloudRevision
          });
        } else {
          telemetry.track("cloud_sync_result", {
            result: "failed",
            attempt: attempts,
            revision: cloudRevision
          });
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
    hasSavedGhost: Boolean(
      activeRunMode === "daily" || activeRunMode === "daily-ghost"
        ? activeRunDayId && raceableDailyReplay(activeRunDayId)
        : raceableReplay()
    ),
    dailyDay: activeRunDayId ?? "none",
    division: activeClassification.division,
    motorAssist: activeClassification.motorAssist,
    reducedMotion: activeClassification.reducedMotion,
    highContrast: accessPreferences.highContrast
  }, activeRunId);
  if (activeRunMode === "daily" || activeRunMode === "daily-ghost") {
    telemetry.track("daily_trial_start", {
      day: activeRunDayId ?? "unknown",
      seed: run.seed,
      ghost: activeRunMode === "daily-ghost"
    }, activeRunId);
  }
  if (activeRunMode === "ghost" || activeRunMode === "daily-ghost") {
    telemetry.track("replay_start", {
      seed: run.seed,
      replaySteps: ghostReplay?.replay.totalSteps ?? 0
    }, activeRunId);
  }
}

function startRun(mode: GlowfinRunMode = "fresh"): void {
  const day = currentDailyDay();
  const dailyMode = mode === "daily" || mode === "daily-ghost";
  const replay = mode === "ghost"
    ? raceableReplay()
    : mode === "daily-ghost"
      ? raceableDailyReplay(day.dayId)
      : null;
  activeRunMode = mode === "ghost"
    ? replay ? "ghost" : "fresh"
    : mode === "daily-ghost"
      ? replay ? "daily-ghost" : "daily"
      : mode;
  activeRunDayId = dailyMode ? day.dayId : null;
  const seed = replay?.seed ?? (dailyMode ? dailySeed(day.dayId) : generateSeed());
  run = new Run(seed, tuning);
  recorder = new ReplayRecorder(run.seed, tuning.version);
  moonflashRecorder = new MoonflashRecorder();
  activeClassification = classifyRunAccess(accessPreferences);
  activeRunId = createRunId();
  simulationSteps = 0;
  ghostRun = replay ? new Run(replay.seed, tuning) : null;
  ghostReplay = replay ? new ReplayPlayer(replay) : null;
  ghostVisible = Boolean(ghostRun && ghostReplay && progress.ghostEnabled);
  ghostCompletionReported = false;
  awaitingRestart = false;
  completedCompetitiveRun = null;
  steering.reset();
  timestep.reset();
  view?.resetTrail();
  hud.hideGameOver();
  hud.setSubmitState("unavailable");
  hud.setShareState("unavailable");
  hud.setRewardedOffer(null);
  if (ghostVisible) {
    hud.updateGhostGap(0, 0);
  } else {
    hud.hideGhostGap();
  }
  audio.resetRun(run.scoring.multiplier);
  reportRunStart();
}

hud.onRaceBest(() => {
  if (!awaitingRestart) return;
  const day = currentDailyDay().dayId;
  if (preferredGhostMode === "daily-ghost" && raceableDailyReplay(day)) {
    startRun("daily-ghost");
  } else if (raceableReplay()) {
    startRun("ghost");
  }
});

hud.onDailyTrial(() => {
  if (awaitingRestart) startRun("daily");
});

async function loadCompetitiveBoard(state: CompletedCompetitiveRun): Promise<void> {
  hud.setLeaderboard(null, "loading");
  try {
    const snapshot = await leaderboard.list(
      state.scope,
      state.classification.division,
      state.dayId,
      5
    );
    if (completedCompetitiveRun !== state) return;
    hud.setLeaderboard(snapshot, snapshot.entries.length > 0 ? "ready" : "empty");
    telemetry.track("leaderboard_view", {
      scope: state.scope,
      division: state.classification.division,
      entries: snapshot.entries.length
    }, state.runId);
    telemetry.track("service_result", {
      service: "leaderboard",
      operation: "list",
      success: true
    }, state.runId);
  } catch {
    if (completedCompetitiveRun === state) hud.setLeaderboard(null, "offline");
    telemetry.track("service_result", {
      service: "leaderboard",
      operation: "list",
      success: false
    }, state.runId);
  }
}

hud.onSubmitScore(() => {
  const state = completedCompetitiveRun;
  if (!awaitingRestart || !state?.submission || state.submitted) return;
  state.submitted = true;
  hud.setSubmitState("submitting");
  telemetry.track("leaderboard_submit", {
    scope: state.scope,
    division: state.classification.division,
    score: state.submission.replay.summary.score
  }, state.runId);
  void leaderboard.submit(state.submission).then((snapshot) => {
    if (completedCompetitiveRun !== state) return;
    hud.setLeaderboard(snapshot, snapshot.entries.length > 0 ? "ready" : "empty");
    hud.setSubmitState("submitted", snapshot.playerRank);
    telemetry.track("leaderboard_result", {
      accepted: true,
      scope: state.scope,
      division: state.classification.division,
      rank: snapshot.playerRank ?? -1,
      validationVersion: snapshot.validationVersion
    }, state.runId);
    telemetry.track("service_result", {
      service: "leaderboard",
      operation: "submit",
      success: true
    }, state.runId);
    void telemetry.flush();
  }).catch(() => {
    if (completedCompetitiveRun !== state) return;
    hud.setSubmitState("rejected");
    telemetry.track("leaderboard_result", {
      accepted: false,
      scope: state.scope,
      division: state.classification.division
    }, state.runId);
    telemetry.track("service_result", {
      service: "leaderboard",
      operation: "submit",
      success: false
    }, state.runId);
    void telemetry.flush();
  });
});

hud.onShareClip(() => {
  const state = completedCompetitiveRun;
  if (!awaitingRestart || !state?.clip) return;
  if (state.shareUrl) {
    void navigator.clipboard?.writeText(state.shareUrl);
    return;
  }
  hud.setShareState("publishing");
  telemetry.track("share_clip_create", {
    division: state.classification.division,
    momentStep: state.clip.momentStep,
    multiplier: state.clip.moment.multiplier
  }, state.runId);
  void moonflash.publish(state.clip).then(async (published) => {
    if (completedCompetitiveRun !== state) return;
    state.shareUrl = published.shareUrl;
    hud.setShareState("shared");
    telemetry.track("share_clip_result", {
      published: true,
      division: state.classification.division
    }, state.runId);
    telemetry.track("service_result", {
      service: "moonflash",
      operation: "publish",
      success: true
    }, state.runId);
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({
          title: "Glowfin Moonflash",
          text: state.clip?.caption ?? "A Glowfin Moonflash",
          url: published.shareUrl
        });
      } else {
        await navigator.clipboard?.writeText(published.shareUrl);
      }
    } catch {
      // The link is still available on the button when the native share sheet
      // is cancelled or clipboard permission is denied.
    }
    void telemetry.flush();
  }).catch(() => {
    if (completedCompetitiveRun !== state) return;
    hud.setShareState("failed");
    telemetry.track("share_clip_result", {
      published: false,
      division: state.classification.division
    }, state.runId);
    telemetry.track("service_result", {
      service: "moonflash",
      operation: "publish",
      success: false
    }, state.runId);
    void telemetry.flush();
  });
});

hud.onMotorAssistToggle(() => {
  if (!awaitingRestart) return;
  accessPreferences = accessPreferenceRepository.toggleMotorAssist();
  steering.setSensitivityMultiplier(steeringSensitivityMultiplier(accessPreferences));
  updateProgressUi();
  const nextClassification = classifyRunAccess(accessPreferences);
  telemetry.track("assist_change", {
    motorAssist: accessPreferences.motorAssist,
    nextDivision: nextClassification.division
  });
  void telemetry.flush();
});

hud.onReducedMotionToggle(() => {
  if (!awaitingRestart) return;
  accessPreferences = accessPreferenceRepository.toggleReducedMotion();
  updateProgressUi();
  telemetry.track("accessibility_change", {
    setting: "reduced-motion",
    enabled: accessPreferences.reducedMotion,
    nextDivision: classifyRunAccess(accessPreferences).division
  });
  void telemetry.flush();
});

hud.onHighContrastToggle(() => {
  if (!awaitingRestart) return;
  accessPreferences = accessPreferenceRepository.toggleHighContrast();
  updateProgressUi();
  telemetry.track("accessibility_change", {
    setting: "high-contrast",
    enabled: accessPreferences.highContrast,
    nextDivision: classifyRunAccess(accessPreferences).division
  });
  void telemetry.flush();
});

hud.onRewardedPearls(() => {
  const state = completedCompetitiveRun;
  const offer = state?.rewardedOffer;
  if (!awaitingRestart || !state || !offer?.eligible || state.rewardedPearls < 1) return;
  state.rewardedOffer = null;
  hud.setRewardedOffer(state.rewardedPearls, "showing");
  telemetry.track("rewarded_start", { placement: offer.placement }, state.runId);
  void rewardedVideo.show(offer).then(async (completion) => {
    if (completedCompetitiveRun !== state) return;
    telemetry.track("rewarded_complete", {
      placement: offer.placement,
      result: completion.status,
      hasReceipt: Boolean(completion.receipt)
    }, state.runId);
    if (completion.status !== "completed" || !completion.receipt) {
      hud.setRewardedOffer(state.rewardedPearls, "failed");
      void telemetry.flush();
      return;
    }
    try {
      const authorized = await rewardedAuthority.claim(
        state.runId,
        offer.placement,
        state.rewardedPearls,
        completion.receipt
      );
      if (completedCompetitiveRun !== state) return;
      const grant = authorized.granted
        ? progressRepository.grantRewardedPearls(state.runId, authorized.pearls)
        : { progress: progressRepository.snapshot(), granted: false, pearls: 0 };
      progress = grant.progress;
      updateProgressUi();
      hud.setRewardedOffer(state.rewardedPearls, grant.granted ? "claimed" : "failed");
      telemetry.track("rewarded_reward", {
        placement: offer.placement,
        pearls: grant.pearls,
        duplicatePrevented: authorized.duplicate || !grant.granted,
        authority: true
      }, state.runId);
      telemetry.track("service_result", {
        service: "rewarded-authority",
        operation: "claim",
        success: true
      }, state.runId);
      void telemetry.flush();
      void synchronizeCloudProgress();
    } catch {
      if (completedCompetitiveRun !== state) return;
      hud.setRewardedOffer(state.rewardedPearls, "failed");
      telemetry.track("service_result", {
        service: "rewarded-authority",
        operation: "claim",
        success: false
      }, state.runId);
      void telemetry.flush();
    }
  });
});

for (const category of ["glow", "fin", "trail", "aura"] as const) {
  hud.onCosmeticCycle(category, () => {
    if (!awaitingRestart) return;
    progress = progressRepository.cycleCosmetic(category as CosmeticCategory);
    updateProgressUi();
    telemetry.track("cosmetic_equip", {
      category,
      cosmetic: progress.progression.equippedCosmetics[category],
      tideLevel: tideProgressForXp(progress.progression.tideXp).level
    });
    void telemetry.flush();
    void synchronizeCloudProgress();
  });
}

hud.onTelemetryChoice(() => {
  const consent = progress.telemetryConsent === "granted" ? "denied" : "granted";
  progress = progressRepository.setTelemetryConsent(consent);
  telemetry.setConsent(consent);
  updateProgressUi();
  if (consent === "granted") {
    telemetry.track("session_start", {
      release: GLOWFIN_RELEASE.version,
      tuningVersion: tuning.version,
      saveSchemaVersion: progress.schemaVersion,
      consentSource: "game-over"
    });
    telemetry.track("runtime_support", {
      supported: runtimeSupport.supported,
      reason: runtimeSupport.reason,
      state: runtimeLifecycle.snapshot().state
    });
    if (lastSessionObservation) trackRetentionReturn(lastSessionObservation);
    void telemetry.flush();
  }
  void synchronizeCloudProgress();
});

// Restart on tap once the run has ended. Registered on the document rather than
// the canvas so a tap on the game-over panel also counts.
document.addEventListener("pointerdown", (event) => {
  if (
    runtimeLifecycle.canAdvance &&
    awaitingRestart &&
    !hud.isActionTarget(event.target)
  ) startRun("fresh");
});

let lastFrameMs = performance.now();
const interruptionStartedAt = new Map<"visibility" | "page-cache", number>();

function pauseForInterruption(
  reason: "visibility" | "page-cache",
  source: string
): void {
  const alreadyPaused = runtimeLifecycle.snapshot().blockers.includes(reason);
  runtimeLifecycle.pause(reason);
  steering.reset();
  publishRuntimeState();
  if (!alreadyPaused) {
    interruptionStartedAt.set(reason, performance.now());
    telemetry.track("runtime_pause", {
      reason,
      source,
      elapsedSec: run.sim.elapsedSec
    }, activeRunId);
    void telemetry.flush();
  }
}

function resumeFromInterruption(
  reason: "visibility" | "page-cache",
  source: string
): void {
  const wasPaused = runtimeLifecycle.snapshot().blockers.includes(reason);
  runtimeLifecycle.resume(reason);
  steering.reset();
  timestep.reset();
  lastFrameMs = performance.now();
  publishRuntimeState();
  if (wasPaused) {
    const startedAt = interruptionStartedAt.get(reason) ?? performance.now();
    interruptionStartedAt.delete(reason);
    telemetry.track("runtime_resume", {
      reason,
      source,
      pausedMs: Math.max(0, performance.now() - startedAt),
      state: runtimeLifecycle.snapshot().state
    }, activeRunId);
    void telemetry.flush();
  }
}

// A backgrounded tab hands back a huge frame time and a finger that is no
// longer down. Pause the simulation and drop both rather than simulating the
// gap or resuming a stale pointer anchor.
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    pauseForInterruption("visibility", "visibilitychange");
  } else {
    resumeFromInterruption("visibility", "visibilitychange");
    void hydrateDailyClock();
  }
});

let rendererGeneration = view ? 1 : 0;
if (rendererGeneration > 0) canvas.dataset["rendererGeneration"] = String(rendererGeneration);
let detachContextListeners: () => void = () => undefined;
let rebuildInFlight: Promise<void> | null = null;

function installContextListeners(target: HTMLCanvasElement): () => void {
  const onContextLost = (event: Event) => {
    event.preventDefault();
    const alreadyLost = runtimeLifecycle.snapshot().blockers.includes("webgl");
    runtimeLifecycle.contextLost();
    steering.reset();
    publishRuntimeState();
    if (!alreadyLost) {
      telemetry.track("webgl_context_lost", {
        elapsedSec: run.sim.elapsedSec,
        quality: quality.current,
        generation: rendererGeneration
      }, activeRunId);
      void telemetry.flush();
    }
  };
  const onContextRestored = () => {
    void rebuildRenderer();
  };
  target.addEventListener("webglcontextlost", onContextLost);
  target.addEventListener("webglcontextrestored", onContextRestored);
  return () => {
    target.removeEventListener("webglcontextlost", onContextLost);
    target.removeEventListener("webglcontextrestored", onContextRestored);
  };
}

function rebuildRenderer(): Promise<void> {
  if (rebuildInFlight) return rebuildInFlight;
  if (!view || !runtimeLifecycle.snapshot().blockers.includes("webgl")) {
    return Promise.resolve();
  }

  rebuildInFlight = (async () => {
    runtimeLifecycle.beginRecovery();
    publishRuntimeState();
    const previousView = view;
    const previousCanvas = canvas;
    view = null;
    detachContextListeners();
    detachPointerInput();

    const replacement = previousCanvas.cloneNode(false) as HTMLCanvasElement;
    rendererGeneration += 1;
    replacement.dataset["rendererGeneration"] = String(rendererGeneration);
    previousCanvas.replaceWith(replacement);
    canvas = replacement;

    try {
      previousView.dispose();
    } catch {
      // A lost context can reject individual WebGL cleanup calls. Every DOM
      // and Three.js reference is dropped regardless, and the replacement
      // canvas starts from a fresh context.
    }

    let rebuiltView: GameView | null = null;
    try {
      rebuiltView = new GameView(canvas, tuning);
      rebuiltView.setQuality(quality.settings);
      rebuiltView.setPresentationPreferences(accessPreferences);
      rebuiltView.applyCosmetics(progress.progression.equippedCosmetics);
      detachContextListeners = installContextListeners(canvas);
      detachPointerInput = attachPointerInput(canvas, steering);
      await rebuiltView.ready;
      rebuiltView.resetTrail();
      view = rebuiltView;
      runtimeLifecycle.recoverySucceeded();
      timestep.reset();
      lastFrameMs = performance.now();
      publishRuntimeState();
      telemetry.track("webgl_context_restored", {
        generation: rendererGeneration,
        quality: quality.current,
        state: runtimeLifecycle.snapshot().state
      }, activeRunId);
      void telemetry.flush();
    } catch {
      detachContextListeners();
      detachPointerInput();
      try {
        rebuiltView?.dispose();
      } catch {
        // The failed reconstruction is abandoned and play remains fail-closed.
      }
      view = null;
      runtimeLifecycle.recoveryFailed();
      publishRuntimeState();
      telemetry.track("webgl_context_recovery_failed", {
        generation: rendererGeneration,
        quality: quality.current
      }, activeRunId);
      void telemetry.flush();
    }
  })().finally(() => {
    rebuildInFlight = null;
  });
  return rebuildInFlight;
}

if (view) detachContextListeners = installContextListeners(canvas);

window.addEventListener("error", () => {
  telemetry.track("error", { source: "window", phase: "runtime" }, activeRunId);
  void telemetry.flush();
});
window.addEventListener("unhandledrejection", () => {
  telemetry.track("error", { source: "promise", phase: "runtime" }, activeRunId);
  void telemetry.flush();
});
window.addEventListener("pagehide", () => {
  pauseForInterruption("page-cache", "pagehide");
  void telemetry.flush();
});
window.addEventListener("pageshow", () => {
  resumeFromInterruption("page-cache", "pageshow");
});
document.addEventListener("freeze", () => {
  pauseForInterruption("page-cache", "freeze");
});
document.addEventListener("resume", () => {
  resumeFromInterruption("page-cache", "resume");
});

function frame(nowMs: number): void {
  const frameSec = (nowMs - lastFrameMs) / 1000;
  lastFrameMs = nowMs;
  const activeView = view;
  if (!runtimeLifecycle.canAdvance || !activeView) {
    requestAnimationFrame(frame);
    return;
  }

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
    moonflashRecorder.record(
      simulationSteps,
      run.scoring.score,
      run.scoring.multiplier,
      events.encounters
    );
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
      const clip = moonflashRecorder.finish(replay, activeClassification);
      const day = currentDailyDay();
      const rewardDay = activeRunDayId ?? day.dayId;
      const record = progressRepository.recordRun(summary, replay, {
        runId: activeRunId,
        mode: activeRunMode,
        dayId: rewardDay,
        calendarRewardsAllowed: day.status !== "clock-rollback"
      });
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
        replaySegments: replay?.commands.length ?? 0,
        tideLevel: record.retention.tideLevelAfter,
        rewardPearls: record.retention.totalPearls
      }, activeRunId);
      telemetry.track("reward_granted", {
        runPearls: record.retention.runRewardClaimed
          ? record.retention.runReward.pearls
          : 0,
        objectivePearls: record.retention.objectiveRewardPearls,
        dailyPearls: record.retention.dailyRewardPearls,
        totalPearls: record.retention.totalPearls,
        duplicatePrevented: record.retention.duplicateRewardPrevented
      }, activeRunId);
      if (record.retention.tideLevelAfter > record.retention.tideLevelBefore) {
        telemetry.track("tide_level_up", {
          from: record.retention.tideLevelBefore,
          to: record.retention.tideLevelAfter
        }, activeRunId);
      }
      for (const cosmetic of record.retention.unlockedCosmetics) {
        telemetry.track("cosmetic_unlock", {
          cosmetic: cosmetic.id,
          category: cosmetic.category,
          unlockLevel: cosmetic.unlockLevel
        }, activeRunId);
      }
      for (const objective of record.retention.objectives) {
        telemetry.track("objective_progress", {
          objective: objective.id,
          cadence: objective.cadence,
          progress: objective.progress,
          target: objective.target,
          completed: objective.completed
        }, activeRunId);
      }
      for (const objective of record.retention.completedObjectives) {
        telemetry.track("objective_complete", {
          objective: objective.id,
          cadence: objective.cadence,
          rewardPearls: objective.rewardPearls
        }, activeRunId);
      }
      if (activeRunMode === "daily" || activeRunMode === "daily-ghost") {
        telemetry.track("daily_trial_complete", {
          day: rewardDay,
          seed: run.seed,
          firstCompletion: record.retention.dailyAwarded,
          rewardRejected: record.retention.calendarRewardRejected,
          score: summary.score
        }, activeRunId);
        telemetry.track("streak_update", {
          current: record.retention.streak.current,
          best: record.retention.streak.best,
          graceAvailable: record.retention.streak.graceAvailable,
          graceUsed: Boolean(record.retention.streak.graceUsedForDay)
        }, activeRunId);
      }
      const endedRunId = activeRunId;
      const dailyCompetitive = activeRunMode === "daily" || activeRunMode === "daily-ghost";
      const submission: LeaderboardSubmissionV1 | null = replay ? {
        schemaVersion: 1,
        runId: endedRunId,
        mode: activeRunMode,
        dayId: dailyCompetitive ? rewardDay : null,
        replay,
        classification: activeClassification
      } : null;
      const rewardedPearls = record.retention.runRewardClaimed
        ? record.retention.runReward.pearls
        : 0;
      const competitiveState: CompletedCompetitiveRun = {
        runId: endedRunId,
        scope: dailyCompetitive ? "daily" : "global",
        dayId: dailyCompetitive ? rewardDay : null,
        submission,
        clip,
        classification: activeClassification,
        rewardedPearls,
        rewardedOffer: null,
        submitted: false,
        shareUrl: null
      };
      completedCompetitiveRun = competitiveState;
      hud.hideGhostGap();
      const dailyGhost = activeRunMode === "daily" || activeRunMode === "daily-ghost"
        ? raceableDailyReplay(rewardDay)
        : null;
      const savedGhost = dailyGhost ?? raceableReplay();
      preferredGhostMode = dailyGhost ? "daily-ghost" : "ghost";
      const meta = hudMeta();
      hud.showGameOver(
        run.scoring.score,
        run.sim.elapsedSec,
        run.scoring.nearMissCount,
        run.collisionCount,
        {
          ...meta,
          bestScore: progress.bestScore,
          newBest: record.newBest,
          raceGhostScore: savedGhost?.summary.score ?? null,
          raceGhostLabel: dailyGhost ? "Race today’s ghost" : "Race saved ghost",
          rewardPearls: record.retention.totalPearls,
          unlockedNames: record.retention.unlockedCosmetics.map((item) => item.name),
          objectives: record.retention.objectives,
          streak: record.retention.streak,
          dailyDayId: rewardDay,
          dailyCompleted: progress.daily.dailyClaims.includes(rewardDay),
          calendarRewardRejected: record.retention.calendarRewardRejected,
          leaderboardDivision: activeClassification.division
        }
      );
      hud.setSubmitState(submission ? "ready" : "unavailable");
      hud.setShareState(clip ? "ready" : "unavailable");
      hud.setRewardedOffer(null);
      void loadCompetitiveBoard(competitiveState);
      if (rewardedPearls > 0) {
        void rewardedVideo.offer("double-lumen-pearls", {
          runEnded: true,
          collisionCount: summary.collisions,
          earnedPearls: rewardedPearls
        }).then((offer) => {
          if (completedCompetitiveRun !== competitiveState || !offer.eligible) return;
          competitiveState.rewardedOffer = offer;
          hud.setRewardedOffer(rewardedPearls);
          telemetry.track("rewarded_offer", {
            placement: offer.placement,
            reason: offer.reason,
            pearls: rewardedPearls
          }, endedRunId);
        });
      }
      void telemetry.flush();
      void synchronizeCloudProgress();
    }
  });

  const lightFraction = run.light / tuning.light.max;
  activeView.render(
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
    activeView.setQuality(quality.settings);
    console.info(`Quality ${change.from} -> ${change.to} (${change.reason})`);
  }

  if (import.meta.env.DEV) {
    const stats = activeView.stats();
    const sample = perf.sample(stats.drawCalls, stats.triangles, activeView.gpuName);
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
  if (!runtimeSupport.supported || !view) {
    publishRuntimeState();
    return;
  }

  let activeView: GameView | null = null;
  try {
    while (!activeView) {
      if (!view && rebuildInFlight) await rebuildInFlight;
      const candidate: GameView | null = view;
      if (!candidate) break;
      await candidate.ready;
      if (candidate === view) activeView = candidate;
    }
  } catch {
    runtimeLifecycle.markFailed();
    publishRuntimeState();
    telemetry.track("error", { source: "startup", phase: "renderer-ready" });
    void telemetry.flush();
    return;
  }
  if (!activeView) {
    publishRuntimeState();
    return;
  }

  telemetry.track("load_complete", {
    loadMs: performance.now(),
    quality: quality.current,
    productionAssets: activeView.productionAssetStatus().glowfin === "glb",
    rendererGeneration,
    reducedMotion: accessPreferences.reducedMotion,
    highContrast: accessPreferences.highContrast
  });
  reportRunStart();

  if (isProbeRequested()) {
    const {
      runContrastProbe,
      showProbeResult
    } = await import("./render/contrastProbe");
    const result = runContrastProbe(activeView, tuning);
    showProbeResult(result);
    console.info(result.lines.join("\n"));
    return;
  }

  requestAnimationFrame(frame);
}

void start();

declare global {
  interface Window {
    __GLOWFIN_RUNTIME__?: RuntimeLifecycleSnapshot;
  }
}
