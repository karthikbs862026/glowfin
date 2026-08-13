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
import { Run, type DuskmawPursuitPhase } from "./sim/run";
import { GameView } from "./render/gameView";
import { Hud, type SignatureCuePresentation } from "./render/hud";
import { MoonWell, type MoonWellPanel } from "./render/moonWell";
import { DebugOverlay } from "./render/debugOverlay";
import { QualityController } from "./perf/quality";
import { PerfMonitor, checkBudgets } from "./perf/metrics";
import { GlowfinAudio } from "./audio/audioEngine";
import { GLOWFIN_RELEASE, mountReleaseIdentity } from "./release";
import {
  ProgressRepository,
  equippedCosmeticNames,
  type GlowfinProgressV2,
  type RealmRecordResult,
  type SessionObservation
} from "./persistence/progress";
import {
  CloudProgressConflict,
  HostedProgressClient
} from "./persistence/cloud";
import {
  ReplayPlayer,
  ReplayRecorder,
  type GlowfinReplayV1,
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
  summarizeStreak,
  type GlowfinRunMode
} from "./meta/daily";
import {
  COSMETIC_CATALOG,
  cosmeticAvailability,
  cosmeticDefinition,
  tideProgressForXp,
  type CosmeticLoadout
} from "./meta/progression";
import {
  FirstRunTutorial,
  GuidedTutorialRepository,
  GUIDED_TUTORIAL_VERSION,
  tutorialPresentation,
  type TutorialStep
} from "./meta/onboarding";
import {
  BrowserRewardedVideoProvider,
  LIVE_REWARDED_VIDEO_FLAGS,
  RewardedVideoHooks,
  type RewardedOffer
} from "./monetization/rewarded";
import { HostedRewardedAuthorityClient } from "./monetization/rewardAuthority";
import {
  isSealedReleaseManifest,
  shouldUseHostedServices
} from "./operations/productionReadiness";
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
  moonflashChallengeUrl,
  moonflashTokenFromUrl,
  type MoonflashChallengeV1,
  type MoonflashClipV1
} from "./sharing/clips";
import { renderMoonflashMedia } from "./sharing/media";
import {
  RuntimeLifecycle,
  type RuntimeInterruptionReason,
  type RuntimeLifecycleSnapshot
} from "./resilience/runtimeLifecycle";
import { detectRuntimeSupport } from "./resilience/runtimeSupport";
import {
  capacitorHapticDriver,
  installCapacitorShell,
  nativeRuntime
} from "./native/capacitorBridge";
import {
  HapticDirector,
  HapticPreferenceRepository
} from "./native/haptics";
import { deviceHealthPayload } from "./operations/deviceHealth";
import {
  CHAPTER_ONE_MISSION,
  type ExpeditionExperience
} from "./expedition/chapterOne";
import { ExpeditionDirector } from "./expedition/expeditionDirector";
import {
  LUMEN_OBJECTIVE_CHAIN_TARGET,
  LumenMoteDirector,
  lumenChainIntensity,
  type LumenMoteSnapshot,
  type LumenMotionSample,
} from "./expedition/lumenMotes";
import {
  R3_PLAN_HASH,
  R3_RACE_GATE_TARGET,
  R3_RESCUE_LIGHT_TARGET,
  R3EncounterDirector,
  type R3StepEvents,
} from "./expedition/r3Encounters";
import {
  R5_CURRENT_BREAK_TARGET,
  R5_PLAN_HASH,
  R5CompletionDirector,
  type R5StepEvents,
} from "./expedition/r5Completion";
import {
  ExpeditionProgressRepository,
  type ExpeditionProgressV1,
} from "./expedition/progress";
import type { RealmId } from "./realms/definition";
import {
  isCrystalTrenchUnlocked,
  isLeviathanGraveyardUnlocked,
  leviathanGraveyardProgress,
  REALM_OBJECTIVES,
} from "./realms/progress";
import { RealmHud } from "./realms/hud";

const initialCanvas = document.querySelector<HTMLCanvasElement>("#glowfin-canvas");
if (!initialCanvas) throw new Error("Canvas #glowfin-canvas not found");
let canvas: HTMLCanvasElement = initialCanvas;

mountReleaseIdentity();
const v44ReviewRoute = /(?:^|\/)game-v44-r1(?:\/|$)/.test(
  window.location.pathname,
);
const v45IntegrationRoute = /(?:^|\/)game-v45-r1(?:\/|$)/.test(
  window.location.pathname,
);
const hostedServicesEnabled = shouldUseHostedServices(
  GLOWFIN_RELEASE.environment,
  window.location.hostname
);
// Version 44 review builds remain network-cache-free while the encounter matures.
// The host still serves the self-deactivating recovery worker so an older
// registration cannot regain startup ownership across the Version 42 boundary.
const SERVICE_WORKER_CACHING_CERTIFIED = false;

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
const moonWell = new MoonWell();
const realmHud = new RealmHud();
const expedition = new ExpeditionDirector();
const lumenMotes = new LumenMoteDirector();
const r3DurationScale = import.meta.env.DEV &&
    new URLSearchParams(window.location.search).get("r3qa") === "1"
  ? 4
  : 1;
const r3Encounters = new R3EncounterDirector({ durationScale: r3DurationScale });
const r5Completion = new R5CompletionDirector({ durationScale: r3DurationScale });
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
const expeditionProgressRepository = new ExpeditionProgressRepository(progressStorage);
const guidedTutorialRepository = new GuidedTutorialRepository(progressStorage);
let guidedTutorialComplete = guidedTutorialRepository.isCurrentComplete();
let tutorialIntroDismissed = false;
const progressLoad = progressRepository.load();
let progress: GlowfinProgressV2 = progressLoad.progress;
const expeditionProgressLoad = expeditionProgressRepository.load();
let expeditionProgress: ExpeditionProgressV1 = expeditionProgressLoad.progress;
const accessPreferenceRepository = new AccessPreferenceRepository(progressStorage);
let accessPreferences = accessPreferenceRepository.load();
steering.setSensitivityMultiplier(steeringSensitivityMultiplier(accessPreferences));
const wrapperRuntime = nativeRuntime();
const hapticPreferenceRepository = new HapticPreferenceRepository(progressStorage);
let hapticsEnabled = hapticPreferenceRepository.load();
const haptics = new HapticDirector({
  enabled: hapticsEnabled,
  driver: capacitorHapticDriver(wrapperRuntime)
});
const telemetry = new TelemetryClient(
  progress.telemetryConsent,
  new HostedTelemetryTransport()
);
if (expeditionProgressLoad.recoveryReason) {
  telemetry.track("save_recovered", {
    domain: "expedition",
    recoveredFrom: expeditionProgressLoad.recoveredFrom,
    reason: expeditionProgressLoad.recoveryReason,
  });
}
const cloudProgress = new HostedProgressClient();
const dailyClock = new HostedDailyClockClient();
const leaderboard = new HostedLeaderboardClient();
const moonflash = new HostedMoonflashClient(
  fetch,
  wrapperRuntime.isNative
    ? "https://glowfin-phase-3b.karthik-bs86.chatgpt.site/api/glowfin/share"
    : "/api/glowfin/share"
);
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
const startupProgress = requiredElement<HTMLElement>("startup-progress");
const startupProgressDetail = requiredElement<HTMLElement>("startup-progress-detail");
const startupProgressFill = requiredElement<HTMLElement>("startup-progress-fill");
const networkStatus = requiredElement<HTMLElement>("network-status");

function setStartupProgress(percent: number, detail: string): void {
  const bounded = Math.max(0, Math.min(100, Math.round(percent)));
  startupProgressDetail.textContent = detail;
  startupProgressFill.style.width = `${bounded}%`;
  startupProgress.setAttribute("aria-valuenow", String(bounded));
}

function setNetworkState(): void {
  const offline = navigator.onLine === false;
  networkStatus.dataset["offline"] = String(offline);
  document.documentElement.dataset["glowfinOnline"] = String(!offline);
}

setStartupProgress(26, runtimeSupport.supported
  ? "Loading Glowfin and the first current…"
  : "This device needs a supported graphics path.");
setNetworkState();
window.addEventListener("online", setNetworkState);
window.addEventListener("offline", setNetworkState);

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
let gameplayActive = false;
let firstRunTutorial: FirstRunTutorial | null = null;
let tutorialStep: TutorialStep | null = null;
let tutorialCompleteAtSec: number | null = null;
let tutorialSessionSource: "required" | "replay" | null = null;
let activeChallenge: MoonflashChallengeV1 | null = null;
let challengeRunActive = false;
let activeExperience: ExpeditionExperience = "classic";
let activeRealmId: RealmId = "moon-garden";
let realmFeedbackUntilSec = 0;
let lastDuskmawTelegraphKey: string | null = null;
let lastDuskmawPhase: DuskmawPursuitPhase | null = null;
let mooncrestCeremonyCuePlayed = false;

interface GlowfinCertificationSnapshot {
  schemaVersion: 1;
  releaseVersion: number;
  experience: ExpeditionExperience;
  realm: RealmId;
  screen: "hub" | "run" | "post-run";
  seed: number;
  simulationSteps: number;
  forwardDistance: number;
  lateralPosition: number;
  smoothedSteering: number;
  gameplayActive: boolean;
  awaitingRestart: boolean;
  runtimeState: RuntimeLifecycleSnapshot["state"];
}

function publishCertificationState(): void {
  const screen = document.documentElement.dataset["glowfinScreen"];
  window.__GLOWFIN_CERTIFICATION__ = {
    schemaVersion: 1,
    releaseVersion: GLOWFIN_RELEASE.version,
    experience: activeExperience,
    realm: activeRealmId,
    screen: screen === "run" || screen === "post-run" ? screen : "hub",
    seed: run.seed,
    simulationSteps,
    forwardDistance: run.sim.forwardDistance,
    lateralPosition: run.sim.lateralPosition,
    smoothedSteering: run.sim.smoothedSteering,
    gameplayActive,
    awaitingRestart,
    runtimeState: runtimeLifecycle.snapshot().state
  };
}

function signatureCueForRun(): SignatureCuePresentation | null {
  if (!gameplayActive || awaitingRestart || firstRunTutorial) return null;
  // Kelp Cathedral teaches through collision-aligned fronds, coloured current
  // ribbons and the manta beacon. A large text card obscured those visual cues
  // and made the realm feel like a labelled Moon Garden reskin.
  if (activeRealmId !== "moon-garden") return null;
  const forwardDistance = run.sim.forwardDistance;
  const gate = run.gates.find((candidate) => {
    const plan = candidate.obstaclePlan;
    return Boolean(
      plan &&
      candidate.distance > forwardDistance + 3 &&
      forwardDistance >= plan.telegraphFromDistance
    );
  });
  const plan = gate?.obstaclePlan;
  if (!plan) return null;
  if (plan.verb === "moonflash-choice") {
    return {
      verb: plan.verb,
      title: "Choose your current",
      detail: "Wide cyan is safe · narrow rose earns 1.35×"
    };
  }
  if (plan.verb === "ceremonial-shutter") {
    return {
      verb: plan.verb,
      title: "Ceremonial shutters",
      detail: "Watch the amber cadence · the centre always stays passable"
    };
  }
  return {
    verb: plan.verb,
    title: `Cross-current pushes ${plan.lateralDriftPerSec < 0 ? "left" : "right"}`,
    detail: "Follow the angled glow or steer against it"
  };
}

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
  media: Promise<File | null> | null;
}

let completedCompetitiveRun: CompletedCompetitiveRun | null = null;

if (progress.telemetryConsent === "granted") {
  telemetry.track("session_start", {
    release: GLOWFIN_RELEASE.version,
    tuningVersion: tuning.version,
    saveSchemaVersion: progress.schemaVersion,
    nativeWrapper: wrapperRuntime.isNative,
    platform: wrapperRuntime.platform
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
  // Build-time checks own loopback certification because Vite's development
  // server does not expose the sealed dist manifest. Hosted checkpoints still
  // verify their top-level manifest on every fresh page load.
  if (!hostedServicesEnabled) return;
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

async function loadMoonflashChallenge(url: string): Promise<void> {
  const token = moonflashTokenFromUrl(url);
  if (!token) return;
  moonWell.setChallenge(null, "loading");
  telemetry.track("share_challenge_open", {
    source: url.startsWith("glowfin:") ? "native-deep-link" : "web-deep-link"
  });
  try {
    const challenge = await moonflash.loadChallenge(token);
    if (
      challenge.clip.replay.tuningVersion !== tuning.version ||
      !validateReplay(challenge.clip.replay).valid
    ) {
      throw new Error("Moonflash challenge uses an incompatible replay.");
    }
    activeChallenge = challenge;
    moonWell.setChallenge(challenge.clip.caption, "ready");
    telemetry.track("service_result", {
      service: "moonflash-challenge",
      operation: "load",
      success: true
    });
  } catch {
    activeChallenge = null;
    moonWell.setChallenge("expired", "failed");
    telemetry.track("service_result", {
      service: "moonflash-challenge",
      operation: "load",
      success: false
    });
  }
  void telemetry.flush();
}

void loadMoonflashChallenge(window.location.href);

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

function objectivePresentations() {
  const daily = progressRepository.activeObjectives(currentDailyDay().dayId).map((objective) => ({
    id: objective.id,
    label: objective.label,
    progress: objective.progress,
    target: objective.target,
    completed: objective.completed
  }));
  const realms = progressRepository.activeRealmObjectives().map((objective) => ({
    id: objective.id,
    label: objective.label,
    progress: objective.progress,
    target: objective.target,
    completed: objective.completed,
  }));
  return [...daily, ...realms];
}

function refreshWardrobe(): void {
  moonWell.renderWardrobe(
    COSMETIC_CATALOG.map((cosmetic) => ({
      cosmetic,
      availability: cosmeticAvailability(
        cosmetic,
        progress.progression.tideXp,
        progress.progression.ownedCosmetics,
        progress.progression.equippedCosmetics
      )
    })),
    progress.progression.lumenPearls
  );
}

function refreshMoonWell(): void {
  const meta = hudMeta();
  moonWell.setMeta(meta);
  const day = currentDailyDay().dayId;
  moonWell.setDailyLabel(day, progress.daily.dailyClaims.includes(day));
  moonWell.renderObjectives(objectivePresentations());
  moonWell.setTutorialStatus(guidedTutorialComplete);
  moonWell.setExpeditionState(expeditionProgress);
  moonWell.setTideSprintState(progress.tideSprint, progress.ghostEnabled);
  moonWell.setKelpCathedralState(progress.realms.kelpCathedral);
  moonWell.setCrystalTrenchState(
    progress.realms.crystalTrench,
    isCrystalTrenchUnlocked(progress.realms),
  );
  moonWell.setDuskmawState(
    leviathanGraveyardProgress(progress.realms),
    isLeviathanGraveyardUnlocked(progress.realms),
    v44ReviewRoute,
    v45IntegrationRoute,
  );
  refreshWardrobe();
}

function showMoonWell(panel: MoonWellPanel = "home"): void {
  gameplayActive = false;
  activeExperience = "classic";
  activeRealmId = "moon-garden";
  expedition.reset();
  lumenMotes.stop();
  r3Encounters.stop();
  r5Completion.stop();
  view?.setLumenChainFraction(0);
  view?.setRealm(activeRealmId);
  realmHud.setActive(false);
  steering.reset();
  firstRunTutorial = null;
  tutorialStep = null;
  tutorialCompleteAtSec = null;
  tutorialSessionSource = null;
  moonWell.showTutorial(null);
  hud.hideGameOver();
  view?.applyCosmetics(progress.progression.equippedCosmetics);
  refreshMoonWell();
  moonWell.show(hudMeta());
  moonWell.showPanel(panel);
  moonWell.showTutorialIntro(
    panel === "home" && !guidedTutorialComplete && !tutorialIntroDismissed
  );
  document.documentElement.dataset["glowfinScreen"] = "hub";
  document.documentElement.dataset["glowfinMode"] = activeExperience;
  document.documentElement.dataset["glowfinRealm"] = activeRealmId;
  publishCertificationState();
  telemetry.track("hub_view", { panel });
}

function updateProgressUi(): void {
  hud.setBestScore(progress.bestScore);
  hud.setTelemetryConsent(progress.telemetryConsent);
  hud.setMeta(hudMeta());
  view?.applyCosmetics(progress.progression.equippedCosmetics);
  view?.setPresentationPreferences(accessPreferences);
  hud.setMotorAssist(accessPreferences.motorAssist);
  hud.setPresentationPreferences(accessPreferences);
  hud.setHapticsPreference(hapticsEnabled, wrapperRuntime.isNative);
  document.documentElement.dataset["glowfinNativePlatform"] = wrapperRuntime.platform;
  document.documentElement.dataset["glowfinHaptics"] = String(hapticsEnabled);
  document.documentElement.dataset["glowfinReducedMotion"] =
    String(accessPreferences.reducedMotion);
  document.documentElement.dataset["glowfinHighContrast"] =
    String(accessPreferences.highContrast);
  refreshMoonWell();
}

type RealmEndPresentation = NonNullable<
  Parameters<Hud["showGameOver"]>[4]["realmResult"]
>;

function presentRealmResult(
  result: RealmRecordResult,
  realmResult: RealmEndPresentation,
  specialUnlockNames: readonly string[] = [],
): void {
  if (!run) return;
  progress = result.progress;
  updateProgressUi();
  completedCompetitiveRun = null;
  hud.hideGhostGap();
  hud.setSubmitState("unavailable");
  hud.setShareState("unavailable");
  hud.setRewardedOffer(null);
  hud.setLeaderboard(null, "empty");
  const day = currentDailyDay().dayId;
  hud.showGameOver(
    run.scoring.score,
    run.sim.elapsedSec,
    run.scoring.nearMissCount,
    run.collisionCount,
    {
      ...hudMeta(),
      bestScore: progress.bestScore,
      newBest: false,
      raceGhostScore: null,
      raceGhostLabel: "Ghosts stay in Classic Dive",
      rewardPearls: result.award.pearls,
      unlockedNames: [
        ...result.unlockedCosmetics.map((item) => item.name),
        ...specialUnlockNames,
      ],
      objectives: objectivePresentations(),
      streak: summarizeStreak(progress.daily.dailyClaims, progress.daily.bestStreak),
      dailyDayId: day,
      dailyCompleted: progress.daily.dailyClaims.includes(day),
      calendarRewardRejected: false,
      leaderboardDivision: activeClassification.division,
      realmResult,
    },
  );
  telemetry.track("reward_granted", {
    source: "lost-realms",
    realm: result.realm,
    runPearls: result.award.pearls,
    objectivePearls: result.award.pearls,
    totalPearls: result.award.pearls,
    tideXp: result.award.xp,
    duplicatePrevented: result.duplicateRewardPrevented,
  }, activeRunId);
  for (const objectiveId of result.award.newlyCompletedObjectives) {
    const objective = REALM_OBJECTIVES.find((candidate) => candidate.id === objectiveId);
    telemetry.track("objective_complete", {
      objective: objectiveId,
      cadence: "realm",
      realm: result.realm,
      rewardPearls: objective?.rewardPearls ?? 0,
      rewardXp: objective?.rewardXp ?? 0,
    }, activeRunId);
  }
  if (result.crystalTrenchNewlyUnlocked) {
    haptics.play("milestone");
    view?.setHeroMoment("unlock");
    telemetry.track("realm_unlock", {
      realm: "crystal-trench",
      prerequisite: "realm-kelp-rescue",
      sourceRealm: "kelp-cathedral",
    }, activeRunId);
  } else if (result.leviathanGraveyardNewlyUnlocked) {
    haptics.play("milestone");
    view?.setHeroMoment("unlock");
    telemetry.track("realm_unlock", {
      realm: "leviathan-graveyard",
      prerequisite: "realm-crystal-clear",
      sourceRealm: "crystal-trench",
    }, activeRunId);
  } else if (result.award.pearls > 0) {
    haptics.play("milestone");
    view?.setHeroMoment("celebration");
  }
  void telemetry.flush();
  void synchronizeCloudProgress();
}

/** Version 44-R1 remains an isolated encounter comparison route. */
function presentDuskmawResult(): void {
  if (!run) return;
  const status = run.duskmawStatus;
  completedCompetitiveRun = null;
  hud.hideGhostGap();
  hud.setSubmitState("unavailable");
  hud.setShareState("unavailable");
  hud.setRewardedOffer(null);
  hud.setLeaderboard(null, "empty");
  const day = currentDailyDay().dayId;
  hud.showGameOver(
    run.scoring.score,
    run.sim.elapsedSec,
    run.scoring.nearMissCount,
    run.collisionCount,
    {
      ...hudMeta(),
      bestScore: progress.bestScore,
      newBest: false,
      raceGhostScore: null,
      raceGhostLabel: "Ghosts stay in Classic Dive",
      rewardPearls: 0,
      unlockedNames: status.completed ? ["Auralis Mooncrest Covenant"] : [],
      objectives: objectivePresentations(),
      streak: summarizeStreak(progress.daily.dailyClaims, progress.daily.bestStreak),
      dailyDayId: day,
      dailyCompleted: progress.daily.dailyClaims.includes(day),
      calendarRewardRejected: false,
      leaderboardDivision: activeClassification.division,
      realmResult: {
        kind: "duskmaw-pursuit",
        title: "Leviathan Graveyard",
        integrated: false,
        completed: status.completed,
        currentBreaks: status.currentBreaks,
        currentBreakTarget: status.currentBreakTarget,
        captures: status.captures,
        cleanPerformance: status.cleanPerformance,
      },
    },
  );
  view?.setHeroMoment(status.completed ? "celebration" : "recovery");
  void telemetry.flush();
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
  if (!hostedServicesEnabled) return;
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
  if (!hostedServicesEnabled) return;
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
  if (!hostedServicesEnabled) return;
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
    experience: activeExperience,
    realm: activeRealmId,
    tuningVersion: tuning.version,
    hasSavedGhost: Boolean(
      challengeRunActive
        ? ghostReplay
        : activeRunMode === "daily" || activeRunMode === "daily-ghost"
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
      replaySteps: ghostReplay?.replay.totalSteps ?? 0,
      source: challengeRunActive ? "shared-challenge" : "saved-ghost"
    }, activeRunId);
  }
}

interface StartRunOptions {
  guidedTutorialSource?: "required" | "replay" | null;
  replayOverride?: GlowfinReplayV1 | null;
  forceGhost?: boolean;
  seedOverride?: number;
  experience?: ExpeditionExperience;
  realmId?: RealmId;
}

function startRun(
  mode: GlowfinRunMode = "fresh",
  options: StartRunOptions = {}
): void {
  const guidedTutorialSource = options.guidedTutorialSource ?? null;
  const replayOverride = options.replayOverride ?? null;
  const forceGhost = options.forceGhost ?? false;
  const requestedRealm = options.realmId ?? "moon-garden";
  const day = currentDailyDay();
  const dailyMode = mode === "daily" || mode === "daily-ghost";
  const replay = requestedRealm === "moon-garden"
    ? mode === "ghost"
      ? replayOverride ?? raceableReplay()
      : mode === "daily-ghost"
        ? raceableDailyReplay(day.dayId)
        : null
    : null;
  activeRunMode = mode === "ghost"
    ? replay ? "ghost" : "fresh"
    : mode === "daily-ghost"
      ? replay ? "daily-ghost" : "daily"
      : mode;
  activeRunDayId = dailyMode ? day.dayId : null;
  challengeRunActive = Boolean(mode === "ghost" && replayOverride);
  const seed = replay?.seed ?? options.seedOverride ??
    (dailyMode ? dailySeed(day.dayId) : generateSeed());
  activeExperience = options.experience ?? "classic";
  activeRealmId = requestedRealm;
  realmFeedbackUntilSec = 0;
  lastDuskmawTelegraphKey = null;
  lastDuskmawPhase = null;
  mooncrestCeremonyCuePlayed = false;
  run = new Run(seed, tuning, { realmId: activeRealmId });
  recorder = new ReplayRecorder(run.seed, tuning.version);
  moonflashRecorder = new MoonflashRecorder();
  activeClassification = classifyRunAccess(accessPreferences);
  activeRunId = createRunId();
  simulationSteps = 0;
  ghostRun = replay ? new Run(replay.seed, tuning, { realmId: activeRealmId }) : null;
  ghostReplay = replay ? new ReplayPlayer(replay) : null;
  ghostVisible = Boolean(ghostRun && ghostReplay && (progress.ghostEnabled || forceGhost));
  ghostCompletionReported = false;
  awaitingRestart = false;
  gameplayActive = true;
  completedCompetitiveRun = null;
  if (activeExperience === "chapter-one-r5") {
    expedition.beginRun();
    lumenMotes.start(run.sim.forwardDistance);
    r3Encounters.start(run.sim.forwardDistance, run.sim.elapsedSec);
    r5Completion.reset();
    expedition.updateLumenObjective(lumenMotes.snapshot());
    expedition.updateEncounter(r3Encounters.snapshot());
    document.documentElement.dataset["glowfinLumenObjective"] = "active";
  } else {
    expedition.reset();
    lumenMotes.stop();
    r3Encounters.stop();
    r5Completion.stop();
    view?.setLumenChainFraction(0);
    delete document.documentElement.dataset["glowfinLumenObjective"];
  }
  steering.reset();
  timestep.reset();
  view?.resetTrail();
  view?.setHeroMoment(null);
  view?.setRealm(activeRealmId);
  view?.applyCosmetics(progress.progression.equippedCosmetics);
  moonWell.showTutorialIntro(false);
  moonWell.hide();
  realmHud.setActive(activeRealmId !== "moon-garden");
  if (activeRealmId === "kelp-cathedral") {
    realmHud.updateKelp(run.kelpCathedralStatus, null);
  } else if (activeRealmId === "crystal-trench") {
    realmHud.updateCrystal(run.crystalTrenchStatus, null);
  } else if (activeRealmId === "leviathan-graveyard") {
    realmHud.updateDuskmaw(run.duskmawStatus, null);
  }
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
  document.documentElement.dataset["glowfinScreen"] = "run";
  document.documentElement.dataset["glowfinMode"] = activeExperience;
  document.documentElement.dataset["glowfinRealm"] = activeRealmId;
  tutorialSessionSource = activeRunMode === "fresh" &&
      activeExperience === "classic" &&
      activeRealmId === "moon-garden"
    ? guidedTutorialSource
    : null;
  firstRunTutorial = tutorialSessionSource
    ? new FirstRunTutorial()
    : null;
  tutorialStep = firstRunTutorial?.step ?? null;
  tutorialCompleteAtSec = null;
  moonWell.showTutorial(
    tutorialStep ? tutorialPresentation(tutorialStep) : null
  );
  if (firstRunTutorial) {
    haptics.play("tutorial-step");
    telemetry.track("tutorial_start", {
      source: tutorialSessionSource ?? "required",
      tutorialVersion: GUIDED_TUTORIAL_VERSION
    }, activeRunId);
  }
  if (activeRealmId === "kelp-cathedral") {
    telemetry.track("realm_start", {
      realm: activeRealmId,
      revision: 4,
      seed: run.seed,
      previousRescues: progress.realms.kelpCathedral.rescues,
      relicFound: progress.realms.kelpCathedral.relicPages.includes("kelp-cathedral-page-1"),
    }, activeRunId);
  } else if (activeRealmId === "crystal-trench") {
    telemetry.track("realm_start", {
      realm: activeRealmId,
      revision: 4,
      slice: "mirror-current-r3",
      seed: run.seed,
      previousCompletions: progress.realms.crystalTrench.completions,
      bestTimeSec: progress.realms.crystalTrench.bestTimeSec ?? 0,
      cleanCompletions: progress.realms.crystalTrench.cleanCompletions,
    }, activeRunId);
  } else if (activeRealmId === "leviathan-graveyard") {
    telemetry.track("realm_start", {
      realm: activeRealmId,
      revision: 1,
      slice: "duskmaw-pursuit-r1",
      seed: run.seed,
      reviewRoute: v44ReviewRoute,
      integrationRoute: v45IntegrationRoute,
      previousVictories: leviathanGraveyardProgress(progress.realms).victories,
      mooncrestCovenant: leviathanGraveyardProgress(progress.realms).mooncrestCovenant,
      persistence: v45IntegrationRoute ? "enabled" : "disabled",
    }, activeRunId);
  }
  reportRunStart();
  publishCertificationState();
}

function startExpedition(): void {
  telemetry.track("expedition_start", {
    mission: CHAPTER_ONE_MISSION.id,
    chapter: CHAPTER_ONE_MISSION.chapter,
    revision: CHAPTER_ONE_MISSION.revision,
    objective: CHAPTER_ONE_MISSION.objective,
    seed: CHAPTER_ONE_MISSION.seed
  });
  startRun("fresh", {
    seedOverride: CHAPTER_ONE_MISSION.seed,
    experience: "chapter-one-r5"
  });
}

expedition.onMissionSelected(() => {
  telemetry.track("expedition_briefing", {
    mission: CHAPTER_ONE_MISSION.id,
    chapter: CHAPTER_ONE_MISSION.chapter,
    revision: CHAPTER_ONE_MISSION.revision
  });
});

expedition.onStart(startExpedition);

expedition.onBack(() => {
  telemetry.track("expedition_briefing_close", {
    mission: CHAPTER_ONE_MISSION.id,
    chapter: CHAPTER_ONE_MISSION.chapter
  });
});

const LUMEN_TELEMETRY_MILESTONES = new Set([1, 3, 6, 8, 12]);

function updateLumenMotes(motion: LumenMotionSample): LumenMoteSnapshot {
  if (activeExperience !== "chapter-one-r5") return lumenMotes.snapshot();
  const events = lumenMotes.step(motion);
  const snapshot = lumenMotes.snapshot();
  const changed = events.collected.length > 0 ||
    events.brokenChain > 0 ||
    events.objectiveCompleted ||
    events.fullChainReached;

  view?.setLumenChainFraction(lumenChainIntensity(snapshot.currentChain));
  document.documentElement.dataset["glowfinLumenObjective"] =
    snapshot.objectiveComplete ? "complete" : "active";
  if (changed) expedition.updateLumenObjective(snapshot);

  for (const pickup of events.collected) {
    audio.playLumenMote(pickup.chain);
    haptics.play(
      pickup.chain % LUMEN_OBJECTIVE_CHAIN_TARGET === 0
        ? "lumen-chain"
        : "lumen-mote"
    );
    expedition.showLumenPickup(pickup);
    if (
      pickup.bestChain === pickup.chain &&
      LUMEN_TELEMETRY_MILESTONES.has(pickup.bestChain)
    ) {
      telemetry.track("objective_progress", {
        objective: "follow-light-lumen-chain",
        action: "collect",
        chain: pickup.chain,
        bestChain: pickup.bestChain,
        target: LUMEN_OBJECTIVE_CHAIN_TARGET,
        collected: snapshot.collected,
        moteScore: pickup.totalScore,
        revision: CHAPTER_ONE_MISSION.revision
      }, activeRunId);
    }
  }

  if (events.brokenChain > 0) {
    expedition.showChainBreak(events.brokenChain);
  }
  if (events.fullChainReached) {
    haptics.play("lumen-chain");
    expedition.showFullChain();
  }
  if (events.objectiveCompleted) {
    audio.playLumenMote(snapshot.bestChain, true);
    haptics.play("lumen-chain");
    telemetry.track("objective_complete", {
      objective: "follow-light-lumen-chain",
      target: LUMEN_OBJECTIVE_CHAIN_TARGET,
      bestChain: snapshot.bestChain,
      collected: snapshot.collected,
      elapsedSec: motion.elapsedSec,
      moteScore: snapshot.score,
      seed: run.seed,
      revision: CHAPTER_ONE_MISSION.revision
    }, activeRunId);
  }
  return snapshot;
}

function r3EventsChanged(events: R3StepEvents): boolean {
  return events.beatChangedTo !== null ||
    events.relicResolved !== null ||
    events.rescueLightCollected > 0 ||
    events.rescueLightReturned ||
    events.miriRescued ||
    events.raceGateCollected > 0 ||
    events.raceGateReturned ||
    events.raceCompleted;
}

function updateR3Encounters(motion: LumenMotionSample): void {
  const lumen = updateLumenMotes(motion);
  if (activeExperience !== "chapter-one-r5") return;
  const events = r3Encounters.step({
    ...motion,
    collisionCount: run.collisionCount,
    lumen,
  });
  const snapshot = r3Encounters.snapshot();
  if (r3EventsChanged(events) || simulationSteps % 15 === 0) {
    expedition.updateEncounter(snapshot);
  }

  if (events.beatChangedFrom && events.beatChangedTo) {
    telemetry.track("signature_obstacle", {
      content: "version41-r3",
      encounter: events.beatChangedTo,
      phase: "start",
      planHash: R3_PLAN_HASH,
    }, activeRunId);
  }
  if (events.relicResolved) {
    const found = events.relicResolved === "found";
    haptics.play(found ? "milestone" : "lumen-mote");
    if (found) audio.playLumenMote(8, true);
    expedition.showEncounterFeedback(
      found ? "Moonseed Fragment discovered" : "Safe current chosen · mission continues",
    );
  }
  if (events.rescueLightCollected > 0) {
    audio.playLumenMote(events.rescueLightCollected + 3,
      events.rescueLightCollected === R3_RESCUE_LIGHT_TARGET);
    haptics.play(
      events.rescueLightCollected === R3_RESCUE_LIGHT_TARGET
        ? "milestone"
        : "lumen-mote",
    );
    expedition.showEncounterFeedback(
      events.miriRescued
        ? "Miri is free"
        : `Rescue Light ${events.rescueLightCollected}/${R3_RESCUE_LIGHT_TARGET}`,
    );
  } else if (events.rescueLightReturned) {
    expedition.showEncounterFeedback("Missed Rescue Light returns ahead");
  }
  if (events.raceGateCollected > 0) {
    audio.playLumenMote(events.raceGateCollected + 5,
      events.raceGateCollected === R3_RACE_GATE_TARGET);
    haptics.play("lumen-mote");
    expedition.showEncounterFeedback(
      `Race Gate ${events.raceGateCollected}/${R3_RACE_GATE_TARGET}`,
    );
  } else if (events.raceGateReturned) {
    expedition.showEncounterFeedback("Missed Race Gate returns ahead");
  }
  if (events.raceCompleted) {
    audio.playLumenMote(12, true);
    haptics.play("milestone");
    expedition.showEncounterFeedback("Glowfin finishes ahead of Neri");
    telemetry.track("objective_complete", {
      objective: "race-neri",
      raceGates: snapshot.raceGates,
      outcome: "glowfin-ahead",
      planHash: R3_PLAN_HASH,
    }, activeRunId);
    r5Completion.startAfterR3({
      ...motion,
      collisionCount: run.collisionCount,
    });
    expedition.updateCompletion(r5Completion.snapshot());
  }
}

function r5EventsChanged(events: R5StepEvents): boolean {
  return events.beatChangedTo !== null ||
    events.currentBreakCollected > 0 ||
    events.currentBreakReturned ||
    events.chaseCompleted ||
    events.finishReturned ||
    events.finishReached ||
    events.restorationCompleted;
}

function recordExpeditionCompletion(): void {
  const lumen = lumenMotes.snapshot();
  const r3 = r3Encounters.snapshot();
  const r5 = r5Completion.snapshot();
  const result = expeditionProgressRepository.recordCompletion({
    claimId: activeRunId,
    planHash: R5_PLAN_HASH,
    primaryObjective: r3.r3Complete && r5.r5Complete,
    relicFound: r3.relicFound,
    bestLumenChain: lumen.bestChain,
    miriRescued: r3.miriRescued,
    neriFinishGap: Math.max(0, r3.raceGap),
    currentBreaks: r5.currentBreaks,
    cleanChase: r5.cleanChase,
    moonWellRestored: r5.moonWellRestored,
  });
  expeditionProgress = result.progress;
  moonWell.setExpeditionState(expeditionProgress);
  telemetry.track("reward_granted", {
    domain: "expedition",
    mission: CHAPTER_ONE_MISSION.id,
    marks: result.newlyCompletedMarks.join(","),
    relics: result.newlyDiscoveredRelics.join(","),
    moonWellRestored: result.newlyRestoredMoonWell,
    duplicatePrevented: result.duplicatePrevented,
    planHash: R5_PLAN_HASH,
  }, activeRunId);
}

function updateR5Completion(motion: LumenMotionSample): void {
  if (activeExperience !== "chapter-one-r5") return;
  const events = r5Completion.step({
    ...motion,
    collisionCount: run.collisionCount,
  });
  const snapshot = r5Completion.snapshot();
  if (r5EventsChanged(events) || simulationSteps % 15 === 0) {
    expedition.updateCompletion(snapshot);
  }

  if (events.currentBreakCollected > 0) {
    const complete = events.currentBreakCollected === R5_CURRENT_BREAK_TARGET;
    audio.playLumenMote(events.currentBreakCollected + 8, complete);
    haptics.play(complete ? "milestone" : "lumen-mote");
    expedition.showEncounterFeedback(
      `Current Break ${events.currentBreakCollected}/${R5_CURRENT_BREAK_TARGET}`,
    );
  } else if (events.currentBreakReturned) {
    expedition.showEncounterFeedback("Missed Current Break returns ahead");
  }
  if (events.chaseCompleted) {
    expedition.showEncounterFeedback(
      snapshot.cleanChase
        ? "Duskmaw current broken · clean chase"
        : "Duskmaw current broken",
    );
  }
  if (events.finishReached) {
    haptics.play("milestone");
    expedition.showEncounterFeedback("Ceremonial Moon Well current reached");
  } else if (events.finishReturned) {
    expedition.showEncounterFeedback("Moon Well ring returns ahead");
  }
  if (events.restorationCompleted) {
    recordExpeditionCompletion();
    haptics.play("milestone");
    audio.playLumenMote(14, true);
    view?.setHeroMoment("celebration");
    expedition.showEncounterFeedback("Moon Well restored · Chapter 1 complete");
    telemetry.track("objective_complete", {
      objective: "restore-moon-well",
      mission: CHAPTER_ONE_MISSION.id,
      cleanChase: snapshot.cleanChase,
      relicFound: r3Encounters.snapshot().relicFound,
      planHash: R5_PLAN_HASH,
    }, activeRunId);
    run.requestEnd("expedition-complete");
  }
}

moonWell.onDive(() => {
  telemetry.track("tap_to_dive", {
    firstRun: !progress.onboarding.firstRunCompleted,
    tutorialRequired: !guidedTutorialComplete
  });
  startRun("fresh");
});

moonWell.onKelpCathedral(() => {
  telemetry.track("realm_entry", {
    realm: "kelp-cathedral",
    source: "moon-well",
    rescues: progress.realms.kelpCathedral.rescues,
    relicFound: progress.realms.kelpCathedral.relicPages.includes("kelp-cathedral-page-1"),
  });
  startRun("fresh", { realmId: "kelp-cathedral" });
});

moonWell.onCrystalTrench(() => {
  if (!isCrystalTrenchUnlocked(progress.realms)) {
    telemetry.track("realm_entry", {
      realm: "crystal-trench",
      source: "moon-well",
      locked: true,
      unlockRequirement: "realm-kelp-rescue",
    });
    return;
  }
  telemetry.track("realm_entry", {
    realm: "crystal-trench",
    source: "moon-well",
    slice: "mirror-current-r3",
    completions: progress.realms.crystalTrench.completions,
    cleanCompletions: progress.realms.crystalTrench.cleanCompletions,
  });
  startRun("fresh", { realmId: "crystal-trench" });
});

moonWell.onDuskmaw(() => {
  const unlocked = isLeviathanGraveyardUnlocked(progress.realms);
  if (!unlocked && !v44ReviewRoute) {
    telemetry.track("realm_entry", {
      realm: "leviathan-graveyard",
      source: "moon-well",
      locked: true,
      unlockRequirement: "crystal-trench-win",
    });
    return;
  }
  telemetry.track("realm_entry", {
    realm: "leviathan-graveyard",
    source: "moon-well",
    slice: "duskmaw-pursuit-r1",
    reviewRoute: v44ReviewRoute,
    integrationRoute: v45IntegrationRoute,
    previousVictories: leviathanGraveyardProgress(progress.realms).victories,
  });
  startRun("fresh", { realmId: "leviathan-graveyard" });
});

moonWell.onTideSprint(() => {
  telemetry.track("tide_sprint_entry", {
    source: "moon-well",
    bestFinishSec: progress.tideSprint.bestFinishSec ?? -1,
    bestGhost: Boolean(progress.ghostEnabled && progress.tideSprint.bestGhost)
  });
  void telemetry.flush();
  window.location.assign(new URL("tide-sprint/", document.baseURI).href);
});

moonWell.onTutorialStart(() => {
  const source = guidedTutorialComplete ? "replay" : "required";
  tutorialIntroDismissed = true;
  startRun("fresh", { guidedTutorialSource: source });
});

moonWell.onTutorialSkip(() => {
  if (firstRunTutorial) {
    telemetry.track("tutorial_skip", {
      source: "in-run",
      step: tutorialStep ?? "unknown",
      tutorialVersion: GUIDED_TUTORIAL_VERSION
    }, activeRunId);
    firstRunTutorial = null;
    tutorialStep = null;
    tutorialCompleteAtSec = null;
    tutorialSessionSource = null;
    moonWell.showTutorial(null);
    return;
  }
  tutorialIntroDismissed = true;
  moonWell.showTutorialIntro(false);
  telemetry.track("tutorial_skip", {
    source: "intro",
    step: "intro",
    tutorialVersion: GUIDED_TUTORIAL_VERSION
  });
});

moonWell.onChallenge(() => {
  const challenge = activeChallenge;
  if (!challenge) return;
  telemetry.track("share_challenge_start", {
    division: challenge.clip.classification.division,
    replaySteps: challenge.clip.replay.totalSteps
  });
  void telemetry.flush();
  startRun("ghost", {
    replayOverride: challenge.clip.replay,
    forceGhost: true
  });
});

moonWell.onOpenPanel((panel) => {
  view?.applyCosmetics(progress.progression.equippedCosmetics);
  moonWell.setWardrobeFeedback("");
  refreshMoonWell();
  moonWell.showPanel(panel);
  telemetry.track("hub_view", { panel });
});

moonWell.onBack(() => {
  view?.applyCosmetics(progress.progression.equippedCosmetics);
  moonWell.setWardrobeFeedback("");
  moonWell.showPanel("home");
  telemetry.track("hub_view", { panel: "home" });
});

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
  if (awaitingRestart || moonWell.isOpen) {
    telemetry.track("daily_entry", {
      source: moonWell.isOpen ? "moon-well" : "post-run"
    });
    startRun("daily");
  }
});

hud.onDiveAgain(() => {
  if (!awaitingRestart) return;
  if (activeExperience === "chapter-one-r5") {
    startExpedition();
  } else if (
    activeRealmId === "kelp-cathedral" &&
    isCrystalTrenchUnlocked(progress.realms)
  ) {
    telemetry.track("realm_entry", {
      realm: "crystal-trench",
      source: "realm-one-complete",
      slice: "mirror-current-r3",
    });
    startRun("fresh", { realmId: "crystal-trench" });
  } else if (activeRealmId !== "moon-garden") {
    startRun("fresh", { realmId: activeRealmId });
  } else {
    startRun("fresh");
  }
});

hud.onOpenHub(() => {
  if (awaitingRestart) showMoonWell("home");
});

async function loadCompetitiveBoard(state: CompletedCompetitiveRun): Promise<void> {
  if (!hostedServicesEnabled) {
    hud.setLeaderboard(null, "offline");
    return;
  }
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
  if (!hostedServicesEnabled) {
    hud.setSubmitState("unavailable");
    return;
  }
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
  if (!hostedServicesEnabled) {
    hud.setShareState("unavailable");
    return;
  }
  if (state.shareUrl) {
    if (typeof navigator.share === "function") {
      void navigator.share({
        title: "Beat My Current · Glowfin",
        text: state.clip.caption,
        url: state.shareUrl
      }).catch(() => navigator.clipboard?.writeText(state.shareUrl ?? ""));
    } else {
      void navigator.clipboard?.writeText(state.shareUrl);
    }
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
    const challengeUrl = moonflashChallengeUrl(published);
    state.shareUrl = challengeUrl;
    hud.setShareState("shared");
    const media = await state.media?.catch(() => null) ?? null;
    telemetry.track("share_clip_result", {
      published: true,
      division: state.classification.division,
      renderedMedia: Boolean(media)
    }, state.runId);
    telemetry.track("service_result", {
      service: "moonflash",
      operation: "publish",
      success: true
    }, state.runId);
    try {
      if (typeof navigator.share === "function") {
        const shareData: ShareData = {
          title: "Glowfin Moonflash",
          text: `${state.clip?.caption ?? "A Glowfin Moonflash"} · Beat my current`,
          url: challengeUrl
        };
        if (
          media &&
          typeof navigator.canShare === "function" &&
          navigator.canShare({ files: [media] })
        ) {
          shareData.files = [media];
        }
        await navigator.share(shareData);
      } else {
        await navigator.clipboard?.writeText(challengeUrl);
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
  if (!awaitingRestart && !moonWell.isOpen) return;
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
  if (!awaitingRestart && !moonWell.isOpen) return;
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
  if (!awaitingRestart && !moonWell.isOpen) return;
  accessPreferences = accessPreferenceRepository.toggleHighContrast();
  updateProgressUi();
  telemetry.track("accessibility_change", {
    setting: "high-contrast",
    enabled: accessPreferences.highContrast,
    nextDivision: classifyRunAccess(accessPreferences).division
  });
  void telemetry.flush();
});

hud.onHapticsToggle(() => {
  if (!awaitingRestart && !moonWell.isOpen) return;
  hapticsEnabled = hapticPreferenceRepository.toggle();
  haptics.setEnabled(hapticsEnabled);
  updateProgressUi();
  if (hapticsEnabled) haptics.play("setting");
  telemetry.track("accessibility_change", {
    setting: "haptics",
    enabled: hapticsEnabled,
    nativeAvailable: wrapperRuntime.isNative
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

moonWell.onWardrobePreview((cosmeticId) => {
  const cosmetic = cosmeticDefinition(cosmeticId);
  if (!cosmetic || tideProgressForXp(progress.progression.tideXp).level < cosmetic.unlockLevel) return;
  const preview: CosmeticLoadout = {
    ...progress.progression.equippedCosmetics,
    [cosmetic.category]: cosmetic.id
  };
  view?.applyCosmetics(preview);
  moonWell.setWardrobeFeedback(`Previewing ${cosmetic.name}. Purchase and equip remain separate.`);
  telemetry.track("cosmetic_preview", {
    cosmetic: cosmetic.id,
    category: cosmetic.category,
    owned: progress.progression.ownedCosmetics.includes(cosmetic.id)
  });
});

moonWell.onWardrobeAction((cosmeticId) => {
  const cosmetic = cosmeticDefinition(cosmeticId);
  if (!cosmetic) return;
  if (!progress.progression.ownedCosmetics.includes(cosmetic.id)) {
    const firstPurchase = !progress.onboarding.firstPurchaseCompleted;
    const result = progressRepository.purchaseCosmetic(cosmetic.id);
    progress = result.progress;
    updateProgressUi();
    moonWell.showPanel("wardrobe");
    moonWell.setWardrobeFeedback(result.status === "purchased"
      ? `${cosmetic.name} purchased for ◇ ${result.spentPearls}. Tap Equip to wear it.`
      : result.status === "insufficient-pearls"
        ? `You need ◇ ${cosmetic.pricePearls} for ${cosmetic.name}. Dive again to gather more.`
        : result.status === "locked"
          ? `${cosmetic.name} becomes available at Tide ${cosmetic.unlockLevel}.`
          : `${cosmetic.name} is already in your collection.`);
    telemetry.track("cosmetic_purchase", {
      cosmetic: cosmetic.id,
      category: cosmetic.category,
      result: result.status,
      price: cosmetic.pricePearls,
      firstPurchase: firstPurchase && result.status === "purchased"
    });
    if (result.status === "purchased") haptics.play("purchase");
    void telemetry.flush();
    if (result.status === "purchased") void synchronizeCloudProgress();
    return;
  }

  const result = progressRepository.equipCosmetic(cosmetic.id);
  progress = result.progress;
  updateProgressUi();
  moonWell.showPanel("wardrobe");
  view?.applyCosmetics(progress.progression.equippedCosmetics);
  moonWell.setWardrobeFeedback(result.equipped
    ? `${cosmetic.name} equipped. Cosmetics never change score or steering.`
    : `${cosmetic.name} could not be equipped.`);
  telemetry.track("cosmetic_equip", {
    category: cosmetic.category,
    cosmetic: cosmetic.id,
    tideLevel: tideProgressForXp(progress.progression.tideXp).level,
    firstEquip: result.firstEquip
  });
  if (result.equipped) haptics.play("equip");
  void telemetry.flush();
  if (result.equipped) void synchronizeCloudProgress();
});

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
      consentSource: "settings",
      nativeWrapper: wrapperRuntime.isNative,
      platform: wrapperRuntime.platform
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

let lastFrameMs = performance.now();
const interruptionStartedAt = new Map<RuntimeInterruptionReason, number>();

function pauseForInterruption(
  reason: RuntimeInterruptionReason,
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
  reason: RuntimeInterruptionReason,
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

let nativeAppInterrupted = false;
void installCapacitorShell({
  onActiveChange(active) {
    if (!active) {
      nativeAppInterrupted = true;
      haptics.setActive(false);
      void audio.setAppActive(false);
      pauseForInterruption("native-app", "capacitor-app-state");
      return;
    }
    if (!nativeAppInterrupted) return;
    nativeAppInterrupted = false;
    haptics.setActive(true);
    resumeFromInterruption("native-app", "capacitor-app-state");
    void audio.setAppActive(!document.hidden);
    void hydrateDailyClock();
  },
  onOpenUrl(url) {
    void loadMoonflashChallenge(url);
  }
}, wrapperRuntime).catch(() => {
  telemetry.track("error", { source: "capacitor-shell", phase: "startup" });
  void telemetry.flush();
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
      rebuiltView.setRealm(activeRealmId);
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
  if (gameplayActive && !awaitingRestart) timestep.advance(frameSec * run.timeScale, (dt) => {
    if (awaitingRestart) return;
    const command = steering.getTarget();
    const previousDistance = run.sim.forwardDistance;
    const previousLateral = run.sim.lateralPosition;
    recorder.record(command);
    const events = run.step(dt, command);
    simulationSteps += 1;
    const expeditionMotion: LumenMotionSample = {
      fromDistance: previousDistance,
      toDistance: run.sim.forwardDistance,
      fromLateral: previousLateral,
      toLateral: run.sim.lateralPosition,
      elapsedSec: run.sim.elapsedSec,
      gates: run.gates,
      laneHalfWidth: tuning.lane.halfWidth,
      creatureRadius: tuning.lane.creatureRadius
    };
    updateR3Encounters(expeditionMotion);
    updateR5Completion(expeditionMotion);

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
      haptics.play(encounter.kind === "collision" ? "collision" : "near-miss");
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
    for (const event of events.signatureEvents) {
      telemetry.track(
        event.kind === "living-world"
          ? "living_world_event"
          : "signature_obstacle",
        {
          kind: event.kind,
          verb: event.verb,
          livingKind: event.livingKind ?? null,
          distance: event.distance,
          tier: event.tier,
          template: event.templateId,
          rewardScore: event.rewardScore ?? 0,
          direction: event.direction ?? 0
        },
        activeRunId
      );
    }
    for (const event of events.realmEvents) {
      realmHud.showEvent(event);
      realmFeedbackUntilSec = run.sim.elapsedSec + 2.4;
      const duskmawAttack =
        event.kind === "shadow-sweep" ||
        event.kind === "vacuum-wake-enter" ||
        event.kind === "ruins-collapse";
      const duskmawSpecial =
        event.kind === "minion-hit" ||
        event.kind === "minion-defeated" ||
        event.kind === "lumen-bloom" ||
        event.kind === "moonbone-vault";
      if (event.success && !duskmawAttack && !duskmawSpecial) {
        haptics.play(
          event.kind === "moon-seal"
            ? "moon-seal"
            : event.kind === "current-break"
              ? "current-break"
              : event.kind === "vacuum-wake-enter"
                ? "threat-pulse"
                : event.kind === "manta-rescue" ||
          event.kind === "relic-page" ||
          event.kind === "trench-threshold" ||
          event.kind === "mirror-race-start" ||
          event.kind === "mirror-race-win"
            ? "milestone"
            : "lumen-mote",
        );
      }
      if (duskmawAttack) {
        audio.playDuskmawCue("threat-pulse");
        haptics.play("threat-pulse");
      } else if (event.kind === "minion-hit" && event.success) {
        audio.playDuskmawCue("minion-hit");
        haptics.play("minion-hit");
      } else if (event.kind === "minion-defeated" && event.success) {
        audio.playDuskmawCue("minion-defeat");
        haptics.play("minion-defeat");
      } else if (event.kind === "lumen-bloom" && event.success) {
        audio.playDuskmawCue("lumen-bloom");
        haptics.play("lumen-bloom");
      } else if (event.kind === "current-break" && event.success) {
        audio.playDuskmawCue("current-break");
        const regenerationAge = run.sim.elapsedSec - run.duskmawStatus.lastRegenerationSec;
        if (regenerationAge >= 0 && regenerationAge < 0.1) {
          audio.playDuskmawCue("boss-regenerate");
          haptics.play("boss-regenerate");
        }
      } else if (event.kind === "moonbone-vault" && event.success) {
        audio.playDuskmawCue("vault-charge");
        haptics.play("vault-charge");
      } else if (event.kind === "moon-seal" && event.success) {
        audio.playDuskmawCue("grand-blast");
        haptics.play("grand-blast");
      }
      if (
        event.kind === "manta-rescue" ||
        event.kind === "relic-page" ||
        event.kind === "trench-threshold" ||
        event.kind === "mirror-race-start" ||
        event.kind === "mirror-race-win"
      ) {
        audio.playLumenMote(
          event.kind === "manta-rescue"
            ? 12
            : event.kind === "mirror-race-win"
              ? 14
              : event.kind === "mirror-race-start"
                ? 11
                : event.kind === "trench-threshold"
                  ? 10
                  : 8,
          true,
        );
      }
      telemetry.track(
        event.kind === "manta-rescue"
          ? "realm_rescue"
          : event.kind === "relic-page"
            ? "realm_relic"
            : "realm_feature",
        {
          realm: activeRealmId,
          kind: event.kind,
          verb: event.verb,
          distance: event.distance,
          tier: event.tier,
          template: event.templateId,
          success: event.success,
          direction: event.direction ?? 0,
          relicPage: event.relicPageId ?? "none",
        },
        activeRunId,
      );
    }
    if (
      activeRealmId !== "moon-garden" &&
      realmFeedbackUntilSec > 0 &&
      run.sim.elapsedSec >= realmFeedbackUntilSec
    ) {
      realmHud.hideFeedback();
      realmFeedbackUntilSec = 0;
    }
    if (firstRunTutorial) {
      const previousStep = firstRunTutorial.step;
      const nextStep = firstRunTutorial.update({
        elapsedSec: run.sim.elapsedSec,
        steering: command,
        gateCleared: events.signatureEvents.some((event) => (
          event.kind === "safe-route" ||
          event.kind === "moonflash-route" ||
          event.kind === "shutter-pass"
        )),
        nearMiss:
          events.encounters.some((encounter) => encounter.kind === "near-miss") ||
          events.signatureEvents.some((event) => event.kind === "moonflash-route"),
        collision: events.encounters.some((encounter) => encounter.kind === "collision")
      });
      if (nextStep !== previousStep) {
        tutorialStep = nextStep;
        moonWell.showTutorial(tutorialPresentation(nextStep));
        haptics.play(nextStep === "complete" ? "milestone" : "tutorial-step");
        telemetry.track("tutorial_step", {
          step: nextStep,
          elapsedSec: run.sim.elapsedSec
        }, activeRunId);
        if (nextStep === "complete") {
          tutorialCompleteAtSec = run.sim.elapsedSec;
          guidedTutorialRepository.completeCurrent();
          guidedTutorialComplete = true;
          progress = progressRepository.completeTutorial();
          updateProgressUi();
          telemetry.track("tutorial_complete", {
            elapsedSec: run.sim.elapsedSec,
            collisionSeen: run.collisionCount > 0,
            nearMisses: run.scoring.nearMissCount,
            source: tutorialSessionSource ?? "required",
            tutorialVersion: GUIDED_TUTORIAL_VERSION
          }, activeRunId);
          void telemetry.flush();
          void synchronizeCloudProgress();
        }
      }
      if (
        tutorialCompleteAtSec !== null &&
        run.sim.elapsedSec >= tutorialCompleteAtSec + 3
      ) {
        firstRunTutorial = null;
        tutorialStep = null;
        tutorialCompleteAtSec = null;
        tutorialSessionSource = null;
        moonWell.showTutorial(null);
      }
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
      gameplayActive = false;
      if (activeExperience === "chapter-one-r5") {
        expedition.finishRun();
        lumenMotes.stop();
        r3Encounters.stop();
        r5Completion.stop();
        activeView.setLumenChainFraction(0);
      }
      firstRunTutorial = null;
      tutorialStep = null;
      tutorialCompleteAtSec = null;
      tutorialSessionSource = null;
      moonWell.showTutorial(null);
      document.documentElement.dataset["glowfinScreen"] = "post-run";
      if (activeRealmId === "kelp-cathedral") {
        const realmStatus = run.kelpCathedralStatus;
        const realmRecord = progressRepository.recordKelpCathedralRun({
          runId: activeRunId,
          elapsedSec: run.sim.elapsedSec,
          rescuedManta: realmStatus.rescuedManta,
          relicPageFound: realmStatus.relicPageFound,
          masteredVerbs: realmStatus.masteredVerbs,
        }, {
          collisions: run.collisionCount,
        });
        realmHud.setActive(false);
        telemetry.track(
          realmStatus.rescuedManta ? "realm_complete" : "realm_abandon",
          {
            realm: activeRealmId,
            endReason: run.endReason,
            elapsedSec: run.sim.elapsedSec,
            collisions: run.collisionCount,
            rescuedManta: realmStatus.rescuedManta,
            relicPageFound: realmStatus.relicPageFound,
            frondWindows: realmStatus.frondWindowsCleared,
            currentTunnels: realmStatus.currentTunnelsEntered,
          },
          activeRunId,
        );
        presentRealmResult(realmRecord, {
          kind: "kelp-cathedral",
          title: "Kelp Cathedral",
          rescuedManta: realmStatus.rescuedManta,
          relicPageFound: realmStatus.relicPageFound,
          crystalTrenchUnlocked: realmRecord.crystalTrenchUnlocked,
        });
        return;
      } else if (activeRealmId === "crystal-trench") {
        const realmStatus = run.crystalTrenchStatus;
        const realmRecord = progressRepository.recordCrystalTrenchRun({
          runId: activeRunId,
          elapsedSec: run.sim.elapsedSec,
          completed: realmStatus.raceWon,
          cleanPerformance: realmStatus.cleanPerformance,
          masteredVerbs: realmStatus.masteredVerbs,
        }, {
          collisions: run.collisionCount,
        });
        realmHud.setActive(false);
        telemetry.track(
          realmStatus.raceWon ? "realm_complete" : "realm_abandon",
          {
            realm: activeRealmId,
            slice: "mirror-current-r3",
            endReason: run.endReason,
            elapsedSec: run.sim.elapsedSec,
            collisions: run.collisionCount,
            thresholdCrossed: realmStatus.thresholdCrossed,
            thresholdRetries: realmStatus.thresholdRetries,
            prismPulsesCleared: realmStatus.prismPulsesCleared,
            platesCleared: realmStatus.platesCleared,
            plateRetries: realmStatus.plateRetries,
            raceWon: realmStatus.raceWon,
            raceAttempts: realmStatus.raceAttempts,
            raceLosses: realmStatus.raceLosses,
            finishMarginSec: realmStatus.finishMarginSec ?? 0,
            cleanPerformance: realmStatus.cleanPerformance,
          },
          activeRunId,
        );
        presentRealmResult(realmRecord, {
          kind: "crystal-trench",
          title: "Crystal Trench",
          thresholdCrossed: realmStatus.thresholdCrossed,
          prismPulsesCleared: realmStatus.prismPulsesCleared,
          platesCleared: realmStatus.platesCleared,
          raceWon: realmStatus.raceWon,
          raceAttempts: realmStatus.raceAttempts,
          cleanPerformance: realmStatus.cleanPerformance,
        });
        return;
      } else if (activeRealmId === "leviathan-graveyard") {
        const realmStatus = run.duskmawStatus;
        realmHud.setActive(false);
        const persistenceEnabled = v45IntegrationRoute;
        telemetry.track(
          realmStatus.completed ? "realm_complete" : "realm_abandon",
          {
            realm: activeRealmId,
            slice: "duskmaw-pursuit-r1",
            endReason: run.endReason,
            elapsedSec: run.sim.elapsedSec,
            collisions: run.collisionCount,
            currentBreaks: realmStatus.currentBreaks,
            currentBreakTarget: realmStatus.currentBreakTarget,
            minionsDefeated: realmStatus.minionsDefeated,
            recoveryItems: realmStatus.recoveryItemsCollected,
            bossHealth: realmStatus.bossHealth,
            bossRegenerations: realmStatus.bossRegenerations,
            joinedStrikes: realmStatus.joinedStrikes,
            auralisFreed: realmStatus.auralisFreed,
            captures: realmStatus.captures,
            recoveredFirstCapture: realmStatus.recoveredFirstCapture,
            moonSealReached: realmStatus.moonSealReached,
            cleanPerformance: realmStatus.cleanPerformance,
            persistence: persistenceEnabled ? "enabled" : "disabled",
          },
          activeRunId,
        );
        if (persistenceEnabled) {
          const realmRecord = progressRepository.recordLeviathanGraveyardRun({
            runId: activeRunId,
            elapsedSec: run.sim.elapsedSec,
            completed: realmStatus.completed,
            cleanPerformance: realmStatus.cleanPerformance,
            masteredVerbs: realmStatus.masteredVerbs,
          }, {
            collisions: run.collisionCount,
          });
          presentRealmResult(realmRecord, {
            kind: "duskmaw-pursuit",
            title: "Leviathan Graveyard",
            integrated: true,
            completed: realmStatus.completed,
            currentBreaks: realmStatus.currentBreaks,
            currentBreakTarget: realmStatus.currentBreakTarget,
            captures: realmStatus.captures,
            cleanPerformance: realmStatus.cleanPerformance,
          }, realmRecord.mooncrestCovenantNewlyAwarded
            ? ["Auralis Mooncrest Covenant"]
            : []);
          return;
        }
        presentDuskmawResult();
        return;
      }
      if (activeExperience === "chapter-one-r5") {
        const completed = run.endReason === "expedition-complete";
        completedCompetitiveRun = null;
        hud.hideGhostGap();
        hud.setSubmitState("unavailable");
        hud.setShareState("unavailable");
        hud.setRewardedOffer(null);
        hud.showExpeditionResult({
          completed,
          seconds: run.sim.elapsedSec,
          collisions: run.collisionCount,
          relicsDiscovered: expeditionProgress.discoveredRelics.length,
          primaryMark: expeditionProgress.completionMarks.primaryObjective,
          relicMark: expeditionProgress.completionMarks.hiddenRelic,
          cleanMark: expeditionProgress.completionMarks.cleanPerformance,
          moonWellRestored: expeditionProgress.moonWellRestored,
        });
        telemetry.track(completed ? "expedition_complete" : "expedition_abandon", {
          mission: CHAPTER_ONE_MISSION.id,
          revision: CHAPTER_ONE_MISSION.revision,
          endReason: run.endReason,
          elapsedSec: run.sim.elapsedSec,
          collisions: run.collisionCount,
          r3PlanHash: R3_PLAN_HASH,
          r5PlanHash: R5_PLAN_HASH,
          currentBreaks: r5Completion.snapshot().currentBreaks,
          moonWellRestored: expeditionProgress.moonWellRestored,
        }, activeRunId);
        void telemetry.flush();
        return;
      }
      const summary: ReplaySummary = {
        score: run.scoring.score,
        elapsedSec: run.sim.elapsedSec,
        forwardDistance: run.sim.forwardDistance,
        nearMisses: run.scoring.nearMissCount,
        collisions: run.collisionCount
      };
      const replay = recorder.finish(summary);
      const progressionReplay = activeRealmId === "moon-garden" ? replay : null;
      const clip = activeRealmId === "moon-garden"
        ? moonflashRecorder.finish(replay, activeClassification)
        : null;
      const day = currentDailyDay();
      const rewardDay = activeRunDayId ?? day.dayId;
      const firstReward = !progress.onboarding.firstRewardSeen;
      const record = progressRepository.recordRun(summary, progressionReplay, {
        runId: activeRunId,
        mode: activeRunMode,
        dayId: rewardDay,
        calendarRewardsAllowed: day.status !== "clock-rollback",
        competitiveRecordsAllowed: activeRealmId === "moon-garden"
      });
      progress = record.progress;
      updateProgressUi();
      if (
        record.newBest ||
        (firstReward && record.retention.totalPearls > 0) ||
        record.retention.tideLevelAfter > record.retention.tideLevelBefore ||
        record.retention.unlockedCosmetics.length > 0 ||
        record.retention.completedObjectives.length > 0 ||
        record.retention.dailyAwarded
      ) {
        haptics.play("milestone");
      }
      activeView.setHeroMoment(
        record.retention.unlockedCosmetics.length > 0
          ? "unlock"
          : record.newBest || record.retention.completedObjectives.length > 0 || record.retention.dailyAwarded
            ? "celebration"
            : "recovery"
      );
      telemetry.track("run_end", {
        seed: run.seed,
        mode: activeRunMode,
        experience: activeExperience,
        realm: activeRealmId,
        score: summary.score,
        elapsedSec: summary.elapsedSec,
        distance: summary.forwardDistance,
        nearMisses: summary.nearMisses,
        collisions: summary.collisions,
        newBest: record.newBest,
        replaySaved: record.replaySaved,
        replaySegments: progressionReplay?.commands.length ?? 0,
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
      const rendererStats = activeView.stats();
      const deviceNavigator = navigator as Navigator & { deviceMemory?: number };
      telemetry.track("device_health", deviceHealthPayload({
        runtime: wrapperRuntime,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        deviceMemoryGb: deviceNavigator.deviceMemory ?? null,
        hardwareConcurrency: navigator.hardwareConcurrency,
        online: navigator.onLine !== false,
        quality: quality.current,
        sample: perf.sample(rendererStats.drawCalls, rendererStats.triangles, activeView.gpuName)
      }), activeRunId);
      if (firstReward && record.retention.totalPearls > 0) {
        telemetry.track("first_reward", {
          pearls: record.retention.totalPearls,
          tideXp: record.retention.runReward.xp
        }, activeRunId);
      }
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
      const submission: LeaderboardSubmissionV1 | null = progressionReplay ? {
        schemaVersion: 1,
        runId: endedRunId,
        mode: activeRunMode,
        dayId: dailyCompetitive ? rewardDay : null,
        replay: progressionReplay,
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
        shareUrl: null,
        media: clip ? renderMoonflashMedia(clip).catch(() => null) : null
      };
      completedCompetitiveRun = competitiveState;
      hud.hideGhostGap();
      const dailyGhost = activeRunMode === "daily" || activeRunMode === "daily-ghost"
        ? raceableDailyReplay(rewardDay)
        : null;
      const savedGhost = activeRealmId === "moon-garden"
        ? dailyGhost ?? raceableReplay()
        : null;
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
          leaderboardDivision: activeClassification.division,
        }
      );
      hud.setSubmitState(submission ? "ready" : "unavailable");
      hud.setShareState(clip ? "ready" : "unavailable");
      hud.setRewardedOffer(null);
      if (activeRealmId === "moon-garden") {
        void loadCompetitiveBoard(competitiveState);
      } else {
        hud.setLeaderboard(null, "empty");
      }
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

  publishCertificationState();

  const lightFraction = run.light / tuning.light.max;
  const lumenPresentation = activeExperience === "chapter-one-r5"
    ? lumenMotes.presentation(
      run.sim.forwardDistance,
      run.gates,
      tuning.lane.halfWidth,
      tuning.lane.creatureRadius
    )
    : [];
  activeView.render(
    run.sim,
    run.gates,
    lightFraction,
    run.sim.elapsedSec,
    frameSec,
    ghostVisible && ghostRun ? ghostRun.sim : null,
    run.activeLivingWorldEvents,
    lumenPresentation,
    activeExperience === "chapter-one-r5"
      ? r3Encounters.presentation()
      : null,
    activeExperience === "chapter-one-r5"
      ? r5Completion.presentation()
      : null,
    activeRealmId === "kelp-cathedral"
      ? run.kelpCathedralStatus.rescuedManta
      : false,
    activeRealmId === "crystal-trench"
      ? run.crystalTrenchStatus
      : null,
    activeRealmId === "leviathan-graveyard"
      ? run.duskmawStatus
      : null,
  );
  if (activeRealmId === "kelp-cathedral") {
    const nextRealmPlan = run.gates.find((gate) => (
      gate.realmPlan && gate.distance > run.sim.forwardDistance + 3
    ))?.realmPlan ?? null;
    realmHud.updateKelp(run.kelpCathedralStatus, nextRealmPlan);
  } else if (activeRealmId === "crystal-trench") {
    const nextRealmPlan = run.gates.find((gate) => (
      gate.realmPlan && gate.distance > run.sim.forwardDistance + 3
    ))?.realmPlan ?? null;
    realmHud.updateCrystal(run.crystalTrenchStatus, nextRealmPlan);
  } else if (activeRealmId === "leviathan-graveyard") {
    const nextGate = run.gates.find((gate) => (
      gate.realmPlan && gate.distance > run.sim.forwardDistance + 3
    ));
    const nextPriorityGate = run.gates.find((gate) => (
      gate.realmPlan &&
      gate.realmPlan.verb !== "guided-rescue-current" &&
      gate.distance > run.sim.forwardDistance + 3 &&
      gate.distance <= run.sim.forwardDistance + 132
    ));
    const nextRealmPlan = nextPriorityGate?.realmPlan ?? nextGate?.realmPlan ?? null;
    const mouthAttack = nextPriorityGate && (
      nextPriorityGate.realmPlan?.verb === "minion-assault" ||
      nextPriorityGate.realmPlan?.verb === "shadow-sweep" ||
      nextPriorityGate.realmPlan?.verb === "vacuum-wake" ||
      nextPriorityGate.realmPlan?.verb === "ruins-collapse"
    );
    if (mouthAttack && nextPriorityGate?.realmPlan) {
      const telegraphKey = `${nextPriorityGate.realmPlan.verb}:${nextPriorityGate.distance.toFixed(2)}`;
      if (telegraphKey !== lastDuskmawTelegraphKey) {
        lastDuskmawTelegraphKey = telegraphKey;
        audio.playDuskmawCue("threat-pulse");
        haptics.play("threat-pulse");
        telemetry.track("duskmaw_mouth_attack_telegraph", {
          verb: nextPriorityGate.realmPlan.verb,
          distance: nextPriorityGate.distance,
          reactionDistance: nextPriorityGate.distance - run.sim.forwardDistance,
        }, activeRunId);
      }
    }
    const duskmawStatus = run.duskmawStatus;
    if (duskmawStatus.phase !== lastDuskmawPhase) {
      if (duskmawStatus.phase === "auralis-catchup") {
        audio.playDuskmawCue("vault-break");
        haptics.play("vault-break");
      } else if (duskmawStatus.phase === "moonlink-battle") {
        audio.playDuskmawCue("auralis-arrival");
        haptics.play("auralis-arrival");
      }
      telemetry.track("duskmaw_phase", {
        phase: duskmawStatus.phase,
        minionsDefeated: duskmawStatus.minionsDefeated,
        bossHealth: duskmawStatus.bossHealth,
        auralisFreed: duskmawStatus.auralisFreed,
      }, activeRunId);
      lastDuskmawPhase = duskmawStatus.phase;
    }
    if (
      duskmawStatus.phase === "complete" &&
      duskmawStatus.phaseElapsedSec >= 5.15 &&
      !mooncrestCeremonyCuePlayed
    ) {
      mooncrestCeremonyCuePlayed = true;
      audio.playDuskmawCue("moon-seal");
      haptics.play("moon-seal");
      telemetry.track("duskmaw_phase", {
        phase: "mooncrest-ceremony",
        joinedStrikes: duskmawStatus.joinedStrikes,
        bossHealth: duskmawStatus.bossHealth,
      }, activeRunId);
    }
    realmHud.updateDuskmaw(duskmawStatus, nextRealmPlan);
  }
  if (ghostVisible && ghostRun) {
    hud.updateGhostGap(run.sim.forwardDistance, ghostRun.sim.forwardDistance);
  } else {
    hud.hideGhostGap();
  }
  hud.setSignatureCue(signatureCueForRun());
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

function installOfflineRecovery(): void {
  if (
    !SERVICE_WORKER_CACHING_CERTIFIED ||
    !hostedServicesEnabled ||
    wrapperRuntime.isNative ||
    !("serviceWorker" in navigator)
  ) return;
  void navigator.serviceWorker.register("/glowfin-sw.js", { scope: "/" }).catch(() => {
    // The local-first game remains playable even when a browser or host blocks
    // service-worker installation; the visible network status still explains
    // which hosted features are unavailable.
  });
}

async function start(): Promise<void> {
  setStartupProgress(48, "Building the first Moon-Garden district…");
  if (!runtimeSupport.supported || !view) {
    publishRuntimeState();
    startupProgress.dataset["ready"] = "true";
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
    startupProgress.dataset["ready"] = "true";
    return;
  }
  if (!activeView) {
    publishRuntimeState();
    startupProgress.dataset["ready"] = "true";
    return;
  }

  setStartupProgress(88, "Opening the Moon Well…");

  telemetry.track("load_complete", {
    loadMs: performance.now(),
    quality: quality.current,
    productionAssets: activeView.productionAssetStatus().glowfin === "glb",
    rendererGeneration,
    reducedMotion: accessPreferences.reducedMotion,
    highContrast: accessPreferences.highContrast,
    nativeWrapper: wrapperRuntime.isNative,
    platform: wrapperRuntime.platform,
    hapticsEnabled
  });
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

  showMoonWell("home");
  setStartupProgress(100, navigator.onLine === false
    ? "Ready offline · hosted boards will return with the network."
    : "Ready to dive.");
  startupProgress.dataset["ready"] = "true";
  installOfflineRecovery();
  requestAnimationFrame(frame);
}

void start();

declare global {
  interface Window {
    __GLOWFIN_RUNTIME__?: RuntimeLifecycleSnapshot;
    __GLOWFIN_CERTIFICATION__?: GlowfinCertificationSnapshot;
  }
}
